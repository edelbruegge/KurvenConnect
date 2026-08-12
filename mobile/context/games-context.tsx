import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import type { Game } from '@/data/database-games';
import { seedGames } from '@/data/games';
import { mapSupabaseGameRow, type SupabaseGameRow } from '@/lib/map-supabase-game';
import { supabase } from '@/lib/supabase';

type GamesContextValue = {
  games: Game[];
  upcomingGames: Game[];
  pastGames: Game[];
  // Every loaded game whose `season` matches the most recent season present in the data (derived,
  // not hardcoded anywhere) -- empty when no loaded game carries a `season` value yet (e.g. only
  // the seed fallback or pre-migration legacy games).
  currentSeasonGames: Game[];
  isGamesLoading: boolean;
  gamesError: string | null;
  refreshGames: () => void;
  getGameById: (gameId: string) => Game | undefined;
  getGamesByMatchday: (matchday: number) => Game[];
  // Best-effort exact match on home/away team name -- there is no stable club_id/external-team-id
  // mapping from a user's favorite club yet (see game-selector.tsx's header comment), so this is a
  // plain, general-purpose lookup, not a personalized "my club" feature.
  getGamesForTeam: (teamName: string) => Game[];
};

const GamesContext = createContext<GamesContextValue | undefined>(undefined);

// data/games.ts's two-entry seedGames list is a dev/offline fallback only -- used when the live
// public.games query returns nothing (e.g. an environment where the stadiums/games migration
// hasn't run yet). It is never preferred over real data; see loadGames() below.
function mapSeedGamesAsFallback(): Game[] {
  return seedGames.map((seedGame) => {
    const [homeTeam, awayTeam] = seedGame.label.split(' – ');
    return {
      id: seedGame.id,
      homeTeam: homeTeam ?? seedGame.label,
      awayTeam: awayTeam ?? '',
      homeScore: null,
      awayScore: null,
      status: null,
      stadiumId: null,
    };
  });
}

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [games, setGames] = useState<Game[]>([]);
  const [isGamesLoading, setIsGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      setGames([]);
      setIsGamesLoading(false);
      setGamesError(null);
      return;
    }

    let isCurrent = true;
    setIsGamesLoading(true);
    setGamesError(null);

    (async () => {
      const { data, error } = await supabase
        .from('games')
        .select(
          'id, home_team, away_team, kickoff_at, competition, matchday, season, league_shortcut, external_home_team_id, external_away_team_id, home_score, away_score, status, stadium_id, stadiums(name, city)',
        )
        .order('kickoff_at', { ascending: true, nullsFirst: true });

      if (!isCurrent) return;

      if (error) {
        // Reference data, not personal data -- a failed load falls back to the local seed list
        // rather than blocking the whole create-flow (see mapSeedGamesAsFallback above).
        setGames(mapSeedGamesAsFallback());
        setGamesError(null);
        setIsGamesLoading(false);
        return;
      }

      const rows = (data ?? []) as SupabaseGameRow[];
      setGames(rows.length > 0 ? rows.map(mapSupabaseGameRow) : mapSeedGamesAsFallback());
      setIsGamesLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshGames = () => {
    setReloadToken((token) => token + 1);
  };

  const getGameById = (gameId: string): Game | undefined => games.find((game) => game.id === gameId);

  const getGamesByMatchday = (matchday: number): Game[] => games.filter((game) => game.matchday === matchday);

  const getGamesForTeam = (teamName: string): Game[] =>
    games.filter((game) => game.homeTeam === teamName || game.awayTeam === teamName);

  const currentSeasonGames = useMemo(() => {
    const seasons = games.map((game) => game.season).filter((season): season is string => Boolean(season));
    if (seasons.length === 0) {
      return [];
    }
    const latestSeason = seasons.reduce((latest, season) => (season > latest ? season : latest));
    return games.filter((game) => game.season === latestSeason);
  }, [games]);

  const { upcomingGames, pastGames } = useMemo(() => {
    const now = Date.now();
    const upcoming: Game[] = [];
    const past: Game[] = [];

    for (const game of games) {
      // No kickoff date on record (e.g. a legacy/manual entry) -- keep it directly discoverable
      // under "Bevorstehend" rather than hiding it under "Vergangen" until it gets a real date.
      const kickoffMs = game.kickoffAtIso ? new Date(game.kickoffAtIso).getTime() : null;
      if (kickoffMs != null && kickoffMs < now) {
        past.push(game);
      } else {
        upcoming.push(game);
      }
    }

    upcoming.sort((a, b) => (a.kickoffAtIso ?? '9999').localeCompare(b.kickoffAtIso ?? '9999'));
    past.sort((a, b) => (b.kickoffAtIso ?? '').localeCompare(a.kickoffAtIso ?? ''));

    return { upcomingGames: upcoming, pastGames: past };
  }, [games]);

  const value = useMemo(
    () => ({
      games,
      upcomingGames,
      pastGames,
      currentSeasonGames,
      isGamesLoading,
      gamesError,
      refreshGames,
      getGameById,
      getGamesByMatchday,
      getGamesForTeam,
    }),
    [games, upcomingGames, pastGames, currentSeasonGames, isGamesLoading, gamesError],
  );

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}

export function useGames() {
  const context = useContext(GamesContext);

  if (!context) {
    throw new Error('useGames must be used within a GamesProvider');
  }

  return context;
}
