// supabase/functions/match-lock-status/index.ts
//
// For the currently authenticated app user, determines whether their favorite team
// (profiles.favorite_team_id) currently has a live match in progress -- used by
// mobile/context/match-lock-context.tsx to gate the entire app behind a fullscreen lock screen
// while that's true.
//
// NOT deployed as part of this step. To deploy and run later:
//   `supabase functions deploy match-lock-status`
//   (verify_jwt = true, the platform default -- see supabase/config.toml's explicit entry for this
//   function. No secrets need to be set; this function only ever uses the anon key + the caller's
//   own forwarded JWT, and calls the public, unauthenticated OpenLigaDB API.)
//
// Auth model (deliberately different from both existing functions, which are service-role/
// shared-secret and never reachable by a normal signed-in user -- see their own file headers):
// this function IS meant to be called by a normal signed-in app user, using their own Supabase
// session. The caller's Authorization header (a real user JWT) is forwarded into a Supabase client
// built with the ANON key, so every query below runs AS that user under RLS -- never a
// service-role client, never a client-supplied user id or team id. `profiles` (readable by any
// authenticated user, see 001_auth_profiles.sql) and `games` (SELECT-only for `authenticated`, see
// 20260813130000_add_stadiums_and_matchday_history.sql) already grant everything this function
// reads; nothing here needs elevated privileges, and nothing here ever writes to public.games (see
// "No write-back" below).
//
// "Is a match currently live" -- definition and reasoning:
// OpenLigaDB exposes no live/in-play field (only matchIsFinished, see
// supabase/functions/sync-football-games/index.ts's own "Status mapping" comment) and the app's
// own periodic sync (football-current-sync, every 15 minutes, see
// 20260814120000_schedule_football_sync.sql) is too slow to reflect a match having just kicked off
// or just finished. So this function does NOT trust public.games.status alone, and does NOT lock
// off a bare kickoff+duration guess either. Instead:
//   1. Find a *candidate* match from public.games (cheap, already-synced data): one involving the
//      caller's favorite_team_id, whose kickoff_at is in the past but within MATCH_LOCK_FAILSAFE_MS
//      of now. No candidate -> definitely not locked, no external call at all (Vorgabe 8: no
//      unnecessary OpenLigaDB traffic on a normal day with no match).
//   2. If the last-synced status is already 'finished', trust it immediately -- no external call
//      needed (the periodic sync is slow to update, but a 'finished' it already reported is real).
//   3. If `now` is already past kickoff + MATCH_LOCK_FAILSAFE_MS, fail open immediately without
//      calling OpenLigaDB at all -- this is the hard ceiling that stops a stuck/never-updated
//      "not finished" record from locking the app forever (Vorgabe 12).
//   4. Otherwise, and only then, fetch that one specific match directly from OpenLigaDB
//      (getmatchdata/{matchID}, the real single-match endpoint) for its current matchIsFinished --
//      this is the freshest possible truth, independent of the 15-minute sync cadence.
// MATCH_LOCK_FAILSAFE_MS = 180 minutes: 90 regular minutes + halftime + stoppage time, with enough
// margin left over for extra time + penalties in cup competitions the app may support later. A
// single, central, documented constant, not derived from anything guessed per-request.
//
// Fail-open, always: any ambiguity anywhere in this function (profile lookup fails, games query
// fails, OpenLigaDB is unreachable/times out/returns malformed data) resolves to
// `{ locked: false, reason: 'unknown' }` with HTTP 200 -- never an error that could be mistaken for
// "locked". The only non-200 response this function ever returns is 401, and only for a genuinely
// missing/invalid caller JWT (not logged in at all) -- Vorgabe 5/9/10/11.
//
// No write-back: this function only ever reads public.games, never writes to it (even though it
// may learn a fresher matchIsFinished than the last sync). Writing back would mean duplicating
// sync-football-games's own score/status mapping logic (mapMatchToGamesRow) a second time for a
// single row -- deliberately not done here to avoid a second, parallel interpretation of the same
// OpenLigaDB data; the next scheduled sync run converges public.games on its own.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';
import { fetchOpenLigaJson, OPENLIGADB_BASE_URL, type OpenLigaMatch } from '../_shared/openligadb.ts';

