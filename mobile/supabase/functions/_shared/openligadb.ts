// supabase/functions/_shared/openligadb.ts
//
// The single-match subset of OpenLigaDB's response shape, plus a timeout-wrapped fetch helper --
// extracted from supabase/functions/sync-football-games/index.ts's own OpenLigaMatch type and
// fetchJson() (same field names, same AbortController-timeout behavior, same "normalize every
// failure mode into one thrown Error" reasoning) so match-lock-status reads OpenLigaDB the exact
// same way the sync function already does, rather than inventing a second interpretation of the
// same API.
//
// Deliberately NOT used by sync-football-games itself -- that function is already deployed and
// working against real data, and Edge Functions run on Deno (not covered by the app's own
// `npx tsc`), so refactoring it to import from here couldn't be verified automatically. The
// duplication this leaves behind is two copies of the same small type + fetch wrapper, not two
// different interpretations of OpenLigaDB's data (every field name/semantic matches exactly).

export const OPENLIGADB_BASE_URL = 'https://api.openligadb.de';

export type OpenLigaTeam = {
  teamId: number;
  teamName: string;
};

export type OpenLigaMatch = {
  matchID: number;
  matchDateTimeUTC: string;
  team1: OpenLigaTeam;
  team2: OpenLigaTeam;
  matchIsFinished: boolean;
};

// Wraps fetch with a hard timeout and normalizes every failure mode (HTTP error status, network
// failure, timeout, invalid JSON body) into a single thrown Error, so callers only need one
// try/catch. Mirrors sync-football-games/index.ts's fetchJson() exactly.
export async function fetchOpenLigaJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
