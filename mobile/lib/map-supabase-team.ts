import type { KnownTeam } from '@/data/database-games';

// A row from `supabase.rpc('get_known_teams')` (see the get_known_teams() SQL function in
// 20260820100000_add_favorite_team_onboarding.sql).
export type SupabaseKnownTeamRow = {
  external_team_id: string;
  team_name: string;
  league_shortcut: string | null;
};

export function mapSupabaseKnownTeamRow(row: SupabaseKnownTeamRow): KnownTeam {
  return {
    externalTeamId: row.external_team_id,
    teamName: row.team_name,
    leagueShortcut: row.league_shortcut,
  };
}
