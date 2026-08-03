export type SupabaseProfile = {
  id: string;
  displayName: string;
  club: string | null;
  location: string | null;
  bio: string | null;
  avatarUrl: string | null;
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
