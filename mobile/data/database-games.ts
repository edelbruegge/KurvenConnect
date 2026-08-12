// The database-backed match type used by GamesContext/GameSelector (context/games-context.tsx,
// components/stadion/game-selector.tsx) — distinct from data/games.ts's `Game` (the old two-entry
// local seed list), which now only serves as GamesContext's dev/offline fallback. Every field that
// isn't guaranteed on a real fixture is nullable; the UI omits a line rather than inventing a
// value (no fabricated scores, dates, competitions, or attendance).

export type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt?: string;
  kickoffAtIso?: string;
  competition?: string;
  // The real numeric matchday (e.g. 3, not "3. Spieltag") -- see
  // supabase/functions/sync-football-games/index.ts's mapping from OpenLigaDB's
  // group.groupOrderID, and public.games.matchday (integer).
  matchday?: number;
  season?: string;
  leagueShortcut?: string;
  externalHomeTeamId?: string;
  externalAwayTeamId?: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  stadiumId: string | null;
  stadiumName?: string;
  stadiumCity?: string;
};
