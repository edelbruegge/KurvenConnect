import type { Game } from '@/data/database-games';

// Shared helpers for "games of one specific team" -- used both by the club-scoped Stadion screen
// (app/(tabs)/stadion.tsx) and the game-picker used in post/trip/meetup/wanted creation
// (components/stadion/game-selector.tsx). A club's games are always exactly the games where it
// played home or away -- never a whole league matchday.

export function filterGamesForTeam(games: Game[], teamId: string | null | undefined): Game[] {
  if (!teamId) return [];
  return games.filter((game) => game.externalHomeTeamId === teamId || game.externalAwayTeamId === teamId);
}

export function sortByKickoffAscending(games: Game[]): Game[] {
  return [...games].sort((a, b) => (a.kickoffAtIso ?? '9999').localeCompare(b.kickoffAtIso ?? '9999'));
}

export function sortByKickoffDescending(games: Game[]): Game[] {
  return [...games].sort((a, b) => (b.kickoffAtIso ?? '').localeCompare(a.kickoffAtIso ?? ''));
}

export type MatchdayGroup = {
  matchday: number | null;
  games: Game[];
};

/** Groups by the real numeric `matchday` (public.games.matchday, an integer), sorted ascending;
 * games without a matchday land in one trailing "Weitere Spiele" group, never dropped. Since a
 * club plays exactly one game per league matchday, each group here normally holds a single game
 * (Vorgabe 26/27) -- never a whole round's worth of fixtures, because `games` is expected to
 * already be filtered to one team via filterGamesForTeam(). */
export function groupGamesByMatchday(games: Game[]): MatchdayGroup[] {
  const byMatchday = new Map<number, Game[]>();
  const withoutMatchday: Game[] = [];

  for (const game of games) {
    if (game.matchday == null) {
      withoutMatchday.push(game);
      continue;
    }
    const existing = byMatchday.get(game.matchday) ?? [];
    existing.push(game);
    byMatchday.set(game.matchday, existing);
  }

  const sortedKeys = [...byMatchday.keys()].sort((a, b) => a - b);

  const groups: MatchdayGroup[] = sortedKeys.map((matchday) => ({
    matchday,
    games: sortByKickoffAscending(byMatchday.get(matchday) ?? []),
  }));

  if (withoutMatchday.length > 0) {
    groups.push({ matchday: null, games: sortByKickoffAscending(withoutMatchday) });
  }

  return groups;
}
