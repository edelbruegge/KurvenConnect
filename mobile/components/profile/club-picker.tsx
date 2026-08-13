import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { KnownTeam } from '@/data/database-games';

type ClubPickerProps = {
  knownTeams: KnownTeam[];
  selectedTeamId: string | null;
  onSelect: (team: KnownTeam) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

type LeagueGroup = {
  key: string;
  heading: string;
  teams: KnownTeam[];
};

// Fixed, known league order/labels for the three synced competitions (see
// supabase/functions/sync-football-games/index.ts) -- 'Weitere Vereine' is a defensive catch-all
// for any team with no resolvable league yet (get_known_teams() returns league_shortcut = null in
// that case), never a wrong/guessed league.
const LEAGUE_ORDER: { key: string; heading: string }[] = [
  { key: 'bl1', heading: 'Bundesliga' },
  { key: 'bl2', heading: '2. Bundesliga' },
  { key: 'bl3', heading: '3. Liga' },
];

function groupTeamsByLeague(teams: KnownTeam[]): LeagueGroup[] {
  const byLeague = new Map<string, KnownTeam[]>();
  const withoutLeague: KnownTeam[] = [];

  for (const team of teams) {
    if (!team.leagueShortcut) {
      withoutLeague.push(team);
      continue;
    }
    const existing = byLeague.get(team.leagueShortcut) ?? [];
    existing.push(team);
    byLeague.set(team.leagueShortcut, existing);
  }

  const groups: LeagueGroup[] = LEAGUE_ORDER.filter((league) => byLeague.has(league.key)).map((league) => ({
    key: league.key,
    heading: league.heading,
    teams: byLeague.get(league.key) ?? [],
  }));

  if (withoutLeague.length > 0) {
    groups.push({ key: '__other__', heading: 'Weitere Vereine', teams: withoutLeague });
  }

  return groups;
}

/**
 * Reusable club picker over public.team_stadium_mappings (via GamesContext's knownTeams, loaded
 * from the get_known_teams() RPC) -- the one real club data source in the app, no second/parallel
 * club list. Used inline both in the onboarding flow (app/onboarding.tsx) and in edit-profile.tsx,
 * mirroring the established search+grouped-list pattern from components/stadion/game-selector.tsx.
 */
export function ClubPicker({ knownTeams, selectedTeamId, onSelect, isLoading, error, onRetry }: ClubPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const visibleTeams = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return knownTeams;
    return knownTeams.filter((team) => team.teamName.toLowerCase().includes(query));
  }, [knownTeams, searchQuery]);

  const groupedTeams = useMemo(() => groupTeamsByLeague(visibleTeams), [visibleTeams]);

  return (
    <View style={styles.container}>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Verein suchen"
        placeholderTextColor={FeedColors.textSecondary}
        style={styles.searchInput}
        accessibilityLabel="Verein suchen"
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <Text style={styles.emptyText}>Vereine werden geladen …</Text>
      ) : visibleTeams.length === 0 ? (
        <Text style={styles.emptyText}>Keine Vereine gefunden.</Text>
      ) : (
        <View style={styles.list}>
          {groupedTeams.map((group) => (
            <View key={group.key}>
              <Text style={styles.leagueHeading}>{group.heading}</Text>
              {group.teams.map((team) => {
                const isSelected = team.externalTeamId === selectedTeamId;
                return (
                  <Pressable
                    key={team.externalTeamId}
                    onPress={() => onSelect(team)}
                    style={[styles.row, isSelected && styles.rowActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`${team.teamName} auswählen`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.rowText, isSelected && styles.rowTextActive]}>{team.teamName}</Text>
                    {isSelected ? <IconSymbol size={20} name="checkmark.circle.fill" color={ClubColors.text} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    color: FeedColors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  list: {
    gap: Spacing.xs,
  },
  leagueHeading: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xs,
    minHeight: 48,
  },
  rowActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  rowText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  rowTextActive: {
    color: ClubColors.text,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    paddingVertical: Spacing.md,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  errorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  retryButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
