import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveClubBadge } from '@/components/navigation/active-club-badge';
import { MessagesButton } from '@/components/navigation/messages-button';
import { NotificationsButton } from '@/components/navigation/notifications-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { STADION_MODULES, type StadionModule } from '@/constants/stadion-modules';
import { useActiveClub } from '@/context/active-club-context';
import { useGames } from '@/context/games-context';
import type { Game } from '@/data/database-games';
import { filterGamesForTeam, groupGamesByMatchday, sortByKickoffAscending, sortByKickoffDescending } from '@/lib/team-games';

type GameTab = 'all' | 'next' | 'past';

const TABS: { key: GameTab; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'next', label: 'Nächsten' },
  { key: 'past', label: 'Vergangen' },
];

export default function StadionScreen() {
  const router = useRouter();
  const { games, isGamesLoading } = useGames();
  const { activeTeamId, activeTeam } = useActiveClub();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GameTab>('all');

  // The Stadion area always shows exactly the active club's own games -- never a whole league
  // matchday (Vorgabe 25/26). Reused from components/stadion/game-selector.tsx via lib/team-games.ts
  // so both places filter/group games identically.
  const teamGames = useMemo(() => filterGamesForTeam(games, activeTeamId), [games, activeTeamId]);

  const { upcomingGames, pastGames } = useMemo(() => {
    const now = Date.now();
    const upcoming: Game[] = [];
    const past: Game[] = [];
    for (const game of teamGames) {
      const kickoffMs = game.kickoffAtIso ? new Date(game.kickoffAtIso).getTime() : null;
      if (kickoffMs != null && kickoffMs < now) {
        past.push(game);
      } else {
        upcoming.push(game);
      }
    }
    return { upcomingGames: sortByKickoffAscending(upcoming), pastGames: sortByKickoffDescending(past) };
  }, [teamGames]);

  const visibleGames = activeTab === 'all' ? teamGames : activeTab === 'next' ? upcomingGames.slice(0, 1) : pastGames;
  const groupedGames = useMemo(() => groupGamesByMatchday(visibleGames), [visibleGames]);

  // Default selection: the next upcoming game, else the most recent past one -- reset whenever the
  // active club changes (a different club's games are a completely different list, Vorgabe 32).
  // A manual tap is never overridden while browsing the same club (the `!selectedGameId` guard).
  useEffect(() => {
    setSelectedGameId(null);
  }, [activeTeamId]);

  useEffect(() => {
    if (!selectedGameId && teamGames.length > 0) {
      const defaultGame = upcomingGames[0] ?? pastGames[0] ?? teamGames[0];
      setSelectedGameId(defaultGame.id);
    }
  }, [teamGames, upcomingGames, pastGames, selectedGameId]);

  const selectedGame = teamGames.find((game) => game.id === selectedGameId);
  const selectedGameLabel = selectedGame ? `${selectedGame.homeTeam} – ${selectedGame.awayTeam}` : '';

  const handleOpenModule = (module: StadionModule) => {
    if (module === 'stadionkarte') {
      router.push('/stadion/karte');
      return;
    }

    if (module === 'beitraege') {
      // "Beiträge" from the main Stadion hub is the vereinsweite Übersicht (all of activeTeam's
      // posts, not just the currently selected game's) -- deliberately no gameId param, unlike
      // every other module here. The per-game "Beiträge" preview + its own "Alle anzeigen" link
      // (app/stadion/[module].tsx's Übersicht tab) still forwards a gameId and stays game-scoped.
      router.push({ pathname: '/stadion/[module]', params: { module } });
      return;
    }

    router.push({
      pathname: '/stadion/[module]',
      params: { module, gameId: selectedGameId ?? '', gameLabel: selectedGameLabel },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Stadion</Text>
            <Text style={styles.subtitle}>Alles rund um den Spieltag</Text>
          </View>
          <View style={styles.headerActions}>
            <NotificationsButton />
            <MessagesButton />
          </View>
        </View>
        <ActiveClubBadge style={styles.activeClubBadge} />
      </View>

      {!activeTeamId ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Wähle zuerst einen Verein aus, um seine Spiele zu sehen.</Text>
        </View>
      ) : (
        <>
          <View style={styles.tabRow}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
                accessibilityRole="button"
                accessibilityLabel={`${tab.label} Spiele anzeigen`}
              >
                <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
            {isGamesLoading ? (
              <ActivityIndicator size="small" color={FeedColors.textSecondary} style={styles.gamesLoadingIndicator} />
            ) : teamGames.length === 0 ? (
              <Text style={styles.noGamesText}>Keine Spiele für {activeTeam?.teamName ?? 'diesen Verein'} gefunden.</Text>
            ) : (
              groupedGames.map((group) =>
                group.games.map((game) => {
                  const gameLabel = `${game.homeTeam} – ${game.awayTeam}`;
                  const isHome = game.externalHomeTeamId === activeTeamId;
                  return (
                    <Pressable
                      key={game.id}
                      onPress={() => setSelectedGameId(game.id)}
                      style={[styles.filterChip, selectedGameId === game.id && styles.filterChipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Spiel auswählen: ${gameLabel}${group.matchday ? `, Spieltag ${group.matchday}` : ''}`}
                    >
                      {group.matchday ? <Text style={styles.filterChipMatchday}>Spieltag {group.matchday}</Text> : null}
                      <Text style={[styles.filterChipText, selectedGameId === game.id && styles.filterChipTextActive]}>{gameLabel}</Text>
                      <Text style={styles.filterChipHomeAway}>{isHome ? 'Heimspiel' : 'Auswärtsspiel'}</Text>
                    </Pressable>
                  );
                }),
              )
            )}
          </ScrollView>
        </>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {STADION_MODULES.map((module) => (
          <Pressable
            key={module.key}
            onPress={() => handleOpenModule(module.key)}
            style={styles.moduleCard}
            accessibilityRole="button"
            accessibilityLabel={`${module.label} öffnen`}
          >
            <View style={styles.moduleIconContainer}>
              <IconSymbol size={24} name={module.icon} color={ClubColors.primary} />
            </View>
            <View style={styles.moduleTextContainer}>
              <Text style={styles.moduleTitle}>{module.label}</Text>
              <Text style={styles.moduleDescription}>{module.description}</Text>
            </View>
            <IconSymbol size={22} name="chevron.right" color={FeedColors.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomColor: FeedColors.cardBorder,
    borderBottomWidth: 1,
  },
  activeClubBadge: {
    marginTop: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  subtitle: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.subtitle,
    marginTop: 4,
  },
  emptyState: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  tabButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  tabButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  tabButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  tabButtonTextActive: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  filterScroll: {
    flexGrow: 0,
    marginTop: Spacing.sm,
  },
  filterRow: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  gamesLoadingIndicator: {
    paddingVertical: Spacing.xs,
  },
  noGamesText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    paddingVertical: Spacing.xs,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  filterChipMatchday: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  filterChipText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  filterChipTextActive: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  filterChipHomeAway: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    minHeight: 72,
  },
  moduleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: ClubColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTextContainer: {
    flex: 1,
  },
  moduleTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  moduleDescription: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
});