const MATCH_LOCK_FAILSAFE_MS = 180 * 60 * 1000;
const OPENLIGADB_FETCH_TIMEOUT_MS = 6000;

type MatchLockReason = 'live_match' | 'no_match' | 'unknown';

type MatchLockGame = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: string;
};

type MatchLockResponse = {
  locked: boolean;
  reason: MatchLockReason;
  game: MatchLockGame | null;
  checkedAt: string;
};

type CandidateGameRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string | null;
  external_match_id: string;
};

function jsonResponse(body: MatchLockResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

function unknownResponse(checkedAt: string): Response {
  return jsonResponse({ locked: false, reason: 'unknown', game: null, checkedAt });
}

function noMatchResponse(checkedAt: string): Response {
  return jsonResponse({ locked: false, reason: 'no_match', game: null, checkedAt });
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) {
    return preflight;
  }

  const checkedAt = new Date().toISOString();

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    console.error('[match-lock-status] missing SUPABASE_URL/SUPABASE_ANON_KEY');
    return unknownResponse(checkedAt);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  // Runs as the calling user, never service-role -- every query below is subject to that user's
  // own RLS, and the caller can never supply their own user id or team id.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('favorite_team_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[match-lock-status] profile lookup failed', profileError.message);
    return unknownResponse(checkedAt);
  }

  const favoriteTeamId = (profile?.favorite_team_id as string | null) ?? null;

  if (!favoriteTeamId) {
    return noMatchResponse(checkedAt);
  }

  const nowMs = Date.now();
  const windowStartIso = new Date(nowMs - MATCH_LOCK_FAILSAFE_MS).toISOString();

  const { data: candidates, error: candidatesError } = await supabase
    .from('games')
    .select('id, home_team, away_team, kickoff_at, status, external_match_id')
    .or(`external_home_team_id.eq.${favoriteTeamId},external_away_team_id.eq.${favoriteTeamId}`)
    .eq('external_source', 'openligadb')
    .not('external_match_id', 'is', null)
    .not('kickoff_at', 'is', null)
    .lte('kickoff_at', checkedAt)
    .gte('kickoff_at', windowStartIso)
    .order('kickoff_at', { ascending: false })
    .limit(1);

  if (candidatesError) {
    console.error('[match-lock-status] candidate game query failed', candidatesError.message);
    return unknownResponse(checkedAt);
  }

  const candidate = (candidates?.[0] as CandidateGameRow | undefined) ?? null;

  if (!candidate) {
    return noMatchResponse(checkedAt);
  }

  // The last sync already reported this one as finished -- trust it, no need to ask OpenLigaDB
  // again for a result that's already known.
  if (candidate.status === 'finished') {
    return noMatchResponse(checkedAt);
  }

  const kickoffMs = new Date(candidate.kickoff_at).getTime();

  // Hard failsafe ceiling: past this point a still-"not finished" row can never lock the app on
  // its own, regardless of what OpenLigaDB might still say.
  if (Number.isNaN(kickoffMs) || nowMs >= kickoffMs + MATCH_LOCK_FAILSAFE_MS) {
    return noMatchResponse(checkedAt);
  }

  try {
    const liveMatch = await fetchOpenLigaJson<OpenLigaMatch>(
      `${OPENLIGADB_BASE_URL}/getmatchdata/${candidate.external_match_id}`,
      OPENLIGADB_FETCH_TIMEOUT_MS,
    );

    if (liveMatch.matchIsFinished) {
      return noMatchResponse(checkedAt);
    }

    return jsonResponse({
      locked: true,
      reason: 'live_match',
      game: {
        id: candidate.id,
        homeTeamName: candidate.home_team,
        awayTeamName: candidate.away_team,
        kickoff: candidate.kickoff_at,
      },
      checkedAt,
    });
  } catch (error) {
    console.error('[match-lock-status] OpenLigaDB live lookup failed', error instanceof Error ? error.message : error);
    return unknownResponse(checkedAt);
  }
});
