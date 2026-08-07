import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useUserWarnings } from '@/context/user-warnings-context';

// Never renders moderatorId, internalNote, reportId, or any other technical/moderator-only
// field — mapSupabaseUserWarningRow already strips internal_note before it reaches this
// component, so there is nothing here to accidentally leak even by mistake.
export function UserWarningsSection() {
  const { userWarnings, unacknowledgedWarningCount, isUserWarningsLoading, userWarningsError, acknowledgeWarning } = useUserWarnings();
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  if (isUserWarningsLoading || userWarningsError || userWarnings.length === 0) {
    return null;
  }

  const handleAcknowledge = async (id: string) => {
    if (acknowledgingId) {
      return;
    }

    setAcknowledgingId(id);
    await acknowledgeWarning(id);
    setAcknowledgingId(null);
  };

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <IconSymbol size={18} name="flag.fill" color={StatusColors.error} />
        <Text style={styles.sectionTitle}>Hinweise</Text>
        {unacknowledgedWarningCount > 0 ? (
          <Text style={styles.newCountHint}>
            {unacknowledgedWarningCount} neue{unacknowledgedWarningCount === 1 ? 'r' : ''} Hinweis{unacknowledgedWarningCount === 1 ? '' : 'e'}
          </Text>
        ) : null}
      </View>

      {userWarnings.map((warning) => (
        <View key={warning.id} style={styles.warningCard}>
          <View style={styles.warningHeaderRow}>
            <Text style={styles.warningTitle}>{warning.title}</Text>
            <View style={[styles.statusBadge, warning.isAcknowledged ? styles.statusBadgeAcknowledged : styles.statusBadgeNew]}>
              <Text style={[styles.statusBadgeText, warning.isAcknowledged && styles.statusBadgeTextAcknowledged]}>
                {warning.isAcknowledged ? 'Zur Kenntnis genommen' : 'Neu'}
              </Text>
            </View>
          </View>
          <Text style={styles.warningMessage}>{warning.message}</Text>
          <Text style={styles.warningTimestamp}>{warning.createdAt}</Text>

          {!warning.isAcknowledged ? (
            <Pressable
              onPress={() => void handleAcknowledge(warning.id)}
              disabled={acknowledgingId === warning.id}
              style={[styles.acknowledgeButton, acknowledgingId === warning.id && styles.acknowledgeButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Zur Kenntnis nehmen"
            >
              <Text style={styles.acknowledgeButtonText}>
                {acknowledgingId === warning.id ? 'Wird gespeichert …' : 'Zur Kenntnis nehmen'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  newCountHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
  },
  warningCard: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  warningHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  warningTitle: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeNew: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  statusBadgeAcknowledged: {
    backgroundColor: ClubColors.surface,
  },
  statusBadgeText: {
    color: StatusColors.error,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  statusBadgeTextAcknowledged: {
    color: ClubColors.text,
  },
  warningMessage: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  warningTimestamp: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    marginTop: Spacing.xs,
  },
  acknowledgeButton: {
    marginTop: Spacing.sm,
    minHeight: 40,
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
