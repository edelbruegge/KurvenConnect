import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedColors, FontSizes, Spacing } from '@/constants/theme';

type LegalPageProps = {
  updatedAt: string;
  children: React.ReactNode;
};

// Shared chrome for the three legal screens (Datenschutz/Impressum/Nutzungsbedingungen) -- the
// screen title itself comes from each route's own Stack.Screen `options.title`, this only wraps
// the body content so all three read consistently.
export function LegalPage({ updatedAt, children }: LegalPageProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.updatedAt}>Stand: {updatedAt}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function LegalHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function LegalParagraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export function LegalListItem({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.listItemRow}>
      <Text style={styles.listItemBullet}>–</Text>
      <Text style={styles.listItemText}>{children}</Text>
    </View>
  );
}

// Deliberately loud, not a subtle caption -- both Datenschutzerklärung and Nutzungsbedingungen
// read as finished, polished text once written, which makes it easy to forget they have not
// actually been checked by a lawyer yet. The master-prompt for this project explicitly requires
// not creating text that fakes legal certainty and marking what still needs review.
export function LegalDraftNotice() {
  return (
    <View style={styles.draftNotice}>
      <Text style={styles.draftNoticeText}>
        Entwurf — vor der Veröffentlichung von einer Rechtsberatung prüfen lassen.
      </Text>
    </View>
  );
}

// For the Impressum specifically, where entire fields are still bracketed placeholders rather
// than a general legal-review caveat.
export function LegalPlaceholderNotice() {
  return (
    <View style={styles.draftNotice}>
      <Text style={styles.draftNoticeText}>
        Enthält noch Platzhalter — vor der Veröffentlichung mit den echten Angaben ausfüllen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  container: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  updatedAt: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.md,
  },
  heading: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.subtitle,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  paragraph: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 21,
    marginBottom: Spacing.xs,
  },
  listItemRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  listItemBullet: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
  },
  listItemText: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 21,
  },
  draftNotice: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
    borderRadius: 10,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  draftNoticeText: {
    color: '#F87171',
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
