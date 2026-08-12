import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessagesButton } from '@/components/navigation/messages-button';
import { NotificationsButton } from '@/components/navigation/notifications-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { STADION_MODULES, type StadionModule } from '@/constants/stadion-modules';
import { useGames } from '@/context/games-context';

export default function StadionScreen() {
  const router = useRouter();
  const { games } = useGames();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  // Default to the first loaded game once the (async) games list arrives -- mirrors the previous
  // seedGames[0]-at-mount default, just no longer available synchronously at the first render.
  useEffect(() => {
    if (!selectedGameId && games.length > 0) {
      setSelectedGameId(games[0].id);
    }
  }, [games, selectedGameId]);

  const selectedGame = games.find((game) => game.id === selectedGameId);
  const selectedGameLabel = selectedGame ? `${selectedGame.homeTeam} – ${selectedGame.awayTeam}` : '';

  const handleOpenModule = (module: StadionModule) => {
    if (module === 'stadionkarte') {
      router.push('/stadion/karte');
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
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {games.map((game) => {
          const gameLabel = `${game.homeTeam} – ${game.awayTeam}`;
          return (
            <Pressable
              key={game.id}
              onPress={() => setSelectedGameId(game.id)}
              style={[styles.filterChip, selectedGameId === game.id && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityLabel={`Spiel auswählen: ${gameLabel}`}
            >
              <Text style={[styles.filterChipText, selectedGameId === game.id && styles.filterChipTextActive]}>{gameLabel}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
  filterScroll: {
    flexGrow: 0,
    marginTop: Spacing.sm,
  },
  filterRow: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: 'center',
  },
  filterChipActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  filterChipText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  filterChipTextActive: {
    color: FeedColors.textPrimary,
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
