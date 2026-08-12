// supabase/functions/sync-football-games/index.ts
//
// Syncs real fixtures from OpenLigaDB (https://api.openligadb.de) into public.games, so the app's
// GameSelector always reads from Supabase and never calls an external API directly (see
// context/games-context.tsx / components/stadion/game-selector.tsx). stadium_id is deliberately
// never set here -- see the "Stadium linking" section below.
//
// NOT deployed as part of this step. To deploy and run later:
//   1. `supabase functions deploy sync-football-games --no-verify-jwt`
//      (supabase/config.toml also sets `verify_jwt = false` for this function specifically -- the
//      flag and the config entry are redundant with each other, kept both so a deploy from a
//      machine without the config.toml override still comes up unauthenticated-by-default the way
//      this function needs, see the "Access control" section below for why)
//   2. `supabase secrets set FOOTBALL_SYNC_SECRET=<a random, generated secret>`
//      (optionally also SYNC_LEAGUES_CONFIG, see "Configuration" below)
//   3. Trigger it yourself (admin-only, e.g.
//      `curl -X POST <function-url> -H "x-football-sync-secret: <secret>"`) or wire it to a
//      scheduled Supabase Cron job (Dashboard -> Integrations -> Cron) that POSTs to the function
//      URL with the same header. There is intentionally no button anywhere in the app that calls
//      this -- see "Access control" below.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to every Supabase Edge
// Function at runtime -- neither needs to be set manually, and the service_role key is never
// present in the app/client bundle. Only this server-side, secret-gated function may ever write
// to public.games; authenticated app users only ever get `select` (see
// 20260813130000_add_stadiums_and_matchday_history.sql / 20260813140000_prepare_real_match_data.sql).
//
// Configuration:
//   FOOTBALL_SYNC_SECRET -- the shared secret a caller must send back as the x-football-sync-secret
//     header (see "Access control" below). Required; the function refuses to run without it.
//   SYNC_LEAGUES_CONFIG -- a JSON array of `{ "leagueShortcut": string, "season": string }`, e.g.
//     `[{"leagueShortcut":"bl1","season":"2026"},{"leagueShortcut":"bl2","season":"2026"}]`. Each
//     entry is fetched via OpenLigaDB's getmatchdata/{leagueShortcut}/{season} endpoint, which
//     returns the *entire* season's fixtures (every matchday) in one call, not just the next
//     match -- this function relies on that, it never calls a "next match"-style endpoint. Defaults
//     to bl1/bl2/bl3 for the current calendar year if unset. Verified live against
//     https://api.openligadb.de/getavailableleagues (2026-08): bl1 = 1. Bundesliga, bl2 =
//     2. Bundesliga, bl3 = 3. Liga, dfb = DFB-Pokal. Never invented -- if a different competition
//     is needed later, look it up the same way rather than guessing. A per-league season lets e.g.
//     a cup competition run on a different season key than the league competitions, without a code
//     change -- nothing about season/league is hardcoded in any UI component (see
//     lib/map-supabase-game.ts's formatSeasonLabel and context/games-context.tsx's
//     currentSeasonGames, both derived from whatever `season` value is actually stored).
//
// Stadium linking: two independent, priority-ordered resolution paths, neither ever guessed from a
// team/city display string alone. 1) OpenLigaDB's location.locationStadium is free text, not a
// reliable key into public.stadiums, and not always present -- resolved via an exact, normalized
// lookup against public.stadium_aliases (see 20260813150000_refine_stadium_reference_data.sql).
// 2) When no location is given at all (verified live: every match in the currently synced
// leagues/season has location = null, a data-availability limit of this OpenLigaDB endpoint, not a
// bug here) -- falls back to the home team's stable external_team_id against
// public.team_stadium_mappings (see 20260813190000_complete_stadium_mapping.sql), a curated,
// research-backed team -> home-stadium table, never a fuzzy/substring match on the team name. The
// alias-based match always wins when both would apply (a specific real match location is more
// trustworthy than a team's *usual* home ground -- cup ties, ground-sharing, stadium closures).
// Still no match from either path -> stadium_id stays NULL, exactly as before. A game with
// stadium_id = NULL still appears in the GameSelector; it just cannot produce a stadium-map visit
// (get_my_visited_stadiums() already requires a non-null stadium_id via its join, so this is safe
// by construction).
//
// Access control: gated by a shared secret header (FOOTBALL_SYNC_SECRET / x-football-sync-secret,
// same pattern as supabase/functions/send-push-notification's own secret), not by requiring an
// authenticated Supabase session -- a scheduled Cron job has no end-user session to present. Since
// this function is never meant to be reachable by a normal signed-in app user at all (not even a
// legitimate one), `verify_jwt` is explicitly disabled for it (supabase/config.toml) so Supabase's
// platform-level JWT check is replaced entirely by this function's own secret check below -- a
// request with a valid user JWT but no/wrong FOOTBALL_SYNC_SECRET is still rejected with 401. This
// must never be called from the mobile/web client; nothing in the app sends this header.
// SUPABASE_SERVICE_ROLE_KEY (below) is a completely separate value, used only for this function's
// own Supabase writes -- it is never accepted as the caller's credential and never sent anywhere.

