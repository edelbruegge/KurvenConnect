import type { StadiumStats } from '@/data/stadium-stats';

// A row from get_user_stadium_stats(p_user_id) -- always exactly one row (aggregate query),
// numeric columns come back as `number` via supabase-js for `bigint` (safe here: these are simple
// per-user counts, nowhere near JS's safe-integer range).
export type SupabaseStadiumStatsRow = {
  total_games: number;
  away_games: number;
  home_games: number;
  stadiums_visited: number;
};

export function mapSupabaseStadiumStatsRow(row: SupabaseStadiumStatsRow): StadiumStats {
  return {
    totalGames: row.total_games,
    awayGames: row.away_games,
    homeGames: row.home_games,
    stadiumsVisited: row.stadiums_visited,
  };
}
