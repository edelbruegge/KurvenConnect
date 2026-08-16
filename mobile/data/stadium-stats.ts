// Aggregate stadium/matchday statistics for one profile (own or foreign), entirely derived
// server-side from public.user_game_attendance via the get_user_stadium_stats() RPC (see
// supabase/migrations/20260827100000_add_stadium_attendance_and_badges.sql). No raw per-game
// attendance rows are ever exposed client-side for a profile that isn't the caller's own -- only
// these four aggregate counts (Vorgabe 15).

export type StadiumStats = {
  totalGames: number;
  awayGames: number;
  homeGames: number;
  stadiumsVisited: number;
};

export const EMPTY_STADIUM_STATS: StadiumStats = {
  totalGames: 0,
  awayGames: 0,
  homeGames: 0,
  stadiumsVisited: 0,
};