import { createClient } from 'npm:@supabase/supabase-js@2';

const OPENLIGADB_BASE_URL = 'https://api.openligadb.de';

type LeagueSyncConfig = {
  leagueShortcut: string;
  season: string;
};

function defaultLeagueSyncConfig(): LeagueSyncConfig[] {
  const currentYear = String(new Date().getFullYear());
  return ['bl1', 'bl2', 'bl3'].map((leagueShortcut) => ({ leagueShortcut, season: currentYear }));
}

function parseLeagueSyncConfig(raw: string | undefined): LeagueSyncConfig[] {
  if (!raw) {
    return defaultLeagueSyncConfig();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('SYNC_LEAGUES_CONFIG must be a JSON array');
    }
    return parsed.map((entry) => ({
      leagueShortcut: String(entry.leagueShortcut),
      season: String(entry.season),
    }));
  } catch (error) {
    console.error('[sync-football-games] invalid SYNC_LEAGUES_CONFIG, falling back to default', error);
    return defaultLeagueSyncConfig();
  }
}

type OpenLigaTeam = {
  teamId: number;
  teamName: string;
};

type OpenLigaMatchResult = {
  resultTypeID: number;
  pointsTeam1: number;
  pointsTeam2: number;
};

type OpenLigaMatch = {
  matchID: number;
  matchDateTimeUTC: string;
  leagueName: string;
  // Verified live against api.openligadb.de/getmatchdata/{league}/{season}: `groupName` is a
  // display string ("3. Spieltag"), `groupOrderID` is the real numeric matchday (3) -- this
  // function maps `groupOrderID` to public.games.matchday, never the display string, and never a
  // value derived from the match date or the match's array position.
  group?: { groupName?: string; groupOrderID?: number };
  team1: OpenLigaTeam;
  team2: OpenLigaTeam;
  matchIsFinished: boolean;
  matchResults?: OpenLigaMatchResult[];
  location?: { locationStadium?: string | null; locationCity?: string | null };
};

type GamesUpsertRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  competition: string | null;
  matchday: number | null;
  season: string;
  league_shortcut: string;
  external_home_team_id: string;
  external_away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  stadium_id: string | null;
  external_source: string;
  external_match_id: string;
  last_synced_at: string;
};

// Exact-match normalization only (lowercase, trim, collapse whitespace, strip punctuation) --
// deliberately not a fuzzy/similarity match, see the file header. Two differently-spelled aliases
// for the same real stadium (e.g. "SchücoArena" and "Schueco Arena") must each get their own row
// in public.stadium_aliases; this function does not try to bridge that gap itself.
function normalizeAlias(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    // Combining diacritical marks (U+0300-U+036F), e.g. the combining diaeresis NFKD splits "ü"
    // into (ü -> u + U+0308) -- written as an explicit \uXXXX-\uXXXX escape range, not literal
    // Unicode characters in the class, so this can never be corrupted into an invalid/out-of-order
    // character class by a transport/encoding step between editor and deployed runtime again.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function mapMatchToGamesRow(
  match: OpenLigaMatch,
  config: LeagueSyncConfig,
  stadiumIdByNormalizedAlias: Map<string, string>,
  stadiumIdByExternalTeamId: Map<string, string>,
): GamesUpsertRow {
  // The final result is whichever matchResults entry is present once matchIsFinished is true --
  // OpenLigaDB does not label a single entry as canonical, so the last reported result is used;
  // no score is ever invented for an unfinished match.
  const finalResult = match.matchIsFinished ? match.matchResults?.at(-1) : undefined;
  const locationStadium = match.location?.locationStadium;
  // Priority order: a real, specific match location (via stadium_aliases) always wins over the
  // home team's usual ground; only fall back to the team-based mapping when there's no location
  // to resolve at all. See the "Stadium linking" section above.
  const aliasStadiumId = locationStadium ? stadiumIdByNormalizedAlias.get(normalizeAlias(locationStadium)) : undefined;
  const stadiumId = aliasStadiumId ?? stadiumIdByExternalTeamId.get(String(match.team1.teamId)) ?? null;

  return {
    // Deterministic and stable across re-syncs, independent of the external_source/external_match_id
    // unique index -- so an upsert can key off either `id` or that index with the same outcome.
    id: `openligadb-${match.matchID}`,
    home_team: match.team1.teamName,
    away_team: match.team2.teamName,
    kickoff_at: match.matchDateTimeUTC,
    competition: match.leagueName ?? null,
    matchday: match.group?.groupOrderID ?? null,
    season: config.season,
    league_shortcut: config.leagueShortcut,
    external_home_team_id: String(match.team1.teamId),
    external_away_team_id: String(match.team2.teamId),
    home_score: finalResult?.pointsTeam1 ?? null,
    away_score: finalResult?.pointsTeam2 ?? null,
    status: match.matchIsFinished ? 'finished' : 'scheduled',
    stadium_id: stadiumId,
    external_source: 'openligadb',
    external_match_id: String(match.matchID),
    last_synced_at: new Date().toISOString(),
  };
}

