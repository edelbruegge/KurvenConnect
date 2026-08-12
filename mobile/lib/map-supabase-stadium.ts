import type { Matchday, Stadium } from '@/data/stadiums';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

/** "02.08.2026, 15:30 Uhr" — a match's kickoff is a calendar date, not a "vor X Std."-style
 * relative timestamp (unlike last_visit_at below, which genuinely is recent activity). Shared
 * with lib/map-supabase-game.ts, which formats the same kickoff_at column for the GameSelector. */
export function formatGermanKickoff(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const datePart = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  const timePart = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${datePart}, ${timePart} Uhr`;
}

// A row from get_my_visited_stadiums().
export type SupabaseVisitedStadiumRow = {
  stadium_id: string;
  stadium_name: string;
  traditional_name: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  visited_games_count: number;
  last_visit_at: string;
};

// A row from get_my_matchday_history().
export type SupabaseMatchdayRow = {
  game_id: string;
  stadium_id: string;
  stadium_name: string;
  traditional_name: string | null;
  city: string;
  kickoff_at: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  attendance: number | null;
  own_content_count: number;
  last_activity_at: string;
};

// Never surfaces a traditional name that's null or identical to the current name -- avoids the
// "Ruhrstadion (Ruhrstadion)"-style duplicate display the UI must never show.
function resolveTraditionalName(currentName: string, traditionalName: string | null): string | undefined {
  if (!traditionalName || traditionalName === currentName) {
    return undefined;
  }
  return traditionalName;
}

/** "SchücoArena (Alm)", or just "SchücoArena" when there's no distinct traditional name -- used
 * by both app/stadium/[id].tsx and app/matchday/[id].tsx so the title format never diverges. */
export function formatStadiumTitle(name: string, traditionalName?: string): string {
  return traditionalName ? `${name} (${traditionalName})` : name;
}

export function mapSupabaseVisitedStadiumRow(row: SupabaseVisitedStadiumRow): Stadium {
  return {
    id: row.stadium_id,
    name: row.stadium_name,
    traditionalName: resolveTraditionalName(row.stadium_name, row.traditional_name),
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    visitedGamesCount: row.visited_games_count,
    lastVisitAt: formatRelativeGermanTime(row.last_visit_at),
    lastVisitAtIso: row.last_visit_at,
  };
}

export function mapSupabaseMatchdayRow(row: SupabaseMatchdayRow): Matchday {
  return {
    gameId: row.game_id,
    stadiumId: row.stadium_id,
    stadiumName: row.stadium_name,
    traditionalStadiumName: resolveTraditionalName(row.stadium_name, row.traditional_name),
    city: row.city,
    kickoffAt: row.kickoff_at ? formatGermanKickoff(row.kickoff_at) : undefined,
    kickoffAtIso: row.kickoff_at ?? undefined,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
    attendance: row.attendance,
    ownContentCount: row.own_content_count,
    lastActivityAtIso: row.last_activity_at,
  };
}
