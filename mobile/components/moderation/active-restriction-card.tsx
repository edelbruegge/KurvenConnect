import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useModeration } from '@/context/moderation-context';
import { REPORT_TARGET_TYPE_LABELS } from '@/data/reports';
import type { ContentRestriction } from '@/lib/map-supabase-content-restriction';

type ActiveRestrictionCardProps = {
  restriction: ContentRestriction;
  onOpenReport?: () => void;
  onRestore: () => Promise<void>;
  isRestoring: boolean;
};

export function ActiveRestrictionCard({ restriction, onOpenReport, onRestore, isRestoring }: ActiveRestrictionCardProps) {
  const { getModerationTargetPreview } = useModeration();
  const [preview, setPreview] = useState<{ exists: boolean; previewText?: string } | undefined>(undefined);
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    getModerationTargetPreview(restriction.targetType, restriction.targetId).then((result) => {
      if (!isCurrent) return;
      setPreview(result);
    });

    return () => {
      isCurrent = false;
    };
  }, [restriction.targetType, restriction.targetId, getModerationTargetPreview]);

  const handleConfirmRestore = async () => {
    setConfirmingRestore(false);
    await onRestore();
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{REPORT_TARGET_TYPE_LABELS[restriction.targetType]}</Text>
        </View>
        <Text style={styles.timestamp}>{restriction.createdAt}</Text>
      </View>

      <Text style={styles.preview} numberOfLines={2}>
        {preview === undefined ? 'Wird geladen …' : preview.exists ? preview.previewText || '—' : 'Inhalt nicht mehr verfügbar.'}
      </Text>

      {confirmingRestore ? (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmText}>Möchtest du diesen Inhalt wiederherstellen?</Text>
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => void handleConfirmRestore()}
              disabled={isRestoring}
              style={[styles.confirmButton, isRestoring && styles.actionDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Bestätigen"
            >
              <Text style={styles.confirmButtonText}>{isRestoring ? 'Wird gespeichert …' : 'Bestätigen'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmingRestore(false)}
              disabled={isRestoring}
              style={[styles.cancelButton, isRestoring && styles.actionDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Abbrechen"
            >
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          {onOpenReport ? (
            <Pressable onPress={onOpenReport} style={styles.openButton} accessibilityRole="button" accessibilityLabel="Öffnen">
              <Text style={styles.openButtonText}>Öffnen</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setConfirmingRestore(true)}
            style={styles.restoreButton}
            accessibilityRole="button"
            accessibilityLabel="Inhalt wiederherstellen"
          >
            <Text style={styles.restoreButtonText}>Wiederherstellen</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  typeBadge: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  timestamp: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
  },
  preview: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    marginBottom: Spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  openButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.surface,
  },
  openButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  restoreButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
  },
  restoreButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  confirmBlock: {
    gap: Spacing.sm,
  },
  confirmText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
  },
  confirmButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
  },
  confirmButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  cancelButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  cancelButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  actionDisabled: {
    opacity: 0.5,
  },
});
