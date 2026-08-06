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
import { ReportModal } from '@/components/reports/report-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useBlocks } from '@/context/blocks-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useMessages } from '@/context/messages-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { useSaved } from '@/context/saved-context';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';
import { getMeetupAttendeeCount, isMeetupFull } from '@/data/feed-posts';
import { getConversationReferenceForPost } from '@/data/messages';
import type { ReportTargetType } from '@/data/reports';
import { getInitialsFromName, mapSupabaseProfileRow, type SupabaseProfileRow } from '@/lib/map-supabase-profile';
import { supabase } from '@/lib/supabase';

const ATTENDEE_PROFILE_SELECT_COLUMNS = 'id, display_name, club, location, bio, avatar_url, created_at, updated_at';

type AttendeeDisplay = {
  id: string;
  displayName: string;
  initials: string;
  club: string | null;
  location: string | null;
};

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
  const { posts, toggleLike, addComment, toggleMeetupAttendance, isRemoteMeetupsLoading, getRemoteAuthorDisplay, joinRemoteMeetup, leaveRemoteMeetup } =
    useFeedPosts();
  const { getOrCreateConversation, getOrCreateDirectConversation } = useMessages();
  const { isSaved, toggleSaved } = useSaved();
  const { isInteractionBlocked } = useBlocks();
  const { getAuthorDisplay, getCommentAuthorDisplay, getUserById, isCurrentUserId, isContentOwnedByCurrentUser } = useProfiles();
  const { hasReported } = useReports();
  const { isUserSuspended } = useModeration();
  const { canViewContent, isModeratedAway, canMessageUser } = useSafetySelectors();
  const [draftComment, setDraftComment] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const commentInputRef = useRef<TextInput | null>(null);
  const [commentsY, setCommentsY] = useState<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string; title: string; source?: 'local' | 'supabase' } | null>(
    null,
  );
  const [remoteAttendeeProfiles, setRemoteAttendeeProfiles] = useState<Record<string, AttendeeDisplay>>({});
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

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

  const unresolvedAttendeeIdsKey = (post?.meetupDetails?.attendeeIds ?? [])
    .filter((id) => !getUserById(id))
    .sort()
    .join(',');

  useEffect(() => {
    const unresolvedIds = unresolvedAttendeeIdsKey ? unresolvedAttendeeIdsKey.split(',') : [];

    if (unresolvedIds.length === 0) {
      setRemoteAttendeeProfiles({});
      return;
    }

    let isCurrent = true;

    supabase
      .from('profiles')
      .select(ATTENDEE_PROFILE_SELECT_COLUMNS)
      .in('id', unresolvedIds)
      .then(({ data }) => {
        if (!isCurrent) return;

        const map: Record<string, AttendeeDisplay> = {};
        ((data ?? []) as SupabaseProfileRow[]).forEach((row) => {
          const mapped = mapSupabaseProfileRow(row);
          map[row.id] = {
            id: row.id,
            displayName: mapped.displayName,
            initials: getInitialsFromName(mapped.displayName),
            club: mapped.club,
            location: mapped.location,
          };
        });
        setRemoteAttendeeProfiles(map);
      });

    return () => {
      isCurrent = false;
    };
  }, [unresolvedAttendeeIdsKey]);

  if (!post) {
    if (isRemoteMeetupsLoading) {
      return <NotFoundView title="Treffpunkt wird geladen …" message="Einen Moment, der Treffpunkt wird geladen." />;
    }

    return <NotFoundView title="Treffpunkt nicht gefunden" message="Der angeforderte Treffpunkt konnte nicht gefunden werden." />;
  }

  if (post.category !== 'Treffpunkt' || !post.meetupDetails) {
    return <NotFoundView title="Treffpunkt nicht gefunden" message="Der angeforderte Treffpunkt konnte nicht gefunden werden." />;
  }

  if (hasReported('meetup', post.id)) {
    return <NotFoundView title="Inhalt nicht verfügbar" message="Dieser Inhalt wurde von dir gemeldet und wird nicht mehr angezeigt." />;
  }

  if (isModeratedAway('meetup', post.id, post.userId)) {
    return <NotFoundView title="Inhalt nicht verfügbar" message="Dieser Inhalt wurde moderativ ausgeblendet." />;
  }

  const meetup = post.meetupDetails;
  const author =
    post.source === 'supabase' && !isCurrentUserId(post.userId) ? getRemoteAuthorDisplay(post.userId) : getAuthorDisplay(post);
  const isOrganizer = isContentOwnedByCurrentUser({ source: post.source, ownerId: post.userId });
  const isAttending = meetup.attendeeIds.some((id) => isCurrentUserId(id));
  const attendeeCount = getMeetupAttendeeCount(meetup);
  const full = isMeetupFull(meetup);

  const getAttendeeDisplay = (id: string): AttendeeDisplay => {
    const localProfile = getUserById(id);

    if (localProfile) {
      return { id, displayName: localProfile.displayName, initials: localProfile.initials, club: localProfile.club, location: localProfile.location };
    }

    return (
      remoteAttendeeProfiles[id] ?? { id, displayName: 'Unbekanntes Mitglied', initials: '?', club: null, location: null }
    );
  };

  const attendees = meetup.attendeeIds.map((id) => getAttendeeDisplay(id)).filter((attendee) => !isUserSuspended(attendee.id));
  const visibleComments = post.comments.filter((comment) => canViewContent('comment', comment.id, comment.userId));

  const handleJoin = async () => {
    if (isSubmittingAttendance) return;

    setIsSubmittingAttendance(true);
    setAttendanceError(null);
    const { error } = await joinRemoteMeetup(post.id);
    setIsSubmittingAttendance(false);

    if (error) {
      setAttendanceError(error);
    }
  };

  const handleLeave = async () => {
    if (isSubmittingAttendance) return;

    setIsSubmittingAttendance(true);
    setAttendanceError(null);
    const { error } = await leaveRemoteMeetup(post.id);
    setIsSubmittingAttendance(false);

    if (error) {
      setAttendanceError(error);
    }
  };

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
              <View style={styles.headerActions}>
                <CategoryBadge category={post.category} />
                <OverflowMenu
                  accessibilityLabel="Weitere Aktionen zu diesem Treffpunkt"
                  actions={[
                    {
                      key: 'report-meetup',
                      label: hasReported('meetup', post.id) ? 'Bereits gemeldet' : 'Treffpunkt melden',
                      icon: 'flag.fill',
                      disabled: hasReported('meetup', post.id),
                      onPress: () => setReportTarget({ type: 'meetup', id: post.id, title: 'Treffpunkt melden', source: post.source }),
                    },
                  ]}
                />
              </View>
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
                  <Text style={styles.meta}>{visibleComments.length}</Text>
                </View>
                <View style={styles.metaItem}>
                  <IconSymbol size={16} name="person.3.fill" color={FeedColors.textSecondary} />
                  <Text style={styles.meta}>
                    {attendeeCount}
                    {meetup.maxAttendees != null ? ` / ${meetup.maxAttendees}` : ''} Teilnehmer
                  </Text>
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

              <View style={styles.actionsSection}>
                {attendanceError ? <Text style={styles.attendanceErrorText}>{attendanceError}</Text> : null}

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
                      onPress={post.source === 'supabase' ? handleLeave : () => toggleMeetupAttendance(post.id)}
                      disabled={post.source === 'supabase' && isSubmittingAttendance}
                      style={[styles.cancelButton, post.source === 'supabase' && isSubmittingAttendance && styles.actionButtonDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel="Teilnahme absagen"
                    >
                      <Text style={styles.cancelButtonText}>
                        {post.source === 'supabase' && isSubmittingAttendance ? 'Wird bearbeitet …' : 'Teilnahme absagen'}
                      </Text>
                    </Pressable>
                  </View>
                ) : full ? (
                  <View style={[styles.statusPill, styles.statusPillError]}>
                    <Text style={[styles.statusPillText, styles.statusPillErrorText]}>Ausgebucht</Text>
                  </View>
                ) : post.source === 'supabase' && isInteractionBlocked(post.userId) ? (
                  <View style={[styles.statusPill, styles.statusPillError]}>
                    <Text style={[styles.statusPillText, styles.statusPillErrorText]}>Diese Aktion ist derzeit nicht möglich.</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={post.source === 'supabase' ? handleJoin : () => toggleMeetupAttendance(post.id)}
                    disabled={post.source === 'supabase' && isSubmittingAttendance}
                    style={[styles.joinButton, post.source === 'supabase' && isSubmittingAttendance && styles.actionButtonDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Teilnehmen"
                  >
                    <Text style={styles.joinButtonText}>
                      {post.source === 'supabase' && isSubmittingAttendance ? 'Wird bearbeitet …' : 'Teilnehmen'}
                    </Text>
                  </Pressable>
                )}

                {!isOrganizer && canMessageUser(post.userId) ? (
                  <>
                    {messageError ? <Text style={styles.attendanceErrorText}>{messageError}</Text> : null}
                    <Pressable
                      onPress={() => void handleMessagePress()}
                      disabled={isStartingConversation}
                      style={[styles.mapButton, isStartingConversation && styles.actionButtonDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel="Nachricht an Organisator"
                    >
                      <IconSymbol size={16} name="message" color={ClubColors.text} />
                      <Text style={styles.mapButtonText}>{isStartingConversation ? 'Wird gestartet …' : 'Nachricht an Organisator'}</Text>
                    </Pressable>
                  </>
                ) : null}

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
                      {attendee.club || attendee.location ? (
                        <Text style={styles.attendeeMeta}>
                          {[attendee.club, attendee.location].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
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

              {visibleComments.length > 0 ? (
                visibleComments.map((comment) => {
                  const commentAuthor = getCommentAuthorDisplay(comment);

                  return (
                  <View key={comment.id} style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      <View style={styles.commentUserBlock}>
                        <Avatar initials={commentAuthor.initials} />
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
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.closeKeyboardButton} accessibilityRole="button" accessibilityLabel="Tastatur schließen">
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
  attendanceErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  actionButtonDisabled: {
    opacity: 0.5,
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
