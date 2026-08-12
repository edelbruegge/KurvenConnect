// The single, central place that turns a stadium/matchday id into an in-app route — mirrors
// lib/notification-navigation.ts's resolveNotificationRoute and data/feed-posts.ts's
// getPostDetailPathname. Every tap target on the Stadionkarte (marker, "Stadionname · Stadt" line,
// matchday card) calls one of these two instead of building its own router.push shape, and
// navigation is always driven by a stable id (stadium_id/game_id) — never by a displayed name.
// Post navigation reuses the already-existing getPostDetailPathname (data/feed-posts.ts) as-is.

export type StadiumDetailRoute = { pathname: '/stadium/[id]'; params: { id: string } };
export type MatchdayDetailRoute = { pathname: '/matchday/[id]'; params: { id: string } };

export function getStadiumDetailRoute(stadiumId: string): StadiumDetailRoute {
  return { pathname: '/stadium/[id]', params: { id: stadiumId } };
}

export function getMatchdayDetailRoute(gameId: string): MatchdayDetailRoute {
  return { pathname: '/matchday/[id]', params: { id: gameId } };
}
