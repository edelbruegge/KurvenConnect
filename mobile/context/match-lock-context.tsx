import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { useProfiles } from '@/context/profile-context';
import { supabase } from '@/lib/supabase';

// Polling while foregrounded is a deliberate exception to this codebase's otherwise strict
// "AppState-transition-only, no setInterval" convention (see e.g. groups-context.tsx's own
// foreground-refresh effect) -- Match Lock is the first feature where the underlying real-world
// state (a live match) can start or end while the app stays open and foregrounded the whole time,
// which a foreground-*transition*-only check structurally cannot catch. ~60s matches the product
// target (Vorgabe 15) without being aggressive polling.
const MATCH_LOCK_POLL_INTERVAL_MS = 60 * 1000;

export type MatchLockGame = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: string;
};

type MatchLockResponse = {
  locked: boolean;
  reason: 'live_match' | 'no_match' | 'unknown';
  game: MatchLockGame | null;
  checkedAt: string;
};

export type MatchLockStatus = 'initializing' | 'unlocked' | 'locked';

// __DEV__-only simulation states, see MatchLockProvider's devMatchState below. 'normal' means "not
// simulating" -- the real server-derived `status` stays authoritative.
type DevMatchState = 'normal' | 'live' | 'finished';

// Deliberately just { status, lockedGame } -- no devMatchState/setDevMatchState here. Testing this
// context is done exclusively via the __DEV__-only console hook installed below
// (globalThis.__setMatchLockDevState), never through the context value itself, so there is no
// prop/context wiring anywhere that a screen could accidentally turn back into a visible control.
type MatchLockContextValue = {
  status: MatchLockStatus;
  lockedGame: MatchLockGame | null;
};

const MatchLockContext = createContext<MatchLockContextValue | undefined>(undefined);