// Constant-time comparison so a wrong guess can't be narrowed down via response-time differences
// from an early-exit `===` compare. Byte length is compared up front (its own early return is
// fine -- the secret's length isn't the sensitive part, its value is), then every byte pair is
// XORed and accumulated so no single mismatching byte position short-circuits the loop.
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);

  if (bytesA.length !== bytesB.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < bytesA.length; i++) {
    mismatch |= bytesA[i] ^ bytesB[i];
  }
  return mismatch === 0;
}

Deno.serve(async (req: Request) => {
  const expectedSecret = Deno.env.get('FOOTBALL_SYNC_SECRET');

  if (!expectedSecret) {
    // Server-side misconfiguration (the secret was never set) -- distinct from an unauthorized
    // caller, and never described further than this generic message.
    console.error('[sync-football-games] missing FOOTBALL_SYNC_SECRET');
    return new Response('Server misconfigured', { status: 500 });
  }

  const providedSecret = req.headers.get('x-football-sync-secret');

  if (!providedSecret || !timingSafeEqualStrings(providedSecret, expectedSecret)) {
    // Generic message either way (missing header vs. wrong value) -- never hints at which case it
    // was, or anything about the expected secret itself.
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[sync-football-games] missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Server misconfigured', { status: 500 });
  }

  const leagueSyncConfigs = parseLeagueSyncConfig(Deno.env.get('SYNC_LEAGUES_CONFIG'));

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Loaded once per run, not once per match: a plain in-memory exact-match lookup built from
  // public.stadium_aliases (external_source='openligadb'). See normalizeAlias/mapMatchToGamesRow.
  const { data: aliasRows, error: aliasError } = await supabase
    .from('stadium_aliases')
    .select('stadium_id, normalized_alias')
    .eq('external_source', 'openligadb');

  if (aliasError) {
    console.error('[sync-football-games] failed to load stadium_aliases', aliasError.message);
    return new Response('Failed to load stadium aliases', { status: 500 });
  }

  const stadiumIdByNormalizedAlias = new Map<string, string>(
    (aliasRows ?? []).map((row) => [row.normalized_alias as string, row.stadium_id as string]),
  );

  // Loaded once per run, same pattern as stadium_aliases above -- see "Stadium linking".
  const { data: teamMappingRows, error: teamMappingError } = await supabase
    .from('team_stadium_mappings')
    .select('external_team_id, stadium_id')
    .eq('external_source', 'openligadb');

  if (teamMappingError) {
    console.error('[sync-football-games] failed to load team_stadium_mappings', teamMappingError.message);
    return new Response('Failed to load team stadium mappings', { status: 500 });
  }

  const stadiumIdByExternalTeamId = new Map<string, string>(
    (teamMappingRows ?? []).map((row) => [row.external_team_id as string, row.stadium_id as string]),
  );

  let totalUpserted = 0;
  const errors: string[] = [];

  for (const config of leagueSyncConfigs) {
    const { leagueShortcut, season } = config;
    // getmatchdata/{leagueShortcut}/{season} (no matchday segment) returns the *entire* season --
    // every matchday in one response, not just the next fixture. That's relied upon here rather
    // than a per-matchday endpoint, so one call already covers the full season import.
    const response = await fetch(`${OPENLIGADB_BASE_URL}/getmatchdata/${leagueShortcut}/${season}`);

    if (!response.ok) {
      errors.push(`${leagueShortcut}/${season}: OpenLigaDB returned ${response.status}`);
      continue;
    }

    const matches = (await response.json()) as OpenLigaMatch[];
    const rows = matches.map((match) => mapMatchToGamesRow(match, config, stadiumIdByNormalizedAlias, stadiumIdByExternalTeamId));

    if (rows.length === 0) {
      continue;
    }

    // Upsert on the deterministic `id` (openligadb-{matchID}) -- equivalent in effect to upserting
    // on the external_source+external_match_id unique index, and also updates the same row if it
    // was ever manually re-keyed. Never touches games without an `openligadb-` id (the two legacy
    // manual entries are untouched by construction).
    const { error } = await supabase.from('games').upsert(rows, { onConflict: 'id' });

    if (error) {
      errors.push(`${leagueShortcut}/${season}: ${error.message}`);
      continue;
    }

    totalUpserted += rows.length;
  }

  return new Response(JSON.stringify({ leagueSyncConfigs, upserted: totalUpserted, errors }), {
    status: errors.length > 0 && totalUpserted === 0 ? 502 : 200,
    headers: { 'content-type': 'application/json' },
  });
});
