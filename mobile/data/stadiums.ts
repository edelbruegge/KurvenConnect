// Personal stadium history types (see context/stadium-history-context.tsx). Both are entirely
// derived from get_my_visited_stadiums()/get_my_matchday_history() — there is no local/seed
// counterpart and no source: 'local' | 'supabase' split here, unlike most other data types in this
// app: a "visited stadium" only ever exists because of a real own Supabase post/trip/meetup/
// wanted-entry with a game_id, so this feature has nothing to show for a signed-out or seed-only
// state — see StadiumHistoryContext's empty state instead.

export type Stadium = {
  id: string;
  name: string;
  // The stadium's historical/fan name (e.g. "Alm"), distinct from `name` (the current
  // official/sponsored name) -- undefined when not on record, never equal to `name` by
  // construction (see lib/map-supabase-stadium.ts).
  traditionalName?: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  visitedGamesCount: number;
  // Formatted ("vor 3 Tagen") for display, raw ISO for sorting/comparisons.
  lastVisitAt: string;
  lastVisitAtIso: string;
};

export type Matchday = {
  gameId: string;
  stadiumId: string;
  stadiumName: string;
  traditionalStadiumName?: string;
  city: string;
  // Undefined when the game's kickoff_at is not known yet -- never a guessed date.
  kickoffAt?: string;
  kickoffAtIso?: string;
  homeTeam: string;
  awayTeam: string;
  // Null when not known -- UI must show "Ergebnis noch nicht verfügbar" instead of a dummy value.
  homeScore: number | null;
  awayScore: number | null;
  attendance: number | null;
  ownContentCount: number;
  lastActivityAtIso: string;
};