export function MatchLockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { ownProfile } = useProfiles();
  const favoriteTeamId = ownProfile?.favoriteTeamId ?? null;

  const [status, setStatus] = useState<MatchLockStatus>('initializing');
  const [lockedGame, setLockedGame] = useState<MatchLockGame | null>(null);

  // __DEV__-only three-state simulation for testing without waiting on a real live match of the
  // user's favorite team -- no visible UI anywhere, no EXPO_PUBLIC_* flag. The only way to change
  // this is the console-only global installed in the effect below (globalThis.__setMatchLockDevState),
  // callable from the web devtools console or a native remote debugger/Metro console, never from
  // any rendered control a real user could tap. __DEV__ is replaced with a literal `false` in
  // production bundles (Metro/Babel), so `devMatchStateRaw` can never become anything but its
  // 'normal' initial value there, and the effect below never even runs -- two independent reasons
  // production can never be affected, not just one.
  const [devMatchStateRaw, setDevMatchStateRaw] = useState<DevMatchState>('normal');
  const devMatchState = __DEV__ ? devMatchStateRaw : 'normal';

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    (globalThis as { __setMatchLockDevState?: (next: DevMatchState) => void }).__setMatchLockDevState = (next) => {
      if (next !== 'normal' && next !== 'live' && next !== 'finished') {
        console.error(`[match-lock] invalid dev state "${next}", expected 'normal' | 'live' | 'finished'`);
        return;
      }
      console.log(`[match-lock] __DEV__ simulation -> ${next}`);
      setDevMatchStateRaw(next);
    };

    return () => {
      delete (globalThis as { __setMatchLockDevState?: (next: DevMatchState) => void }).__setMatchLockDevState;
    };
  }, []);

  // Mirrors `status` for use inside async callbacks/closures (e.g. the AppState listener, the
  // error branch below) without depending on `status` itself and re-subscribing everything --
  // same reasoning as e.g. groupsRealtimeStatusRef in groups-context.tsx.
  const statusRef = useRef<MatchLockStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const requestIdRef = useRef(0);
  const isCheckingRef = useRef(false);

  const runCheck = async () => {
    if (!authUserId || !favoriteTeamId) {
      requestIdRef.current += 1;
      setStatus('unlocked');
      setLockedGame(null);
      return;
    }

    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;
    const requestId = ++requestIdRef.current;

    try {
      const { data, error } = await supabase.functions.invoke<MatchLockResponse>('match-lock-status');

      if (requestIdRef.current !== requestId) {
        return; // a newer check (or an identity/team change) has superseded this one
      }

      if (error || !data) {
        if (__DEV__) {
          console.error('[match-lock] check failed', error);
        }
        // Fail-open: an error while not currently locked becomes/stays unlocked immediately. An
        // error while currently locked keeps the last confirmed lock rather than flickering it
        // off on a single failed poll -- the next successful check (which itself already knows
        // the server-side failsafe window) is what actually clears it. This can never persist
        // indefinitely: as soon as any check succeeds again (next 60s poll, or the next
        // foreground transition), the real answer wins.
        if (statusRef.current !== 'locked') {
          setStatus('unlocked');
          setLockedGame(null);
        }
        return;
      }

      if (data.locked) {
        setStatus('locked');
        setLockedGame(data.game);
      } else {
        setStatus('unlocked');
        setLockedGame(null);
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      if (__DEV__) {
        console.error('[match-lock] check threw', error);
      }
      if (statusRef.current !== 'locked') {
        setStatus('unlocked');
        setLockedGame(null);
      }
    } finally {
      isCheckingRef.current = false;
    }
  };

  // Identity change (sign-in, sign-out, account switch) -- reset first so no stale lock from a
  // previous account can ever be shown for the new one (Vorgabe 17), then let the effect below run
  // the real check for the new identity.
  useEffect(() => {
    requestIdRef.current += 1; // invalidate any in-flight check from the previous identity
    setLockedGame(null);
    setStatus(authUserId ? 'initializing' : 'unlocked');
  }, [authUserId]);

  // App-start / favorite-team-change check (Vorgabe 13/18) -- also the only place a genuinely new
  // check needs to fire just because favoriteTeamId itself changed (e.g. user changes their
  // favorite club in Profil bearbeiten), independent of any AppState transition.
  useEffect(() => {
    void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, favoriteTeamId]);

  // Foreground transition (immediate re-check, Vorgabe 14) + polling while foregrounded (Vorgabe
  // 15/16, the deliberate setInterval exception explained above). Single interval, started only
  // while active + signed in + has a favorite team; stopped on backgrounding and on unmount.
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const canPoll = () => Boolean(authUserId && favoriteTeamId);

    const startInterval = () => {
      if (intervalId || !canPoll()) {
        return;
      }
      intervalId = setInterval(() => {
        void runCheck();
      }, MATCH_LOCK_POLL_INTERVAL_MS);
    };

    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    if (AppState.currentState === 'active') {
      startInterval();
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      const wentToBackground = appStateRef.current === 'active' && /inactive|background/.test(nextState);
      appStateRef.current = nextState;

      if (cameToForeground) {
        void runCheck();
        startInterval();
      } else if (wentToBackground) {
        stopInterval();
      }
    });

    return () => {
      subscription.remove();
      stopInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, favoriteTeamId]);

  // The __DEV__ simulation, when active, is authoritative over the real server-derived `status` --
  // 'live' forces locked, 'finished' forces unlocked, 'normal' leaves the real status untouched.
  // The production server response itself is never altered by this (Vorgabe: "Produktive
  // Serverantwort bleibt ansonsten unverändert maßgeblich") -- runCheck() above keeps running
  // exactly as before in the background regardless of devMatchState, this only changes what gets
  // exposed to consumers while a simulation is active.
  const effectiveStatus: MatchLockStatus =
    __DEV__ && devMatchState === 'live'
      ? 'locked'
      : __DEV__ && devMatchState === 'finished'
        ? 'unlocked'
        : status;

  const effectiveLockedGame =
    __DEV__ && devMatchState === 'live'
      ? (lockedGame ?? { id: 'dev-simulated', homeTeamName: 'Heimteam', awayTeamName: 'Auswärtsteam', kickoff: new Date().toISOString() })
      : lockedGame;

  const value = useMemo<MatchLockContextValue>(
    () => ({
      status: effectiveStatus,
      lockedGame: effectiveStatus === 'locked' ? effectiveLockedGame : null,
    }),
    [effectiveStatus, effectiveLockedGame],
  );

  return <MatchLockContext.Provider value={value}>{children}</MatchLockContext.Provider>;
}

export function useMatchLock() {
  const context = useContext(MatchLockContext);

  if (!context) {
    throw new Error('useMatchLock must be used within a MatchLockProvider');
  }

  return context;
}
