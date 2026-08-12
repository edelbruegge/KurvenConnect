import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import type { Matchday, Stadium } from '@/data/stadiums';
import {
  mapSupabaseMatchdayRow,
  mapSupabaseVisitedStadiumRow,
  type SupabaseMatchdayRow,
  type SupabaseVisitedStadiumRow,
} from '@/lib/map-supabase-stadium';
import { mapStadiumHistoryError } from '@/lib/stadium-errors';
import { supabase } from '@/lib/supabase';

type StadiumHistoryContextValue = {
  visitedStadiums: Stadium[];
  matchdayHistory: Matchday[];
  isStadiumHistoryLoading: boolean;
  stadiumHistoryError: string | null;
  // True once the first load attempt for the current account has actually completed (success or
  // error) — lets a direct /stadium/[id] or /matchday/[id] URL (e.g. a browser reload) tell "not
  // loaded yet" apart from "genuinely not found", instead of flashing a NotFoundView while the
  // very first fetch is still in flight. Stays true across later background refreshes (foreground
  // return, refreshStadiumHistory()) so those never re-blank an already-showing detail page.
  hasLoadedStadiumHistoryOnce: boolean;
  refreshStadiumHistory: () => void;
  getVisitedStadiumById: (stadiumId: string) => Stadium | undefined;
  getMatchdaysForStadium: (stadiumId: string) => Matchday[];
  getMatchdayById: (gameId: string) => Matchday | undefined;
};

const StadiumHistoryContext = createContext<StadiumHistoryContextValue | undefined>(undefined);

export function StadiumHistoryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [visitedStadiums, setVisitedStadiums] = useState<Stadium[]>([]);
  const [matchdayHistory, setMatchdayHistory] = useState<Matchday[]>([]);
  const [isStadiumHistoryLoading, setIsStadiumHistoryLoading] = useState(false);
  const [stadiumHistoryError, setStadiumHistoryError] = useState<string | null>(null);
  const [hasLoadedStadiumHistoryOnce, setHasLoadedStadiumHistoryOnce] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or switched away from this account): never keep showing a previous account's
      // stadium history, even briefly. A newly signed-in account gets its own fresh "loaded once"
      // gate — never inherits the previous account's completed-load state.
      setVisitedStadiums([]);
      setMatchdayHistory([]);
      setIsStadiumHistoryLoading(false);
      setStadiumHistoryError(null);
      setHasLoadedStadiumHistoryOnce(false);
      return;
    }

    let isCurrent = true;
    setIsStadiumHistoryLoading(true);
    setStadiumHistoryError(null);

    (async () => {
      const [visitedResult, matchdaysResult] = await Promise.all([
        supabase.rpc('get_my_visited_stadiums'),
        supabase.rpc('get_my_matchday_history'),
      ]);

      // A response for an account the user has since switched away from must never be applied.
      if (!isCurrent) return;

      if (visitedResult.error) {
        setStadiumHistoryError(mapStadiumHistoryError(visitedResult.error));
        setVisitedStadiums([]);
        setMatchdayHistory([]);
        setIsStadiumHistoryLoading(false);
        setHasLoadedStadiumHistoryOnce(true);
        return;
      }

      if (matchdaysResult.error) {
        setStadiumHistoryError(mapStadiumHistoryError(matchdaysResult.error));
        setVisitedStadiums([]);
        setMatchdayHistory([]);
        setIsStadiumHistoryLoading(false);
        setHasLoadedStadiumHistoryOnce(true);
        return;
      }

      setVisitedStadiums(((visitedResult.data ?? []) as SupabaseVisitedStadiumRow[]).map(mapSupabaseVisitedStadiumRow));
      setMatchdayHistory(((matchdaysResult.data ?? []) as SupabaseMatchdayRow[]).map(mapSupabaseMatchdayRow));
      setIsStadiumHistoryLoading(false);
      setHasLoadedStadiumHistoryOnce(true);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshStadiumHistory = () => {
    setReloadToken((token) => token + 1);
  };

  const getVisitedStadiumById = (stadiumId: string): Stadium | undefined =>
    visitedStadiums.find((stadium) => stadium.id === stadiumId);

  const getMatchdaysForStadium = (stadiumId: string): Matchday[] =>
    matchdayHistory.filter((matchday) => matchday.stadiumId === stadiumId);

  const getMatchdayById = (gameId: string): Matchday | undefined =>
    matchdayHistory.find((matchday) => matchday.gameId === gameId);

  // Foreground refresh: one AppState listener, no polling — mirrors every other context in this
  // app (FeedPostsContext/NotificationsContext/GroupsContext/...). Covers "created from another
  // device/session while this one was backgrounded"; the immediate case (created right here) is
  // handled by create-post.tsx calling refreshStadiumHistory() directly after a successful save.
  const authUserIdRef = useRef(authUserId);

  useEffect(() => {
    authUserIdRef.current = authUserId;
  }, [authUserId]);

  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserIdRef.current) {
        return;
      }

      refreshStadiumHistory();
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      visitedStadiums,
      matchdayHistory,
      isStadiumHistoryLoading,
      stadiumHistoryError,
      hasLoadedStadiumHistoryOnce,
      refreshStadiumHistory,
      getVisitedStadiumById,
      getMatchdaysForStadium,
      getMatchdayById,
    }),
    [visitedStadiums, matchdayHistory, isStadiumHistoryLoading, stadiumHistoryError, hasLoadedStadiumHistoryOnce],
  );

  return <StadiumHistoryContext.Provider value={value}>{children}</StadiumHistoryContext.Provider>;
}

export function useStadiumHistory() {
  const context = useContext(StadiumHistoryContext);

  if (!context) {
    throw new Error('useStadiumHistory must be used within a StadiumHistoryProvider');
  }

  return context;
}
