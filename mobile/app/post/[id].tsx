import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { CategoryBadge } from '@/components/feed/category-badge';
import { PostMetadata } from '@/components/feed/post-metadata';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useProfiles } from '@/context/profile-context';

export default function PostDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; focusComments?: string }>();
  const { posts, toggleLike, addComment, toggleRideRequest } = useFeedPosts();
  const { getAuthorDisplay } = useProfiles();
  const [draftComment, setDraftComment] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const commentInputRef = useRef<TextInput | null>(null);
  const [commentsY, setCommentsY] = useState<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const post = params.id ? posts.find((entry) => entry.id === params.id) : undefined;
  const focusComments = params.focusComments === 'true';

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!focusComments || !post || commentsY == null) return;

    scrollRef.current?.scrollTo({ y: Math.max(0, commentsY - 12), animated: true });
    setTimeout(() => commentInputRef.current?.focus(), 250);
  }, [focusComments, commentsY, post]);

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

  const isCommentInputValid = draftComment.trim().length > 0;
  const isTrip = post.category === 'Fahrt';
  const rideRequestLabel = post.rideRequestSent ? 'Anfrage zurückziehen' : 'Mitfahren anfragen';
  const author = getAuthorDisplay(post);

  const handleAuthorPress = () => {
    router.push({ pathname: '/profile/[id]', params: { id: post.userId } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <Pressable
            onPress={handleAuthorPress}
            style={styles.userBlock}
            accessibilityRole="button"
            accessibilityLabel={`Profil von ${author.displayName} öffnen`}
          >
            <Avatar initials={author.initials} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{author.displayName}</Text>
              <Text style={styles.time}>{post.time}</Text>
            </View>
          </Pressable>
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
              accessibilityRole="button"
              accessibilityLabel={post.likedByCurrentUser ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
              style={[styles.metaButton, post.likedByCurrentUser && styles.metaButtonActive]}
            >
              <IconSymbol size={16} name={post.likedByCurrentUser ? 'heart.fill' : 'heart'} color={post.likedByCurrentUser ? '#F59E0B' : FeedColors.textSecondary} />
              <Text style={[styles.metaButtonText, post.likedByCurrentUser && styles.metaButtonTextActive]}>
                {post.likes}
              </Text>
            </Pressable>
            <View style={styles.metaItem}>
              <IconSymbol size={16} name="message" color={FeedColors.textSecondary} />
              <Text style={styles.meta}>{post.comments.length}</Text>
            </View>
          </View>

          <PostMetadata post={post} variant="detail" />

          {isTrip ? (
            <View style={styles.rideRequestSection}>
              <Pressable
                onPress={() => toggleRideRequest(post.id)}
                accessibilityRole="button"
                accessibilityLabel={post.rideRequestSent ? 'Mitfahranfrage zurückziehen' : 'Mitfahren anfragen'}
                style={[styles.rideRequestButton, post.rideRequestSent && styles.rideRequestButtonActive]}
              >
                <Text style={[styles.rideRequestButtonText, post.rideRequestSent && styles.rideRequestButtonTextActive]}>
                  {rideRequestLabel}
                </Text>
              </Pressable>
              <Text style={styles.rideRequestHint}>Die Anfrage ist unverbindlich. Es wird noch kein Platz reserviert.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.commentsSection} onLayout={(e) => setCommentsY(e.nativeEvent.layout.y)}>
          <Text style={styles.commentsTitle}>Kommentare</Text>

          <View style={styles.commentComposer}>
            <TextInput
              value={draftComment}
              onChangeText={setDraftComment}
              placeholder="Kurz einen Kommentar schreiben…"
              placeholderTextColor={FeedColors.textSecondary}
              multiline
              style={styles.commentInput}
              ref={commentInputRef}
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
          {keyboardVisible ? (
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.closeKeyboardButton} accessibilityRole="button" accessibilityLabel="Tastatur schließen">
              <Text style={styles.closeKeyboardButtonText}>Fertig</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  rideRequestSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  rideRequestButton: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    alignSelf: 'flex-start',
  },
  rideRequestButtonActive: {
    backgroundColor: '#1F2937',
    borderColor: '#F59E0B',
  },
  rideRequestButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  rideRequestButtonTextActive: {
    color: '#F59E0B',
  },
  rideRequestHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.sm,
    lineHeight: 18,
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
  closeKeyboardButton: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.xl + 8,
    backgroundColor: FeedColors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  closeKeyboardButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
