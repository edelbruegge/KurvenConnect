import type { Game } from '@/data/database-games';
import { formatGermanKickoff } from '@/lib/map-supabase-stadium';

// A row from `supabase.from('games').select('..., stadiums(name, city)')`. PostgREST returns the
// embedded relation as an object for a to-one foreign key (games.stadium_id -> stadiums.id), but
// defensively typed as possibly-array too, matching the same embedded-relation pattern already
// used in components/stadion/game-selector.tsx before this step.
export type SupabaseGameRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  competition: string | null;
  matchday: number | null;
  season: string | null;
  league_shortcut: string | null;
  external_home_team_id: string | null;
  external_away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  stadium_id: string | null;
  stadiums: { name: string; city: string } | { name: string; city: string }[] | null;
};

export function mapSupabaseGameRow(row: SupabaseGameRow): Game {
  const stadium = Array.isArray(row.stadiums) ? row.stadiums[0] : row.stadiums;

  return {
    id: row.id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at ? formatGermanKickoff(row.kickoff_at) : undefined,
    kickoffAtIso: row.kickoff_at ?? undefined,
    competition: row.competition ?? undefined,
    matchday: row.matchday ?? undefined,
    season: row.season ?? undefined,
    leagueShortcut: row.league_shortcut ?? undefined,
    externalHomeTeamId: row.external_home_team_id ?? undefined,
    externalAwayTeamId: row.external_away_team_id ?? undefined,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: row.status,
    stadiumId: row.stadium_id,
    stadiumName: stadium?.name,
    stadiumCity: stadium?.city,
  };
}

/** "2026" -> "2026/27" -- the season key an external source uses (e.g. OpenLigaDB's `season` path
 * segment) is a single start year; the app never shows that bare year on its own, always the
 * "YYYY/YY" German season label. Falls back to the raw value for anything that isn't a plain
 * 4-digit year, rather than crashing or guessing. */
export function formatSeasonLabel(season: string): string {
  const startYear = Number.parseInt(season, 10);
  if (!/^\d{4}$/.test(season) || Number.isNaN(startYear)) {
    return season;
  }
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}/${endYearShort}`;
}
