import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { useGames } from '@/context/games-context';
import { useProfiles } from '@/context/profile-context';
import type { KnownTeam } from '@/data/database-games';

type ActiveClubContextValue = {
  // The club whose content is currently being browsed -- distinct from profiles.favorite_team_id
  // (the user's permanent identity/club, see profile-context.tsx). Initialized once per session
  // from the favorite club, then never re-defaulted, so browsing another club temporarily never
  // touches favorite_team_id and never gets silently reset by it either.
  activeTeamId: string | null;
  activeTeam: KnownTeam | null;
  setActiveTeam: (team: KnownTeam) => void;
  // false until activeTeamId has been initialized at least once this session -- content-loading
  // contexts (FeedPostsContext, GroupsContext) key their queries off activeTeamId directly, so this
  // is mainly useful for screens that want to distinguish "not ready yet" from "genuinely no club".
  isActiveClubReady: boolean;
};

const ActiveClubContext = createContext<ActiveClubContextValue | undefined>(undefined);

export function ActiveClubProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { ownProfile, isOwnProfileLoading } = useProfiles();
  const { getKnownTeamById } = useGames();

  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Full reset on sign-out / account switch -- account B must never inherit account A's browsed
  // club (Vorgabe 37). Re-initialization for the new session happens in the effect below.
  useEffect(() => {
    if (!authUserId) {
      setActiveTeamId(null);
      setHasInitialized(false);
    }
  }, [authUserId]);

  // One-time default per session: the user's favorite club, once the profile has actually loaded.
  // Latched via hasInitialized -- a later change to favorite_team_id elsewhere (or a temporary
  // browse-switch) never re-triggers this (Vorgabe 3).
  useEffect(() => {
    if (!authUserId || hasInitialized || isOwnProfileLoading) {
      return;
    }

    if (ownProfile?.favoriteTeamId) {
      setActiveTeamId(ownProfile.favoriteTeamId);
      setHasInitialized(true);
    }
  }, [authUserId, hasInitialized, isOwnProfileLoading, ownProfile?.favoriteTeamId]);

  // The single write path -- used both for a temporary browse-switch (e.g. the Stadion club
  // switcher) and for the deliberate "favorite club changed in the profile" case (edit-profile.tsx
  // calls this explicitly after a successful save, see Vorgabe 36).
  const setActiveTeam = (team: KnownTeam) => {
    setActiveTeamId(team.externalTeamId);
    setHasInitialized(true);
  };

  const activeTeam = activeTeamId ? (getKnownTeamById(activeTeamId) ?? null) : null;

  const value = useMemo(
    () => ({ activeTeamId, activeTeam, setActiveTeam, isActiveClubReady: hasInitialized }),
    [activeTeamId, activeTeam, hasInitialized],
  );

  return <ActiveClubContext.Provider value={value}>{children}</ActiveClubContext.Provider>;
}

export function useActiveClub() {
  const context = useContext(ActiveClubContext);

  if (!context) {
    throw new Error('useActiveClub must be used within an ActiveClubProvider');
  }

  return context;
}
