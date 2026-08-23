import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useMessages } from '@/context/messages-context';
import { useProfiles } from '@/context/profile-context';
import { getConversationReferenceForPost } from '@/data/messages';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';
import { getInitialsFromName, mapSupabaseProfileRow, type SupabaseProfileRow } from '@/lib/map-supabase-profile';
import type { SupabaseTripRequestRow, TripRequestStatus } from '@/lib/map-supabase-trip';
import { supabase } from '@/lib/supabase';

const PROFILE_SELECT_COLUMNS = 'id, display_name, club, location, bio, avatar_url, created_at, updated_at';

const STATUS_LABELS: Record<TripRequestStatus, string> = {
  pending: 'Ausstehend',
  accepted: 'Angenommen',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
};

type RequesterDisplay = {
  displayName: string;
  initials: string;
  club: string | null;
  location: string | null;
  avatarUrl?: string;
};

const UNKNOWN_REQUESTER: RequesterDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?', club: null, location: null };

export default function TripRequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { getPostById, getRequestsForTrip, refreshRequestsForTrip, respondToRemoteTripRequest } = useFeedPosts();
  const { isContentOwnedByCurrentUser } = useProfiles();
  const { getOrCreateDirectConversation } = useMessages();
  const { canMessageUser } = useSafetySelectors();

  const trip = params.id ? getPostById(params.id) : undefined;
  const isOwnedSupabaseTrip = Boolean(trip && trip.source === 'supabase' && isContentOwnedByCurrentUser({ source: trip.source, ownerId: trip.userId }));
  const requests = params.id && isOwnedSupabaseTrip ? getRequestsForTrip(params.id) : [];

  const [requesterProfiles, setRequesterProfiles] = useState<Record<string, RequesterDisplay>>({});
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [confirmingRejectRequestId, setConfirmingRejectRequestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [startingConversationRequesterId, setStartingConversationRequesterId] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  const requesterIdsKey = Array.from(new Set(requests.map((request) => request.requester_id)))
    .sort()
    .join(',');

  useEffect(() => {
    const requesterIds = requesterIdsKey ? requesterIdsKey.split(',') : [];

    if (requesterIds.length === 0) {
      setRequesterProfiles({});
      return;
    }

    let isCurrent = true;

    supabase
      .from('profiles')
      .select(PROFILE_SELECT_COLUMNS)
      .in('id', requesterIds)
      .then(({ data }) => {
        if (!isCurrent) return;

        const map: Record<string, RequesterDisplay> = {};
        ((data ?? []) as SupabaseProfileRow[]).forEach((row) => {
          const mapped = mapSupabaseProfileRow(row);
          map[row.id] = {
            displayName: mapped.displayName,
            initials: getInitialsFromName(mapped.displayName),
            club: mapped.club,
            location: mapped.location,
            avatarUrl: mapped.avatarUrl ?? undefined,
          };
        });
        setRequesterProfiles(map);
      });

    return () => {
      isCurrent = false;
    };
  }, [requesterIdsKey]);

  // trip_requests has no realtime channel by design (see feed-posts-context.tsx's own comment on
  // refreshRequestsForTrip) -- the owner's notification already arrives live, but this list itself
  // only ever loaded once at sign-in/foreground, so a request made while this screen wasn't the one
  // open stayed invisible here until the next full reload even though it existed server-side.
  // Refetching on every focus (not just once on mount) also picks up a request that arrives while
  // this exact screen is already open and the user navigates back to it.
  useFocusEffect(
    useCallback(() => {
      if (params.id && isOwnedSupabaseTrip) {
        void refreshRequestsForTrip(params.id);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id, isOwnedSupabaseTrip]),
  );

  if (!trip || !isOwnedSupabaseTrip) {
    return <NotFoundView title="Fahrt nicht gefunden" message="Diese Anfragenübersicht ist nicht verfügbar." />;
  }

  const pendingRequests = requests.filter((request) => request.status === 'pending');
  const acceptedRequests = requests.filter((request) => request.status === 'accepted');
  const closedRequests = requests.filter((request) => request.status === 'rejected' || request.status === 'cancelled');

  const sortByCreatedAtDesc = (a: SupabaseTripRequestRow, b: SupabaseTripRequestRow) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  const hasFreeSeats = (trip.tripDetails?.freeSeats ?? 0) > 0;

  const handleAccept = async (requestId: string) => {
    if (respondingRequestId) return;

    setRespondingRequestId(requestId);
    setActionError(null);
    const { error } = await respondToRemoteTripRequest(requestId, 'accepted');
    setRespondingRequestId(null);

    if (error) {
      setActionError(error);
    }
  };

  const handleConfirmReject = async (requestId: string) => {
    setConfirmingRejectRequestId(null);

    if (respondingRequestId) return;

    setRespondingRequestId(requestId);
    setActionError(null);
    const { error } = await respondToRemoteTripRequest(requestId, 'rejected');
    setRespondingRequestId(null);

    if (error) {
      setActionError(error);
    }
  };

  const handleMessagePress = async (requesterId: string) => {
    if (startingConversationRequesterId) {
      return;
    }

    const reference = getConversationReferenceForPost(trip);

    setStartingConversationRequesterId(requesterId);
    setMessageError(null);
    const { conversationId, error } = await getOrCreateDirectConversation({ otherUserId: requesterId, reference });
    setStartingConversationRequesterId(null);

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

  const renderRequestCard = (request: SupabaseTripRequestRow) => {
    const requester = requesterProfiles[request.requester_id] ?? UNKNOWN_REQUESTER;
    const isResponding = respondingRequestId === request.id;
    const isConfirmingReject = confirmingRejectRequestId === request.id;

    return (
      <View key={request.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Avatar initials={requester.initials} avatarUrl={requester.avatarUrl} />
          <View style={styles.cardHeaderText}>
            <Text style={styles.requesterName}>{requester.displayName}</Text>
            {requester.club ? <Text style={styles.requesterMeta}>{requester.club}</Text> : null}
            {requester.location ? <Text style={styles.requesterMeta}>{requester.location}</Text> : null}
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{STATUS_LABELS[request.status]}</Text>
          </View>
        </View>

        {request.message ? <Text style={styles.requestMessage}>{request.message}</Text> : null}

        <Text style={styles.requestTimestamp}>{formatRelativeGermanTime(request.created_at)}</Text>

        {request.status === 'pending' ? (
          <View style={styles.actionsBlock}>
            {!hasFreeSeats ? <Text style={styles.noSeatsHint}>Für diese Fahrt ist kein Platz mehr verfügbar.</Text> : null}

            {isConfirmingReject ? (
              <View style={styles.confirmBlock}>
                <Text style={styles.confirmText}>Diese Anfrage wirklich ablehnen?</Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => handleConfirmReject(request.id)}
                    style={styles.rejectConfirmButton}
                    accessibilityRole="button"
                    accessibilityLabel="Ablehnen bestätigen"
                  >
                    <Text style={styles.rejectConfirmButtonText}>Ablehnen bestätigen</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmingRejectRequestId(null)}
                    style={styles.cancelConfirmButton}
                    accessibilityRole="button"
                    accessibilityLabel="Abbrechen"
                  >
                    <Text style={styles.cancelConfirmButtonText}>Abbrechen</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => handleAccept(request.id)}
                  disabled={isResponding || !hasFreeSeats}
                  style={[styles.acceptButton, (isResponding || !hasFreeSeats) && styles.actionButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Anfrage annehmen"
                >
                  <Text style={styles.acceptButtonText}>{isResponding ? 'Wird bearbeitet …' : 'Annehmen'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmingRejectRequestId(request.id)}
                  disabled={isResponding}
                  style={[styles.rejectButton, isResponding && styles.actionButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Anfrage ablehnen"
                >
                  <Text style={styles.rejectButtonText}>Ablehnen</Text>
                </Pressable>
              </View>
            )}

            {canMessageUser(request.requester_id) ? (
              <Pressable
                onPress={() => void handleMessagePress(request.requester_id)}
                disabled={startingConversationRequesterId === request.requester_id}
                style={[styles.messageButton, startingConversationRequesterId === request.requester_id && styles.actionButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Nachricht senden an ${requester.displayName}`}
              >
                <Text style={styles.messageButtonText}>
                  {startingConversationRequesterId === request.requester_id ? 'Wird gestartet …' : 'Nachricht senden'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}
        {messageError ? <Text style={styles.actionErrorText}>{messageError}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Offen ({pendingRequests.length})</Text>
          {pendingRequests.length === 0 ? (
            <Text style={styles.emptyText}>Keine offenen Anfragen.</Text>
          ) : (
            [...pendingRequests].sort(sortByCreatedAtDesc).map(renderRequestCard)
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Angenommen ({acceptedRequests.length})</Text>
          {acceptedRequests.length === 0 ? (
            <Text style={styles.emptyText}>Noch keine angenommenen Anfragen.</Text>
          ) : (
            [...acceptedRequests].sort(sortByCreatedAtDesc).map(renderRequestCard)
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Abgelehnt oder storniert ({closedRequests.length})</Text>
          {closedRequests.length === 0 ? (
            <Text style={styles.emptyText}>Keine abgeschlossenen Anfragen.</Text>
          ) : (
            [...closedRequests].sort(sortByCreatedAtDesc).map(renderRequestCard)
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  actionErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardHeaderText: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  requesterName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  requesterMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 1,
  },
  statusBadge: {
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  requestMessage: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  requestTimestamp: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  actionsBlock: {
    gap: Spacing.sm,
  },
  noSeatsHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  acceptButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
  },
  acceptButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  rejectButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  rejectButtonText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  messageButton: {
    alignSelf: 'flex-start',
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  messageButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
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
  rejectConfirmButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  rejectConfirmButtonText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  cancelConfirmButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  cancelConfirmButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
