import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { CategoryBadge } from '@/components/feed/category-badge';
import { PostMediaCarousel } from '@/components/feed/post-media-carousel';
import { PostMetadata } from '@/components/feed/post-metadata';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ReportModal } from '@/components/reports/report-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { CategoryLabels, ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useBlocks } from '@/context/blocks-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useMessages } from '@/context/messages-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { useSaved } from '@/context/saved-context';
import { getReportTargetTypeForPost } from '@/data/feed-posts';
import { getConversationReferenceForPost } from '@/data/messages';
import type { ReportTargetType } from '@/data/reports';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';

export default function PostDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; focusComments?: string }>();
  const {
    posts,
    toggleLike,
    addComment,
    toggleRideRequest,
    getRemoteAuthorDisplay,
    createRemoteTripRequest,
    cancelRemoteTripRequest,
    pendingRequestCountForTrip,
    fetchPostById,
    isContentHidden,
  } = useFeedPosts();
  const { getOrCreateConversation, getOrCreateDirectConversation } = useMessages();
  const { isSaved, toggleSaved, getSavedContent } = useSaved();
  const { isInteractionBlocked } = useBlocks();
  const { getAuthorDisplay, getCommentAuthorDisplay, isCurrentUserId, isContentOwnedByCurrentUser } = useProfiles();
  const { hasReported } = useReports();
  const { canViewContent, isModeratedAway, canMessageUser } = useSafetySelectors();
  const [draftComment, setDraftComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmittingRideRequest, setIsSubmittingRideRequest] = useState(false);
  const [rideRequestActionError, setRideRequestActionError] = useState<string | null>(null);
  const [confirmingCancelAccepted, setConfirmingCancelAccepted] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const commentInputRef = useRef<TextInput | null>(null);
  const [commentsY, setCommentsY] = useState<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string; title: string; source?: 'local' | 'supabase' } | null>(
    null,
  );

  // Falls back to a saved item's team-independent resolved content (Vorgabe 20) when it isn't part
  // of the currently active club's loaded `posts` -- e.g. opened from "Gespeichert" while another
  // club is active.
  const localPost = params.id ? (posts.find((entry) => entry.id === params.id) ?? getSavedContent(params.id)) : undefined;

  // Post Detail must never say "nicht gefunden" just because the personalized/team-scoped feed
  // state never loaded this particular post (Vorgabe: Für-dich-Ranking ist niemals Source of Truth
  // für Post Detail). If it isn't already available locally, fetch it directly by id from
  // public.posts (fetchPostById, context/feed-posts-context.tsx) -- local state always wins once
  // available, this is purely a fallback for content the local state doesn't happen to hold.
  const [remoteFallback, setRemoteFallback] = useState<{ status: 'idle' | 'loading' | 'done'; post: typeof localPost; error: string | null }>({
    status: 'idle',
    post: undefined,
    error: null,
  });

  useEffect(() => {
    setRemoteFallback({ status: 'idle', post: undefined, error: null });
  }, [params.id]);

  useEffect(() => {
    if (!params.id || localPost || remoteFallback.status !== 'idle') return;

    let isCurrent = true;
    setRemoteFallback({ status: 'loading', post: undefined, error: null });

    fetchPostById(params.id).then(({ post: fetched, error }) => {
      if (!isCurrent) return;
      setRemoteFallback({ status: 'done', post: fetched ?? undefined, error });
    });

    return () => {
      isCurrent = false;
    };
  }, [params.id, localPost, remoteFallback.status, fetchPostById]);

  const post = localPost ?? remoteFallback.post;
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
    if (!params.id) {
      return <NotFoundView title="Beitrag nicht gefunden" message="Der angeforderte Beitrag konnte nicht gefunden werden." />;
    }

    if (remoteFallback.status !== 'done') {
      return <NotFoundView title="Beitrag wird geladen …" message="Einen Moment, der Beitrag wird geladen." />;
    }

    if (remoteFallback.error) {
      return (
        <NotFoundView
          title="Beitrag konnte nicht geladen werden"
          message={remoteFallback.error}
          onRetry={() => setRemoteFallback({ status: 'idle', post: undefined, error: null })}
        />
      );
    }

    return <NotFoundView title="Beitrag nicht gefunden" message="Der angeforderte Beitrag konnte nicht gefunden werden." />;
  }

  if (hasReported(getReportTargetTypeForPost(post.category), post.id)) {
    return <NotFoundView title="Inhalt nicht verfügbar" message="Dieser Inhalt wurde von dir gemeldet und wird nicht mehr angezeigt." />;
  }

  if (isModeratedAway(getReportTargetTypeForPost(post.category), post.id, post.userId)) {
    return <NotFoundView title="Inhalt nicht verfügbar" message="Dieser Inhalt wurde moderativ ausgeblendet." />;
  }

  // Real, server-driven moderation signal (content_restrictions via the content-visibility
  // realtime channel) -- distinct from isModeratedAway above (local/demo-only). Checked in
  // addition to it so a screen already open on this exact content, or one reached moments later
  // through the independent fetchPostById fallback (which queries the content tables directly and
  // is therefore unaffected by the list-pruning that same channel already does for remotePosts/
  // remoteTrips/etc.), stops rendering hidden content instead of leaving it visible.
  if (isContentHidden(getReportTargetTypeForPost(post.category), post.id)) {
    return <NotFoundView title="Inhalt nicht verfügbar" message="Dieser Inhalt wurde moderativ ausgeblendet." />;
  }

  const handleSubmitComment = async () => {
    if (!draftComment.trim() || isSubmittingComment) {
      return;
    }

    setIsSubmittingComment(true);
    setCommentError(null);
    const { error } = await addComment(post.id, draftComment);
    setIsSubmittingComment(false);

    if (error) {
      setCommentError(error);
      return;
    }

    setDraftComment('');
  };

  const isCommentInputValid = draftComment.trim().length > 0;
  const isTrip = post.category === 'Fahrt';
  const rideRequestLabel = post.rideRequestSent ? 'Anfrage zurückziehen' : 'Mitfahren anfragen';
  const author = post.source === 'supabase' && !isCurrentUserId(post.userId) ? getRemoteAuthorDisplay(post.userId) : getAuthorDisplay(post);
  const isOwnPost = isContentOwnedByCurrentUser({ source: post.source, ownerId: post.userId });
  const visibleComments = post.comments.filter((comment) => canViewContent('comment', comment.id, comment.userId));

  const handleAuthorPress = () => {
    router.push({ pathname: '/profile/[id]', params: { id: post.userId } });
  };

  const handleMessagePress = async () => {
    if (isStartingConversation) {
      return;
    }

    const reference = getConversationReferenceForPost(post);

    if (post.source !== 'supabase') {
      const conversationId = getOrCreateConversation(post.userId, reference);
      router.push({ pathname: '/messages/[id]', params: { id: conversationId } });
      return;
    }

    setIsStartingConversation(true);
    setMessageError(null);
    const { conversationId, error } = await getOrCreateDirectConversation({ otherUserId: post.userId, reference });
    setIsStartingConversation(false);

    if (error || !conversationId) {
      setMessageError(error ?? 'Die Unterhaltung konnte nicht gestartet werden.');
      return;
    }

    router.push({
      pathname: '/messages/[id]',
      params: reference
        ? { id: conversationId, referenceType: reference.type, referenceId: reference.id, referenceTitle: reference.title }
        : { id: conversationId },
    });
  };

  const renderRideRequestSection = () => {
    if (post.source !== 'supabase') {
      return (
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
      );
    }

    const status = post.rideRequestStatus;

    const handleCreateOrRetry = async () => {
      if (isSubmittingRideRequest) return;

      setIsSubmittingRideRequest(true);
      setRideRequestActionError(null);
      const { error } = await createRemoteTripRequest(post.id);
      setIsSubmittingRideRequest(false);

      if (error) {
        setRideRequestActionError(error);
      }
    };

    const handleCancel = async () => {
      if (isSubmittingRideRequest || !post.rideRequestId) return;

      setIsSubmittingRideRequest(true);
      setRideRequestActionError(null);
      const { error } = await cancelRemoteTripRequest(post.rideRequestId);
      setIsSubmittingRideRequest(false);

      if (error) {
        setRideRequestActionError(error);
      }
    };

    const handleConfirmCancelAccepted = async () => {
      setConfirmingCancelAccepted(false);
      await handleCancel();
    };

    return (
      <View style={styles.rideRequestSection}>
        {rideRequestActionError ? <Text style={styles.rideRequestErrorText}>{rideRequestActionError}</Text> : null}

        {status === 'accepted' ? (
          <>
            <View style={styles.rideRequestAcceptedBadge}>
              <Text style={styles.rideRequestAcceptedBadgeText}>✓ Anfrage angenommen</Text>
            </View>
            {confirmingCancelAccepted ? (
              <View style={styles.confirmBlock}>
                <Text style={styles.confirmText}>
                  Möchtest du deine bestätigte Teilnahme wirklich stornieren? Der Platz wird wieder freigegeben.
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={handleConfirmCancelAccepted}
                    style={styles.destructiveButton}
                    accessibilityRole="button"
                    accessibilityLabel="Stornieren bestätigen"
                  >
                    <Text style={styles.destructiveButtonText}>Stornieren bestätigen</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmingCancelAccepted(false)}
                    style={styles.cancelButton}
                    accessibilityRole="button"
                    accessibilityLabel="Abbrechen"
                  >
                    <Text style={styles.cancelButtonText}>Abbrechen</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmingCancelAccepted(true)}
                disabled={isSubmittingRideRequest}
                style={[styles.rideRequestButton, styles.rideRequestButtonActive, isSubmittingRideRequest && styles.rideRequestButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Teilnahme stornieren"
              >
                <Text style={[styles.rideRequestButtonText, styles.rideRequestButtonTextActive]}>Teilnahme stornieren</Text>
              </Pressable>
            )}
          </>
        ) : status === 'pending' ? (
          <>
            <Text style={styles.rideRequestStatusHint}>Anfrage gesendet</Text>
            <Pressable
              onPress={handleCancel}
              disabled={isSubmittingRideRequest}
              style={[styles.rideRequestButton, styles.rideRequestButtonActive, isSubmittingRideRequest && styles.rideRequestButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Anfrage zurückziehen"
            >
              <Text style={[styles.rideRequestButtonText, styles.rideRequestButtonTextActive]}>
                {isSubmittingRideRequest ? 'Wird bearbeitet …' : 'Anfrage zurückziehen'}
              </Text>
            </Pressable>
          </>
        ) : isInteractionBlocked(post.userId) ? (
          <Text style={styles.rideRequestStatusHint}>Diese Aktion ist derzeit nicht möglich.</Text>
        ) : (
          <>
            {status === 'rejected' ? <Text style={styles.rideRequestStatusHint}>Anfrage abgelehnt</Text> : null}
            <Pressable
              onPress={handleCreateOrRetry}
              disabled={isSubmittingRideRequest}
              style={[styles.rideRequestButton, isSubmittingRideRequest && styles.rideRequestButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Mitfahren anfragen"
            >
              <Text style={styles.rideRequestButtonText}>
                {isSubmittingRideRequest ? 'Wird gesendet …' : status === 'rejected' ? 'Erneut anfragen' : 'Mitfahren anfragen'}
              </Text>
            </Pressable>
            <Text style={styles.rideRequestHint}>Die Anfrage ist unverbindlich. Es wird noch kein Platz reserviert.</Text>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboardOnNative}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <Pressable
            onPress={handleAuthorPress}
            style={styles.userBlock}
            accessibilityRole="button"
            accessibilityLabel={`Profil von ${author.displayName} öffnen`}
          >
            <Avatar initials={author.initials} avatarUrl={author.avatarUrl} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{author.displayName}</Text>
              <Text style={styles.time}>{post.time}</Text>
            </View>
          </Pressable>
          <View style={styles.headerActions}>
            <CategoryBadge category={post.category} />
            <OverflowMenu
              accessibilityLabel="Weitere Aktionen zu diesem Beitrag"
              actions={[
                {
                  key: 'report-post',
                  label: hasReported(getReportTargetTypeForPost(post.category), post.id)
                    ? 'Bereits gemeldet'
                    : `${CategoryLabels[post.category]} melden`,
                  icon: 'flag.fill',
                  disabled: hasReported(getReportTargetTypeForPost(post.category), post.id),
                  onPress: () =>
                    setReportTarget({
                      type: getReportTargetTypeForPost(post.category),
                      id: post.id,
                      title: `${CategoryLabels[post.category]} melden`,
                      source: post.source,
                    }),
                },
              ]}
            />
          </View>
        </View>

        {post.media && post.media.length > 0 ? (
          <PostMediaCarousel media={post.media} maxHeight={480} />
        ) : post.hasImage ? (
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
              <IconSymbol size={16} name={post.likedByCurrentUser ? 'heart.fill' : 'heart'} color={post.likedByCurrentUser ? ClubColors.text : FeedColors.textSecondary} />
              <Text style={[styles.metaButtonText, post.likedByCurrentUser && styles.metaButtonTextActive]}>
                {post.likes}
              </Text>
            </Pressable>
            <View style={styles.metaItem}>
              <IconSymbol size={16} name="message" color={FeedColors.textSecondary} />
              <Text style={styles.meta}>{visibleComments.length}</Text>
            </View>
            <Pressable
              onPress={() => toggleSaved(post)}
              accessibilityRole="button"
              accessibilityLabel={isSaved(post.id) ? 'Nicht mehr gespeichert' : 'Speichern'}
              style={[styles.metaButton, isSaved(post.id) && styles.metaButtonActive]}
            >
              <IconSymbol size={16} name={isSaved(post.id) ? 'bookmark.fill' : 'bookmark'} color={isSaved(post.id) ? ClubColors.text : FeedColors.textSecondary} />
            </Pressable>
          </View>

          <PostMetadata post={post} variant="detail" />

          {!isOwnPost && canMessageUser(post.userId) ? (
            <View style={styles.messageSection}>
              {messageError ? <Text style={styles.messageErrorText}>{messageError}</Text> : null}
              <Pressable
                onPress={() => void handleMessagePress()}
                disabled={isStartingConversation}
                style={[styles.messageButton, isStartingConversation && styles.actionButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Nachricht senden an ${author.displayName}`}
              >
                <IconSymbol size={16} name="message" color={ClubColors.text} />
                <Text style={styles.messageButtonText}>{isStartingConversation ? 'Wird gestartet …' : 'Nachricht senden'}</Text>
              </Pressable>
            </View>
          ) : null}

          {isTrip && !isOwnPost ? renderRideRequestSection() : null}

          {isTrip && isOwnPost && post.source === 'supabase' ? (
            <View style={styles.manageRequestsSection}>
              <Pressable
                onPress={() => router.push({ pathname: '/trip/[id]/requests', params: { id: post.id } })}
                style={styles.manageRequestsButton}
                accessibilityRole="button"
                accessibilityLabel="Anfragen verwalten"
              >
                <Text style={styles.manageRequestsButtonText}>
                  Anfragen verwalten
                  {pendingRequestCountForTrip(post.id) > 0 ? ` (${pendingRequestCountForTrip(post.id)})` : ''}
                </Text>
              </Pressable>
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
              disabled={!isCommentInputValid || isSubmittingComment}
              style={[styles.commentButton, (!isCommentInputValid || isSubmittingComment) && styles.commentButtonDisabled]}
            >
              <Text style={styles.commentButtonText}>{isSubmittingComment ? 'Wird gesendet …' : 'Senden'}</Text>
            </Pressable>
          </View>

          {commentError ? <Text style={styles.commentErrorText}>{commentError}</Text> : null}

          {visibleComments.length > 0 ? (
            visibleComments.map((comment) => {
              const commentAuthor =
                comment.source === 'supabase' && comment.userId && !isCurrentUserId(comment.userId)
                  ? getRemoteAuthorDisplay(comment.userId)
                  : getCommentAuthorDisplay(comment);

              return (
              <View key={comment.id} style={styles.commentCard}>
                <View style={styles.commentHeader}>
                  <View style={styles.commentUserBlock}>
                    <Avatar initials={commentAuthor.initials} avatarUrl={commentAuthor.avatarUrl} />
                    <View style={styles.commentUserInfo}>
                      <Text style={styles.commentUsername}>{commentAuthor.displayName}</Text>
                      <Text style={styles.commentTimestamp}>{comment.timestamp}</Text>
                    </View>
                  </View>
                  {!(comment.userId && isContentOwnedByCurrentUser({ source: comment.source, ownerId: comment.userId })) ? (
                    <OverflowMenu
                      accessibilityLabel="Weitere Aktionen zu diesem Kommentar"
                      actions={[
                        {
                          key: 'report-comment',
                          label: hasReported('comment', comment.id) ? 'Bereits gemeldet' : 'Kommentar melden',
                          icon: 'flag.fill',
                          disabled: hasReported('comment', comment.id),
                          onPress: () => setReportTarget({ type: 'comment', id: comment.id, title: 'Kommentar melden', source: comment.source }),
                        },
                      ]}
                    />
                  ) : null}
                </View>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
              );
            })
          ) : (
            <Text style={styles.emptyComments}>Noch keine Kommentare. Sei der Erste.</Text>
          )}
        </View>
          </ScrollView>
          {keyboardVisible ? (
            <Pressable onPress={dismissKeyboardOnNative} style={styles.closeKeyboardButton} accessibilityRole="button" accessibilityLabel="Tastatur schließen">
              <Text style={styles.closeKeyboardButtonText}>Fertig</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>
      {reportTarget ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          title={reportTarget.title}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          source={reportTarget.source}
        />
      ) : null}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
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
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  metaButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  metaButtonTextActive: {
    color: ClubColors.text,
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
  messageSection: {
    marginTop: Spacing.md,
  },
  messageErrorText: {
    color: '#F87171',
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  messageButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  rideRequestSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  rideRequestButton: {
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  rideRequestButtonActive: {
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  rideRequestButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  rideRequestButtonTextActive: {
    color: ClubColors.text,
  },
  rideRequestHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  rideRequestButtonDisabled: {
    opacity: 0.5,
  },
  rideRequestErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  rideRequestStatusHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  rideRequestAcceptedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: Spacing.sm,
  },
  rideRequestAcceptedBadgeText: {
    color: ClubColors.text,
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
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  destructiveButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  destructiveButtonText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
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
  manageRequestsSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  manageRequestsButton: {
    alignSelf: 'flex-start',
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  manageRequestsButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
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
  commentErrorText: {
    color: '#F87171',
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  commentCard: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
