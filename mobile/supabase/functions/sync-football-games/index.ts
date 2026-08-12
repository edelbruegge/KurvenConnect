// supabase/functions/sync-football-games/index.ts
//
// Syncs real fixtures from OpenLigaDB (https://api.openligadb.de) into public.games, so the app's
// GameSelector always reads from Supabase and never calls an external API directly (see
// context/games-context.tsx / components/stadion/game-selector.tsx).
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
//      `curl -X POST <function-url> -H "x-football-sync-secret: <secret>" -H "content-type: application/json" -d '{"mode":"current"}'`)
//      or wire it to a scheduled job -- see supabase/migrations/20260814120000_schedule_football_sync.sql
//      (not run remotely as part of this step either) for the pg_cron/pg_net/Vault-based automatic
//      version of exactly this. There is intentionally no button anywhere in the app that calls
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
//     `[{"leagueShortcut":"bl1","season":"2026"},{"leagueShortcut":"bl2","season":"2026"}]`. This is
//     the single, central place league/season is configured -- both sync modes below read the same
//     array, so a future season change (e.g. to "2027") only ever needs to happen here, never
//     hardcoded again in any UI component (see lib/map-supabase-game.ts's formatSeasonLabel and
//     context/games-context.tsx's currentSeasonGames, both derived from whatever `season` value is
//     actually stored). Defaults to bl1/bl2/bl3 for the current calendar year if unset. Verified
//     live against https://api.openligadb.de/getavailableleagues (2026-08): bl1 = 1. Bundesliga,
//     bl2 = 2. Bundesliga, bl3 = 3. Liga, dfb = DFB-Pokal. Never invented -- if a different
//     competition is needed later, look it up the same way rather than guessing.
//
// Sync modes (request body, POST, JSON):
//   {}                    -- same as {"mode":"full"}, kept for backward compatibility with every
//                            existing manual trigger that never sent a body at all.
//   {"mode":"full"}       -- the original behaviour: one getmatchdata/{league}/{season} call per
//                            configured league, the entire season's fixtures in one response.
//   {"mode":"current"}    -- deliberately narrower: getcurrentgroup/{league} (a real OpenLigaDB
//                            endpoint that returns the league's actual current matchday -- never
//                            guessed from today's date) followed by one getmatchdata/{league}/
//                            {season}/{matchday} call per matchday in {current-1, current, current+1}
//                            (clamped to >=1 -- see the note on matchday 0 below), instead of the
//                            full season. Meant to run frequently (e.g. every 15 minutes via cron)
//                            to pick up new results/kickoff changes without re-fetching ~1000 games
//                            every time.
//   any other "mode"      -- 400 with a JSON error body; never silently falls back to full.
// A malformed/unparsable JSON body is treated the same as an empty one (mode "full") rather than
// rejected -- every pre-existing caller sends no body at all, and that must keep working exactly
// as before.
//
// Matchday bounds for "current" mode: verified live that getmatchdata/{league}/{season}/0 does NOT
// return an empty result the way a genuinely out-of-range request should -- it silently returns
// matchday 1's fixtures again (matchday numbers are 1-indexed; there is no matchday 0). Requesting
// a matchday *above* the season's last one was verified to correctly return `[]` with no special
// handling needed. So only the lower bound needs an explicit `>= 1` filter; the upper bound is
// already safe by construction (an empty response contributes nothing to upsert).
//
// Status mapping: OpenLigaDB's matches expose only `matchIsFinished` (boolean) as a reliable state
// signal in every response sampled -- no dedicated "currently live/in-play" field was found. A
// third `live` status was considered (as suggested) but deliberately NOT implemented: inferring it
// from kickoff time + an assumed match duration would be a guess, not a read of real source data,
// which this function avoids everywhere else (see normalizeAlias/stadium linking below). Only
// `scheduled`/`finished` are used, exactly as before.
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
//
// Stadium-ID protection (new): neither resolution path above is guaranteed to produce a value on
// every single sync run (a location string can be present on one run and absent on the next; a
// team might not be in team_stadium_mappings yet). Before upserting, this function now reads back
// the *currently stored* stadium_id for exactly the games about to be touched and only ever
// improves on it: `finalStadiumId = freshlyResolvedId ?? existingStoredId ?? null`. A freshly
// resolved id always wins (it can only add/confirm information); a missing resolution this run
// never regresses an already-valid stored value back to NULL. public.stadiums.name/city are never
// written by this function at all, under any mode -- canonical names can only ever come from a
// migration (see 20260813200000_clean_canonical_stadium_names.sql), never from a raw external venue
// string.
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

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const OPENLIGADB_BASE_URL = 'https://api.openligadb.de';
const FETCH_TIMEOUT_MS = 15000;

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

