// Compares a user's stored `profiles.club` (plain text, no stable club_id -- see
// public.profiles' schema) against real fixture team names (public.games.home_team/away_team,
// synced from OpenLigaDB). Live-verified example that motivated this: profiles store
// "Arminia Bielefeld", while OpenLigaDB's actual team name is "DSC Arminia Bielefeld" -- a plain
// `===`/`.includes()` comparison would either miss this real match entirely, or (with
// `.includes()`) risk matching unrelated clubs on a coincidental substring. Never a database, never
// fuzzy/similarity matching -- a small, fixed, deterministic list of well-known German football
// club legal-form prefixes, stripped only when they appear as a whole leading word, then compared
// for exact equality on what remains. A club whose real name differs in some other way (a
// completely different spelling, an abbreviation, etc.) still won't match -- that's a known,
// documented limitation of working from a free-text field with no stable id, not something this
// function tries to paper over.

const KNOWN_CLUB_PREFIXES = ['1.', 'fc', 'sc', 'sv', 'vfl', 'vfb', 'tsg', 'tsv', 'fsv', 'spvgg', 'dsc', 'sg', 'borussia'];

export function normalizeClubName(name: string): string {
  const words = name.trim().toLowerCase().split(/\s+/);

  while (words.length > 1 && KNOWN_CLUB_PREFIXES.includes(words[0])) {
    words.shift();
  }

  return words.join(' ');
}

export function isSameClub(profileClub: string, teamName: string): boolean {
  return normalizeClubName(profileClub) === normalizeClubName(teamName);
}
