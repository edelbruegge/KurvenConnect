import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { mapGameFollowError } from '@/lib/game-follow-errors';
import { supabase } from '@/lib/supabase';

type GameFollowsContextValue = {
  isGameFollowed: (gameId: string) => boolean;
  // True only while the initial list of the current account's followed game ids is still loading
  // -- callers must not render either follow state (followed or not) until this is false, see
  // isGameFollowed's callers in app/stadion/[module].tsx.
  isGameFollowsLoading: boolean;
  gameFollowsError: string | null;
  toggleGameFollow: (gameId: string) => Promise<{ error: string | null }>;
};

const GameFollowsContext = createContext<GameFollowsContextValue | undefined>(undefined);

type SupabaseGameFollowRow = { game_id: string };

export function GameFollowsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [followedGameIds, setFollowedGameIds] = useState<Set<string>>(new Set());
  const [isGameFollowsLoading, setIsGameFollowsLoading] = useState(false);
  const [gameFollowsError, setGameFollowsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const inFlightGameIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or switched away from this account): never keep showing a previous account's
      // follow state.
      setFollowedGameIds(new Set());
      setIsGameFollowsLoading(false);
      setGameFollowsError(null);
      inFlightGameIds.current.clear();
      return;
    }

    let isCurrent = true;
    setIsGameFollowsLoading(true);
    setGameFollowsError(null);

    supabase
      .from('game_follows')
      .select('game_id')
      .eq('user_id', authUserId)
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setGameFollowsError(mapGameFollowError(error, 'follow'));
          setFollowedGameIds(new Set());
          setIsGameFollowsLoading(false);
          return;
        }

        setFollowedGameIds(new Set(((data ?? []) as SupabaseGameFollowRow[]).map((row) => row.game_id)));
        setIsGameFollowsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const isGameFollowed = (gameId: string): boolean => followedGameIds.has(gameId);

  const toggleGameFollow = async (gameId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: mapGameFollowError(new Error('not authenticated'), 'follow') };
    }

    if (inFlightGameIds.current.has(gameId)) {
      return { error: null };
    }

    const wasFollowed = followedGameIds.has(gameId);
    inFlightGameIds.current.add(gameId);

    // Optimistic UI: update immediately, roll back only if the write actually fails.
    const previous = followedGameIds;
    const optimistic = new Set(followedGameIds);
    if (wasFollowed) {
      optimistic.delete(gameId);
    } else {
      optimistic.add(gameId);
    }
    setFollowedGameIds(optimistic);

    try {
      const { error } = wasFollowed
        ? await supabase.from('game_follows').delete().eq('user_id', authUserId).eq('game_id', gameId)
        : await supabase.from('game_follows').insert({ user_id: authUserId, game_id: gameId });

      if (error) {
        setFollowedGameIds(previous);
        const mapped = mapGameFollowError(error, wasFollowed ? 'unfollow' : 'follow');
        setGameFollowsError(mapped);
        return { error: mapped };
      }

      return { error: null };
    } finally {
      inFlightGameIds.current.delete(gameId);
    }
  };

  const value = useMemo(
    () => ({ isGameFollowed, isGameFollowsLoading, gameFollowsError, toggleGameFollow }),
    [followedGameIds, isGameFollowsLoading, gameFollowsError, authUserId],
  );

  return <GameFollowsContext.Provider value={value}>{children}</GameFollowsContext.Provider>;
}

export function useGameFollows() {
  const context = useContext(GameFollowsContext);

  if (!context) {
    throw new Error('useGameFollows must be used within a GameFollowsProvider');
  }

  return context;
}
