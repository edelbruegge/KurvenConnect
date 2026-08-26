import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useUserWarnings } from '@/context/user-warnings-context';

// Only ever shows *active* (not yet acknowledged) warnings -- an acknowledged one disappears from
// this view immediately and permanently, it is never shown again here, even though the row itself
// (with acknowledged_at set) is kept forever in public.user_warnings for moderators. Never renders
// moderatorId, internalNote, reportId, or any other technical/moderator-only field --
// mapSupabaseUserWarningRow already strips internal_note before it reaches this component, so
// there is nothing here to accidentally leak even by mistake.
export function UserWarningsSection() {
  const { userWarnings, isUserWarningsLoading, userWarningsError, acknowledgeWarning } = useUserWarnings();
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [ackErrorsById, setAckErrorsById] = useState<Record<string, string>>({});

  const activeWarnings = userWarnings.filter((warning) => !warning.isAcknowledged);

  if (isUserWarningsLoading || userWarningsError || activeWarnings.length === 0) {
    return null;
  }

  const handleAcknowledge = async (id: string) => {
    if (acknowledgingId) {
      return;
    }

    setAcknowledgingId(id);
    setAckErrorsById((current) => ({ ...current, [id]: '' }));

    const { error } = await acknowledgeWarning(id);

    setAcknowledgingId(null);

    // On error the warning simply stays in `userWarnings` unacknowledged (acknowledgeWarning never
    // touches local state unless the RPC actually succeeds) -- it keeps showing here exactly as
    // before, now with an explanation of why the tap didn't work.
    if (error) {
      setAckErrorsById((current) => ({ ...current, [id]: error }));
    }
  };

  return (
    <View style={styles.section}>
      {activeWarnings.map((warning) => (
        <View key={warning.id} style={styles.warningCard}>
          <View style={styles.titleRow}>
            <IconSymbol size={18} name="flag.fill" color={StatusColors.error} />
            <Text style={styles.warningTitle}>Verwarnung</Text>
          </View>
          <Text style={styles.warningMessage}>{warning.message}</Text>
          <Text style={styles.warningRule}>Bitte beachte unsere Community-Regeln.</Text>
          <Text style={styles.warningTimestamp}>{warning.createdAt}</Text>

          {ackErrorsById[warning.id] ? <Text style={styles.errorText}>{ackErrorsById[warning.id]}</Text> : null}

          <Pressable
            onPress={() => void handleAcknowledge(warning.id)}
            disabled={acknowledgingId === warning.id}
            style={[styles.acknowledgeButton, acknowledgingId === warning.id && styles.acknowledgeButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Zur Kenntnis genommen"
          >
            <Text style={styles.acknowledgeButtonText}>{acknowledgingId === warning.id ? 'Wird gespeichert …' : 'Zur Kenntnis genommen'}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.md,
  },
  warningCard: {
    backgroundColor: FeedColors.cardBackground,
    borderWidth: 1,
    borderColor: StatusColors.error,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  warningTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  warningMessage: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  warningRule: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  warningTimestamp: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    marginTop: Spacing.xs,
  },
  errorText: {
    color: StatusColors.error,
    fontSize: FontSizes.badge,
    marginTop: Spacing.sm,
  },
  acknowledgeButton: {
    marginTop: Spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
  },
  acknowledgeButtonDisabled: {
    opacity: 0.5,
  },
  acknowledgeButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
});
