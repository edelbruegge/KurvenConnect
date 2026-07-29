import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupsOverview } from '@/components/groups/groups-overview';
import { MessagesList } from '@/components/messages/messages-list';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';

type CommunicationSection = 'messages' | 'groups';

export default function MessagesScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<CommunicationSection>(params.section === 'groups' ? 'groups' : 'messages');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setSection('messages')}
          style={[styles.tabButton, section === 'messages' && styles.tabButtonActive]}
          accessibilityRole="button"
          accessibilityLabel="Nachrichten anzeigen"
        >
          <Text style={[styles.tabButtonText, section === 'messages' && styles.tabButtonTextActive]}>Nachrichten</Text>
        </Pressable>
        <Pressable
          onPress={() => setSection('groups')}
          style={[styles.tabButton, section === 'groups' && styles.tabButtonActive]}
          accessibilityRole="button"
          accessibilityLabel="Gruppen anzeigen"
        >
          <Text style={[styles.tabButtonText, section === 'groups' && styles.tabButtonTextActive]}>Gruppen</Text>
        </Pressable>
      </View>

      {section === 'messages' ? <MessagesList /> : <GroupsOverview />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomColor: FeedColors.cardBorder,
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  tabButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: FeedColors.textPrimary,
  },
});
