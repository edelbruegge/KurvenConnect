import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { CategoryBadge } from '@/components/feed/category-badge';
import { PostMetadata } from '@/components/feed/post-metadata';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useProfiles } from '@/context/profile-context';
import { getMeetupAttendeeCount, isMeetupFull } from '@/data/feed-posts';

async function openInMaps(address: string) {
  const encoded = encodeURIComponent(address);
  const url = Platform.select({
    ios: `maps:0,0?q=${encoded}`,
    android: `geo:0,0?q=${encoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  });

  try {
    const supported = url ? await Linking.canOpenURL(url) : false;
    if (url && supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
    }
  } catch {
    // Keine Karten-App verfügbar oder Öffnen fehlgeschlagen – App soll dabei nicht abstürzen.
  }
}

export default function MeetupDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; focusComments?: string }>();
  const { posts, toggleLike, addComment, toggleMeetupAttendance } = useFeedPosts();
  const { currentUser, getAuthorDisplay, getUserById } = useProfiles();
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

  if (!post || post.category !== 'Treffpunkt' || !post.meetupDetails) {
    return <NotFoundView title="Treffpunkt nicht gefunden" message="Der angeforderte Treffpunkt konnte nicht gefunden werden." />;
  }

  const meetup = post.meetupDetails;
  const author = getAuthorDisplay(post);
  const isOrganizer = post.userId === currentUser.id;
  const isAttending = meetup.attendeeIds.includes(currentUser.id);
  const attendeeCount = getMeetupAttendeeCount(meetup);
  const full = isMeetupFull(meetup);

  const attendees = meetup.attendeeIds
    .map((id) => getUserById(id))
    .filter((profile): profile is NonNullable<typeof profile> => profile !== undefined);

  const handleAuthorPress = () => {
    router.push({ pathname: '/profile/[id]', params: { id: post.userId } });
  };

  const handleOpenAttendeeProfile = (userId: string) => {
    router.push({ pathname: '/profile/[id]', params: { id: userId } });
  };

  const handleSubmitComment = () => {
    if (!draftComment.trim()) {
      return;
    }

    addComment(post.id, draftComment);
    setDraftComment('');
  };

  const isCommentInputValid = draftComment.trim().length > 0;

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

            <View style={styles.contentBlock}>
              <Text style={styles.title}>{meetup.title}</Text>
              <Text style={styles.gameLabel}>{meetup.gameLabel}</Text>
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
                  <Text style={styles.meta}>{post.comments.length}</Text>
                </View>
                <View style={styles.metaItem}>
                  <IconSymbol size={16} name="person.3.fill" color={FeedColors.textSecondary} />
                  <Text style={styles.meta}>
                    {attendeeCount}
                    {meetup.maxAttendees != null ? ` / ${meetup.maxAttendees}` : ''} Teilnehmer
                  </Text>
                </View>
              </View>

              <PostMetadata post={post} variant="detail" />

              <View style={styles.actionsSection}>
                {isOrganizer ? (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>Von dir organisiert</Text>
                  </View>
                ) : isAttending ? (
                  <View>
                    <View style={[styles.statusPill, styles.statusPillSuccess]}>
                      <IconSymbol size={16} name="checkmark.circle.fill" color={StatusColors.success} />
                      <Text style={[styles.statusPillText, styles.statusPillSuccessText]}>Du nimmst teil</Text>
                    </View>
                    <Pressable
                      onPress={() => toggleMeetupAttendance(post.id)}
                      style={styles.cancelButton}
                      accessibilityRole="button"
                      accessibilityLabel="Teilnahme absagen"
                    >
                      <Text style={styles.cancelButtonText}>Teilnahme absagen</Text>
                    </Pressable>
                  </View>
                ) : full ? (
                  <View style={[styles.statusPill, styles.statusPillError]}>
                    <Text style={[styles.statusPillText, styles.statusPillErrorText]}>Ausgebucht</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => toggleMeetupAttendance(post.id)}
                    style={styles.joinButton}
                    accessibilityRole="button"
                    accessibilityLabel="Teilnehmen"
                  >
                    <Text style={styles.joinButtonText}>Teilnehmen</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => openInMaps(meetup.location)}
                  style={styles.mapButton}
                  accessibilityRole="button"
                  accessibilityLabel="In Karten öffnen"
                >
                  <IconSymbol size={16} name="mappin.and.ellipse" color={ClubColors.text} />
                  <Text style={styles.mapButtonText}>In Karten öffnen</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.attendeesSection}>
              <Text style={styles.sectionTitle}>Teilnehmer</Text>

              <View style={styles.attendeeRow}>
                <Avatar initials={author.initials} />
                <View style={styles.attendeeInfo}>
                  <Text style={styles.attendeeName}>{author.displayName}</Text>
                </View>
                <View style={styles.organizerBadge}>
                  <Text style={styles.organizerBadgeText}>Organisator</Text>
                </View>
              </View>

              {attendees.length === 0 ? (
                <Text style={styles.emptyAttendees}>Noch keine weiteren Teilnehmer.</Text>
              ) : (
                attendees.map((attendee) => (
                  <Pressable
                    key={attendee.id}
                    onPress={() => handleOpenAttendeeProfile(attendee.id)}
                    style={styles.attendeeRow}
                    accessibilityLabel={`Profil von ${attendee.displayName} öffnen`}
                  >
                    <Avatar initials={attendee.initials} />
                    <View style={styles.attendeeInfo}>
                      <Text style={styles.attendeeName}>{attendee.displayName}</Text>
                      <Text style={styles.attendeeMeta}>
                        {attendee.club}
                        {attendee.location ? ` · ${attendee.location}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>

            <View style={styles.commentsSection} onLayout={(e) => setCommentsY(e.nativeEvent.layout.y)}>
              <Text style={styles.sectionTitle}>Kommentare</Text>

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
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: 2,
  },
  gameLabel: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.subtitle,
    marginBottom: Spacing.sm,
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
    flexWrap: 'wrap',
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
  actionsSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
    gap: Spacing.sm,
  },
  statusPill: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusPillText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  statusPillSuccess: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  statusPillSuccessText: {
    color: StatusColors.success,
  },
  statusPillError: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  statusPillErrorText: {
    color: StatusColors.error,
  },
  joinButton: {
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  joinButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: Spacing.sm,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: ClubColors.border,
    alignSelf: 'flex-start',
  },
  cancelButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: ClubColors.border,
    alignSelf: 'flex-start',
  },
  mapButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  attendeesSection: {
    marginTop: Spacing.md,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  attendeeInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  attendeeName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  attendeeMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  organizerBadge: {
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  organizerBadgeText: {
    color: ClubColors.text,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  emptyAttendees: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  commentsSection: {
    marginTop: Spacing.md,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
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