type SyncMode = 'full' | 'current';

type ParsedMode = { mode: SyncMode } | { error: string };

// Empty/unparsable body -> "full" (see the file header's backward-compatibility note). An
// explicit, recognized mode is used as-is. Anything else is a 400, never a silent fallback.
async function parseSyncMode(req: Request): Promise<ParsedMode> {
  const text = await req.text();
  let body: unknown = {};

  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }

  const rawMode = (body as { mode?: unknown } | null)?.mode;

  if (rawMode === undefined || rawMode === null) {
    return { mode: 'full' };
  }
  if (rawMode === 'full' || rawMode === 'current') {
    return { mode: rawMode };
  }
  return { error: `Invalid "mode": ${JSON.stringify(rawMode)}. Expected "full" or "current".` };
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

// The response shape of getcurrentgroup/{league} -- verified live (2026-08), e.g.
// {"groupName":"1. Spieltag","groupOrderID":1,"groupID":50633} for bl1.
type OpenLigaGroup = {
  groupName: string;
  groupOrderID: number;
  groupID: number;
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
    // into (ü -> u + U+0308). Built via RegExp(String.fromCharCode(...)) rather than a `/[...]/`
    // literal with escape sequences typed directly in source -- a previous round of this project
    // hit a real deployed BOOT_ERROR ("Range out of order in character class") from exactly that
    // literal getting mangled into raw combining-mark characters by an editor/transport step
    // between writing and deploying; constructing the range from explicit numeric char codes at
    // runtime instead makes that whole class of corruption structurally impossible.
    .replace(new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g'), '')
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
  // to resolve at all. See the "Stadium linking" section above. A missing resolution here is not
  // final -- applyStadiumIdProtection (below) may still fill it from the already-stored value.
  const aliasStadiumId = locationStadium ? stadiumIdByNormalizedAlias.get(normalizeAlias(locationStadium)) : undefined;
  const stadiumId = aliasStadiumId ?? stadiumIdByExternalTeamId.get(String(match.team1.teamId)) ?? null;

  return {
    // Deterministic and stable across re-syncs, independent of the external_source/external_match_id
    // unique index -- so an upsert can key off either `id` or that index with the same outcome.
    // Never changes for a given real fixture, in either sync mode -- this is what keeps
    // public.games.id stable across repeated current/full syncs (see the file header).
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

// Never lets a freshly computed `null` (missing location AND missing team mapping on *this*
// particular run) overwrite an already-stored, valid stadium_id -- see "Stadium-ID protection" in
// the file header. Only touches rows whose freshly resolved value is null; every other row is
// returned unchanged (a fresh resolution always wins, it can only add information).
function applyStadiumIdProtection(rows: GamesUpsertRow[], existingStadiumIdById: Map<string, string | null>): GamesUpsertRow[] {
  return rows.map((row) => {
    if (row.stadium_id != null) {
      return row;
    }
    const existing = existingStadiumIdById.get(row.id);
    return existing ? { ...row, stadium_id: existing } : row;
  });
}

async function fetchExistingStadiumIds(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase.from('games').select('id, stadium_id').in('id', ids);
  if (error) {
    // Non-fatal: falls back to "no protection this run" for these rows rather than aborting the
    // whole league sync -- a freshly resolved stadium_id is still applied normally either way,
    // this only affects the (rarer) case of a missing resolution on this specific run.
    console.error('[sync-football-games] failed to load existing stadium_id values, protection skipped for this batch', error.message);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.id as string, row.stadium_id as string | null]));
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

// Wraps fetch with a hard timeout (OpenLigaDB has no SLA and a hung connection would otherwise
// block the whole sync run indefinitely) and normalizes every failure mode -- HTTP error status,
// network failure, timeout, invalid JSON body -- into a single thrown Error, so callers only need
// one try/catch instead of separately handling each case.
async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${url} timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMatchesForConfig(config: LeagueSyncConfig, mode: SyncMode): Promise<OpenLigaMatch[]> {
  if (mode === 'full') {
    // getmatchdata/{leagueShortcut}/{season} (no matchday segment) returns the *entire* season --
    // every matchday in one response, not just the next fixture.
    return fetchJson<OpenLigaMatch[]>(`${OPENLIGADB_BASE_URL}/getmatchdata/${config.leagueShortcut}/${config.season}`);
  }

  // current: the league's actual current matchday, never guessed from today's date (see file
  // header). getcurrentgroup takes no season parameter -- it always reflects whatever OpenLigaDB
  // itself currently considers "current" for that league, which is expected to line up with the
  // configured season as long as SYNC_LEAGUES_CONFIG itself is kept current (see Requirement 22).
  const currentGroup = await fetchJson<OpenLigaGroup>(`${OPENLIGADB_BASE_URL}/getcurrentgroup/${config.leagueShortcut}`);
  const currentMatchday = currentGroup.groupOrderID;

  // {previous, current, next}, deduplicated and filtered to >=1 -- matchday 0 does not exist and
  // (verified live) is NOT safely rejected by the API, it silently re-returns matchday 1's data;
  // a matchday past the season's last one is safe as-is (verified: returns `[]`), so no upper
  // bound check is needed.
  const matchdaysToFetch = [...new Set([currentMatchday - 1, currentMatchday, currentMatchday + 1])].filter((matchday) => matchday >= 1);

  const matchesPerMatchday = await Promise.all(
    matchdaysToFetch.map((matchday) =>
      fetchJson<OpenLigaMatch[]>(`${OPENLIGADB_BASE_URL}/getmatchdata/${config.leagueShortcut}/${config.season}/${matchday}`),
    ),
  );

  return matchesPerMatchday.flat();
}

type LeagueSyncResult = {
  fetched: number;
  upserted: number;
  error?: string;
};

// One league's full sync cycle: fetch (mode-dependent) -> map -> protect existing stadium_id ->
// upsert. Wrapped in its own try/catch by the caller so one league's failure (HTTP error, network
// failure, timeout, invalid JSON, upsert error) never stops the others -- see Requirement 10.
async function syncLeague(
  supabase: SupabaseClient,
  config: LeagueSyncConfig,
  mode: SyncMode,
  stadiumIdByNormalizedAlias: Map<string, string>,
  stadiumIdByExternalTeamId: Map<string, string>,
): Promise<LeagueSyncResult> {
  const matches = await fetchMatchesForConfig(config, mode);

  if (matches.length === 0) {
    return { fetched: 0, upserted: 0 };
  }

  const rows = matches.map((match) => mapMatchToGamesRow(match, config, stadiumIdByNormalizedAlias, stadiumIdByExternalTeamId));
  const existingStadiumIdById = await fetchExistingStadiumIds(
    supabase,
    rows.map((row) => row.id),
  );
  const protectedRows = applyStadiumIdProtection(rows, existingStadiumIdById);

  // Upsert on the deterministic `id` (openligadb-{matchID}) -- equivalent in effect to upserting
  // on the external_source+external_match_id unique index, and also updates the same row if it
  // was ever manually re-keyed. Never touches games without an `openligadb-` id (the two legacy
  // manual entries are untouched by construction). Same row -> same id in every mode, so a
  // "current" sync updating a game that a "full" sync also knows about always lands on the exact
  // same public.games row (see Requirement 5/6/7).
  const { error } = await supabase.from('games').upsert(protectedRows, { onConflict: 'id' });

  if (error) {
    return { fetched: matches.length, upserted: 0, error: error.message };
  }

  return { fetched: matches.length, upserted: protectedRows.length };
}

Deno.serve(async (req: Request) => {
  const startedAt = new Date().toISOString();

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

  const parsedMode = await parseSyncMode(req);
  if ('error' in parsedMode) {
    return new Response(JSON.stringify({ error: parsedMode.error }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const mode = parsedMode.mode;

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

  let totalFetched = 0;
  let totalUpserted = 0;
  const errors: string[] = [];

  for (const config of leagueSyncConfigs) {
    try {
      const result = await syncLeague(supabase, config, mode, stadiumIdByNormalizedAlias, stadiumIdByExternalTeamId);
      totalFetched += result.fetched;
      totalUpserted += result.upserted;
      if (result.error) {
        errors.push(`${config.leagueShortcut}/${config.season}: ${result.error}`);
      }
    } catch (error) {
      // Network failure, timeout, invalid JSON, or any other unexpected error for this league --
      // caught here so it can never take down the other configured leagues (Requirement 10).
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${config.leagueShortcut}/${config.season}: ${message}`);
    }
  }

  const finishedAt = new Date().toISOString();

  return new Response(
    JSON.stringify({
      mode,
      leagues: leagueSyncConfigs.length,
      fetched: totalFetched,
      upserted: totalUpserted,
      errors,
      startedAt,
      finishedAt,
    }),
    {
      status: errors.length > 0 && totalUpserted === 0 ? 502 : 200,
      headers: { 'content-type': 'application/json' },
    },
  );
});
