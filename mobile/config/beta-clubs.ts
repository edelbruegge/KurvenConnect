import type { KnownTeam } from '@/data/database-games';

// Central beta-phase club allowlist. To open up another club later, add its
// external_team_id here (see public.team_stadium_mappings / get_known_teams()) -- no other file
// should ever hardcode which clubs are currently selectable. This never touches which clubs exist
// in the database (team_stadium_mappings keeps all 56 rows) or which club an existing profile/game/
// group already references -- it only decides what a picker offers to *newly* select.
export const BETA_ENABLED_CLUB_IDS: readonly string[] = [
  '83', // DSC Arminia Bielefeld
];

export function isClubEnabledForBeta(externalTeamId: string | null | undefined): boolean {
  return externalTeamId != null && BETA_ENABLED_CLUB_IDS.includes(externalTeamId);
}

// Applied only at the club *selection* surfaces (ClubPicker consumers) -- never at
// GamesContext.knownTeams/getKnownTeamById itself, so an existing profile/active club outside the
// beta allowlist still resolves to a real team (name, league) instead of silently disappearing.
export function filterEnabledClubs<T extends Pick<KnownTeam, 'externalTeamId'>>(teams: readonly T[]): T[] {
  return teams.filter((team) => isClubEnabledForBeta(team.externalTeamId));
}
