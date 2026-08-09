import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

const MIN_INTERVAL_BETWEEN_RUNS_MS = 2000;

/**
 * Refreshes when a screen regains focus, but only as a safety net for a silently dropped realtime
 * connection — never fires while `isRealtimeHealthy` is true, and never twice within a couple of
 * seconds (guards against firing back-to-back with a just-ran foreground/AppState refresh). This
 * never delays the refresh itself, it only skips an immediately-redundant repeat.
 */
export function useRefreshOnFocus(refresh: () => void, isRealtimeHealthy: boolean): void {
  const lastRunAtRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (isRealtimeHealthy) {
        return;
      }

      const now = Date.now();

      if (now - lastRunAtRef.current < MIN_INTERVAL_BETWEEN_RUNS_MS) {
        return;
      }

      lastRunAtRef.current = now;
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRealtimeHealthy]),
  );
}
