import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { ClubPicker } from '@/components/profile/club-picker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useActiveClub } from '@/context/active-club-context';
import { useGames } from '@/context/games-context';

/**
 * The one, app-wide "which club am I currently browsing" control (Vorgabe 34) -- shows the active
 * club and opens the existing ClubPicker (components/profile/club-picker.tsx, unchanged) to switch
 * it. Mounted in the Feed and Stadion headers; every other club-scoped screen (Fahrten, Treffen,
 * Suche, Gruppen-Vorschläge) already follows the same activeTeamId automatically, so no second,
 * independent switcher is needed there.
 */
export function ActiveClubBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { activeTeam, activeTeamId, setActiveTeam } = useActiveClub();
  const { knownTeams, isKnownTeamsLoading, knownTeamsError, refreshKnownTeams } = useGames();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setIsOpen(true)} style={[styles.badge, style]} accessibilityRole="button" accessibilityLabel="Verein wechseln">
        <IconSymbol size={16} name="shield.fill" color={ClubColors.text} />
        <Text style={styles.badgeText} numberOfLines={1}>
          {activeTeam?.teamName ?? 'Verein wählen'}
        </Text>
        <IconSymbol size={16} name="chevron.right" color={FeedColors.textSecondary} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.cardTitle}>Verein wechseln</Text>
            <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
              <ClubPicker
                knownTeams={knownTeams}
                selectedTeamId={activeTeamId}
                onSelect={(team) => {
                  setActiveTeam(team);
                  setIsOpen(false);
                }}
                isLoading={isKnownTeamsLoading}
                error={knownTeamsError}
                onRetry={refreshKnownTeams}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    maxWidth: 260,
  },
  badgeText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '700',
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    maxHeight: '80%',
  },
  cardTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  pickerScroll: {
    flexGrow: 0,
  },
});
