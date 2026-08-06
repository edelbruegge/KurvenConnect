import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useReports } from '@/context/reports-context';
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from '@/data/reports';

type ReportModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  targetType: ReportTargetType;
  targetId: string;
  // 'supabase' reports real Supabase content/users persistently; anything else (including
  // omitted) keeps using the existing local in-memory path.
  source?: 'local' | 'supabase';
};

export function ReportModal({ visible, onClose, title, targetType, targetId, source }: ReportModalProps) {
  const { reportTarget } = useReports();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSelectedReason(null);
      setDetails('');
      setSubmitted(false);
      setSubmitError(null);
    }, 200);
  };

  const handleSubmit = async () => {
    if (!selectedReason || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const { error } = await reportTarget({ targetType, targetId, reason: selectedReason, details, source });
    setIsSubmitting(false);

    if (error) {
      setSubmitError(error);
      return;
    }

    setSubmitted(true);
    setTimeout(handleClose, 900);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdropWrapper}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.card} onPress={() => Keyboard.dismiss()}>
            {submitted ? (
              <View style={styles.confirmation}>
                <IconSymbol size={32} name="checkmark.circle.fill" color={ClubColors.text} />
                <Text style={styles.confirmationText}>Meldung gesendet. Danke für deinen Hinweis.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>Warum meldest du diesen Inhalt?</Text>

                <View style={styles.reasonList}>
                  {REPORT_REASONS.map((reason) => {
                    const isSelected = selectedReason === reason;
                    return (
                      <Pressable
                        key={reason}
                        onPress={() => setSelectedReason(reason)}
                        style={[styles.reasonChip, isSelected && styles.reasonChipActive]}
                        accessibilityRole="button"
                        accessibilityLabel={reason}
                      >
                        <Text style={[styles.reasonChipText, isSelected && styles.reasonChipTextActive]}>{reason}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Zusätzliche Details (optional)"
                  placeholderTextColor={FeedColors.textSecondary}
                  style={styles.detailsInput}
                  multiline
                />

                {submitError ? <Text style={styles.submitErrorText}>{submitError}</Text> : null}

                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={!selectedReason || isSubmitting}
                  style={[styles.submitButton, (!selectedReason || isSubmitting) && styles.submitButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Meldung absenden"
                >
                  <Text style={styles.submitButtonText}>{isSubmitting ? 'Wird gesendet …' : 'Meldung absenden'}</Text>
                </Pressable>

                <Pressable onPress={handleClose} style={styles.cancelButton} accessibilityRole="button" accessibilityLabel="Abbrechen">
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrapper: {
    flex: 1,
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
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  subtitle: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  reasonList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  reasonChip: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  reasonChipActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  reasonChipText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  reasonChipTextActive: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  detailsInput: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    color: FeedColors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    marginBottom: Spacing.md,
  },
  submitErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  submitButton: {
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  confirmation: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  confirmationText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    textAlign: 'center',
  },
});
