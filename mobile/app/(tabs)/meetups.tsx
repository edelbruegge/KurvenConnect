import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { MessagesButton } from '@/components/navigation/messages-button';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { getPostDetailPathname, type FeedPost } from '@/data/feed-posts';
import { seedGames } from '@/data/games';

export default function MeetupsScreen() {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const meetups = posts.filter((post) => post.category === 'Treffpunkt');
  const filteredMeetups = selectedGameId
    ? meetups.filter((post) => post.meetupDetails?.gameId === selectedGameId)
    : meetups;

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Treffpunkte</Text>
            <Text style={styles.subtitle}>Verabredungen rund um den Spieltag</Text>
          </View>
          <MessagesButton />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        <Pressable
          onPress={() => setSelectedGameId(null)}
          style={[styles.filterChip, selectedGameId === null && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, selectedGameId === null && styles.filterChipTextActive]}>
            Alle Spiele
          </Text>
        </Pressable>
        {seedGames.map((game) => (
          <Pressable
            key={game.id}
            onPress={() => setSelectedGameId(game.id)}
            style={[styles.filterChip, selectedGameId === game.id && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, selectedGameId === game.id && styles.filterChipTextActive]}>
              {game.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filteredMeetups.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Noch keine Treffpunkte vorhanden.</Text>
          <Text style={styles.emptyText}>Über den Plus-Button kannst du direkt einen neuen Treffpunkt anlegen.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {filteredMeetups.map((meetup) => (
            <FeedPostCard
              key={meetup.id}
              post={meetup}
              onPress={() => handleOpenPost(meetup)}
              onLikePress={() => toggleLike(meetup.id)}
              onCommentPress={() =>
                router.push({ pathname: getPostDetailPathname(meetup), params: { id: meetup.id, focusComments: 'true' } })
              }
            />
          ))}
        </ScrollView>
      )}
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
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
});
