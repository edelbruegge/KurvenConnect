export type SupabaseProfile = {
  id: string;
  displayName: string;
  club: string | null;
  location: string | null;
  bio: string | null;
  avatarUrl: string | null;
  // Stable OpenLigaDB team id (public.team_stadium_mappings.external_team_id) -- the source of
  // truth for "favorite club" going forward. `club` above stays a denormalized display-name cache
  // kept in sync with this whenever it is written (see ProfileUpdate in profile-context.tsx).
  favoriteTeamId: string | null;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupabaseProfileRow = {
  id: string;
  display_name: string | null;
  club: string | null;
  location: string | null;
  bio: string | null;
  avatar_url: string | null;
  favorite_team_id: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapSupabaseProfileRow(row: SupabaseProfileRow): SupabaseProfile {
  return {
    id: row.id,
    displayName: row.display_name?.trim() || 'Neues Mitglied',
    club: row.club,
    location: row.location,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    favoriteTeamId: row.favorite_team_id,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** "Marco Neumann" -> "MN", "Marco" -> "MA". Used where Supabase has no stored initials. */
export function getInitialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (words[0][0] + words[1][0]).toUpperCase();
}
