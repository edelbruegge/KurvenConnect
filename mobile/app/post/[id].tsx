import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { CategoryBadge } from '@/components/feed/category-badge';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';

export default function PostDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { posts, toggleLike, addComment } = useFeedPosts();
  const [draftComment, setDraftComment] = useState('');

  const post = params.id ? posts.find((entry) => entry.id === params.id) : undefined;

  if (!post) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Beitrag nicht gefunden</Text>
          <Text style={styles.errorText}>Der angeforderte Beitrag konnte nicht gefunden werden.</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleSubmitComment = () => {
    if (!draftComment.trim()) {
      return;
    }

    addComment(post.id, draftComment);
    setDraftComment('');
  };

  const renderDetails = () => {
    if (post.category === 'Ticket' && post.ticketDetails) {
      return (
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Ticket-Details</Text>
          <Text style={styles.detailsText}>Preis: {post.ticketDetails.price}</Text>
          <Text style={styles.detailsText}>Spiel: {post.ticketDetails.game}</Text>
          <Text style={styles.detailsText}>Block: {post.ticketDetails.block}</Text>
        </View>
      );
    }

    if (post.category === 'Fahrt' && post.tripDetails) {
      return (
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Fahrdetails</Text>
          <Text style={styles.detailsText}>Abfahrtsort: {post.tripDetails.departure}</Text>
          <Text style={styles.detailsText}>Ziel: {post.tripDetails.destination}</Text>
          <Text style={styles.detailsText}>Abfahrtszeit: {post.tripDetails.departureTime}</Text>
          <Text style={styles.detailsText}>Freie Plätze: {post.tripDetails.freeSeats}</Text>
        </View>
      );
    }

    if (post.category === 'Gesuch' && post.requestDetails) {
      return (
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Gesuch</Text>
          <Text style={styles.detailsText}>Gesuchte Leistung: {post.requestDetails.requestedService}</Text>
        </View>
      );
    }

    return null;
  };

  const isCommentInputValid = draftComment.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.userBlock}>
            <Avatar initials={post.initials} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{post.user}</Text>
              <Text style={styles.time}>{post.time}</Text>
            </View>
          </View>
          <CategoryBadge category={post.category} />
        </View>

        {post.hasImage ? (
          <View style={styles.imageBox}>
            <Text style={styles.imageText}>Bildbereich</Text>
          </View>
        ) : null}

        <View style={styles.contentBlock}>
          <Text style={styles.description}>{post.description}</Text>

          <View style={styles.metaRow}>
            <Pressable
              onPress={() => toggleLike(post.id)}
              style={[styles.metaButton, post.likedByCurrentUser && styles.metaButtonActive]}
            >
              <Text style={[styles.metaButtonText, post.likedByCurrentUser && styles.metaButtonTextActive]}>
                {post.likedByCurrentUser ? '♥' : '♡'} {post.likes}
              </Text>
            </Pressable>
            <Text style={styles.meta}>💬 {post.comments.length}</Text>
          </View>

          {renderDetails()}
        </View>

        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Kommentare</Text>

          <View style={styles.commentComposer}>
            <TextInput
              value={draftComment}
              onChangeText={setDraftComment}
              placeholder="Kurz einen Kommentar schreiben…"
              placeholderTextColor={FeedColors.textSecondary}
              multiline
              style={styles.commentInput}
            />
            <Pressable
              onPress={handleSubmitComment}
              disabled={!isCommentInputValid}
              style={[styles.commentButton, !isCommentInputValid && styles.commentButtonDisabled]}
            >
              <Text style={styles.commentButtonText}>Senden</Text>
            </Pressable>
          </View>

          {post.comments.length > 0 ? (
            post.comments.map((comment) => (
              <View key={comment.id} style={styles.commentCard}>
                <View style={styles.commentHeader}>
                  <View style={styles.commentUserBlock}>
                    <Avatar initials={comment.initials} />
                    <View style={styles.commentUserInfo}>
                      <Text style={styles.commentUsername}>{comment.username}</Text>
                      <Text style={styles.commentTimestamp}>{comment.timestamp}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyComments}>Noch keine Kommentare. Sei der Erste.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userInfo: {
    marginLeft: Spacing.sm,
  },
  userName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  time: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  contentBlock: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  imageBox: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.md,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  imageText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  metaButton: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  metaButtonActive: {
    backgroundColor: '#1F2937',
    borderColor: '#F59E0B',
  },
  metaButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  metaButtonTextActive: {
    color: '#F59E0B',
  },
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  detailsCard: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  detailsTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  detailsText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: 4,
  },
  commentsSection: {
    marginTop: Spacing.md,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  commentsTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  commentComposer: {
    marginBottom: Spacing.md,
  },
  commentInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    color: FeedColors.textPrimary,
    marginBottom: Spacing.sm,
  },
  commentButton: {
    alignSelf: 'flex-start',
    backgroundColor: FeedColors.textPrimary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  commentButtonDisabled: {
    opacity: 0.5,
  },
  commentButtonText: {
    color: FeedColors.background,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  commentCard: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  commentHeader: {
    marginBottom: Spacing.xs,
  },
  commentUserBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentUserInfo: {
    marginLeft: Spacing.sm,
  },
  commentUsername: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  commentTimestamp: {
    color: FeedColors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  commentText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
  },
  emptyComments: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  errorTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  errorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  backButton: {
    backgroundColor: FeedColors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  backButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
  },
});
