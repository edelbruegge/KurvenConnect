import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { EMPTY_STADIUM_STATS, type StadiumStats } from '@/data/stadium-stats';
import { mapSupabaseStadiumStatsRow, type SupabaseStadiumStatsRow } from '@/lib/map-supabase-stadium-stats';
import { mapStadiumStatsError } from '@/lib/stadium-stats-errors';
import { supabase } from '@/lib/supabase';

type StadiumStatsState = {
  stats: StadiumStats;
  isLoading: boolean;
  error: string | null;
  hasLoadedOnce: boolean;
};

const EMPTY_STADIUM_STATS_STATE: StadiumStatsState = {
  stats: EMPTY_STADIUM_STATS,
  isLoading: false,
  error: null,
  hasLoadedOnce: false,
};

type StadiumStatsContextValue = {
  // Per-profile cache, keyed by the profile's own user id -- mirrors context/feed-posts-context
  // .tsx's loadUserContent/getUserContentState (own profile and any other profile actually opened
  // load independently and on demand, never eagerly for every user in the app).
  loadStadiumStats: (userId: string) => void;
  getStadiumStatsState: (userId: string) => StadiumStatsState;
  // Re-triggers the load for one profile (used right after the current account creates a new
  // game-tagged post -- Vorgabe 29 -- and by pull-to-refresh-style call sites). Same as calling
  // loadStadiumStats again; named separately so a call site's intent ("I know this changed") is
  // clear from the call itself.
  refreshStadiumStats: (userId: string) => void;
};

const StadiumStatsContext = createContext<StadiumStatsContextValue | undefined>(undefined);

export function StadiumStatsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [statsByUserId, setStatsByUserId] = useState<Record<string, StadiumStatsState>>({});

  const loadStadiumStats = (userId: string) => {
    if (!authUserId) return;

    setStatsByUserId((current) => ({
      ...current,
      [userId]: { ...(current[userId] ?? EMPTY_STADIUM_STATS_STATE), isLoading: true, error: null },
    }));

    supabase
      .rpc('get_user_stadium_stats', { p_user_id: userId })
      .then(({ data, error }) => {
        if (error) {
          setStatsByUserId((current) => ({
            ...current,
            [userId]: { stats: EMPTY_STADIUM_STATS, isLoading: false, error: mapStadiumStatsError(error), hasLoadedOnce: true },
          }));
          return;
        }

        const row = ((data ?? []) as SupabaseStadiumStatsRow[])[0];

        setStatsByUserId((current) => ({
          ...current,
          [userId]: {
            stats: row ? mapSupabaseStadiumStatsRow(row) : EMPTY_STADIUM_STATS,
            isLoading: false,
            error: null,
            hasLoadedOnce: true,
          },
        }));
      });
  };

  const getStadiumStatsState = (userId: string): StadiumStatsState => statsByUserId[userId] ?? EMPTY_STADIUM_STATS_STATE;

  const refreshStadiumStats = (userId: string) => {
    loadStadiumStats(userId);
  };

  // Sign-out: never keep any cached profile's stats around once there is no signed-in account --
  // same "never keep stale account-bound state" convention every other context here follows. A
  // signed-in account's cache is intentionally keyed by profile id, not cleared on every account
  // switch while signed in -- a foreign profile's aggregate stats are not account-secret data, and
  // the own-profile entry is naturally re-keyed under the new account's own (different) user id.
  useEffect(() => {
    if (!authUserId) {
      setStatsByUserId({});
    }
  }, [authUserId]);

  const value = useMemo(
    () => ({ loadStadiumStats, getStadiumStatsState, refreshStadiumStats }),
    [statsByUserId, authUserId],
  );

  return <StadiumStatsContext.Provider value={value}>{children}</StadiumStatsContext.Provider>;
}

export function useStadiumStats() {
  const context = useContext(StadiumStatsContext);

  if (!context) {
    throw new Error('useStadiumStats must be used within a StadiumStatsProvider');
  }

  return context;
}
