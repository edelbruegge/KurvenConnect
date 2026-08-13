// supabase/functions/send-push-notification/index.ts
//
// Sends a real device push notification through the Expo Push Service whenever a new row is
// inserted into public.notifications. public.notifications remains the only source of truth for
// notification content — this function only reads an already-created row and delivers it; it
// never inserts into public.notifications itself, so there is no risk of a duplicate in-app
// entry.
//
// NOT deployed as part of this step. To deploy and wire up later:
//   1. `supabase functions deploy send-push-notification`
//   2. `supabase secrets set PUSH_WEBHOOK_SECRET=<a random, generated secret>`
//      (optionally also `EXPO_ACCESS_TOKEN=<token>` for Expo's enhanced-security push sending —
//      see https://docs.expo.dev/push-notifications/sending-notifications/#additional-security)
//   3. Supabase Dashboard -> Database -> Webhooks -> new webhook on public.notifications,
//      event INSERT, HTTP POST to this function's URL, header `x-webhook-secret: <same secret>`.
//      A Database Webhook is used (configured in the dashboard) rather than a SQL trigger calling
//      supabase_functions.http_request, because a SQL trigger would have to embed the function
//      URL and secret header in a versioned migration file — the dashboard keeps every secret
//      out of the repository entirely.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to every Supabase Edge
// Function at runtime — neither needs to be set manually, and the service_role key is never
// present in the app/client bundle.
//
// Idempotency: a Database Webhook (or the network request carrying it) can be redelivered for the
// same notifications INSERT. public.push_deliveries (20260819100000_create_push_deliveries.sql)
// is a unique(notification_id, push_token_id) ledger — claimTokensForDelivery() below inserts a
// row per token with `ignoreDuplicates: true` (SQL: on conflict do nothing) *before* anything is
// sent, and only tokens that actually got a new row are sent to. A redelivered call finds every
// row already present and sends nothing a second time.
//
// Not implemented in this step (deliberately, to keep this function small and testable rather than
// half-building it): Expo push *receipts* (the second, delayed Expo endpoint that reports whether
// a ticket that came back "ok" was actually delivered by APNs/FCM). This function only records the
// immediate ticket result. Polling receipts would need its own scheduled job and is a clearly
// separable follow-up, not a change here.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string;
  reference_type: string | null;
  reference_id: string | null;
};

type DatabaseWebhookPayload = {
  type: string;
  table: string;
  schema: string;
  record: NotificationRow;
};

type PushToken = {
  id: string;
  expo_push_token: string;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

type SupabaseServerClient = ReturnType<typeof createClient>;

/** Step: verify the request actually came from our own configured Database Webhook. */
function isAuthorized(req: Request): boolean {
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  return Boolean(webhookSecret) && req.headers.get('x-webhook-secret') === webhookSecret;
}

/** Step: re-read the notification row server-side rather than trusting the webhook body verbatim
 * — cheap defense in depth, and guards against the row having already been deleted between insert
 * and delivery. */
async function loadNotification(supabase: SupabaseServerClient, notificationId: string): Promise<NotificationRow | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, actor_id, type, title, body, reference_type, reference_id')
    .eq('id', notificationId)
    .maybeSingle<NotificationRow>();

  if (error) {
    console.error('[send-push-notification] failed to load notification', error.message);
    return null;
  }

  return data;
}

/** Step: every currently active device token for this notification's recipient. */
async function loadActiveTokens(supabase: SupabaseServerClient, recipientId: string): Promise<PushToken[] | null> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('id, expo_push_token')
    .eq('user_id', recipientId)
    .eq('is_active', true)
    .returns<PushToken[]>();

  if (error) {
    console.error('[send-push-notification] failed to load push tokens', error.message);
    return null;
  }

  return data ?? [];
}

/**
 * Step: the idempotency gate. Claims a push_deliveries row per token via `on conflict do nothing`
 * (ignoreDuplicates) and returns only the tokens that actually got a *new* row — i.e. the ones
 * genuinely being attempted for the first time. Also returns the new delivery row id per token so
 * the caller can later record the ticket result on it. On a redelivered webhook call, every token
 * already has a row, so this returns an empty list and nothing gets sent twice.
 */
async function claimTokensForDelivery(
  supabase: SupabaseServerClient,
  notificationId: string,
  tokens: PushToken[],
): Promise<{ tokensToSend: PushToken[]; deliveryIdByTokenId: Map<string, string> } | null> {
  const { data: claimed, error } = await supabase
    .from('push_deliveries')
    .upsert(
      tokens.map((token) => ({ notification_id: notificationId, push_token_id: token.id })),
      { onConflict: 'notification_id,push_token_id', ignoreDuplicates: true },
    )
    .select('id, push_token_id');

  if (error) {
    console.error('[send-push-notification] failed to claim delivery rows', error.message);
    return null;
  }

  const deliveryIdByTokenId = new Map<string, string>((claimed ?? []).map((row) => [row.push_token_id as string, row.id as string]));
  const tokensToSend = tokens.filter((token) => deliveryIdByTokenId.has(token.id));

  return { tokensToSend, deliveryIdByTokenId };
}

/** Step: build the Expo message payload. Title/body come directly from the already-cleaned
 * notifications row — never from raw reference IDs or other internal values; those only go into
 * `data`, and never as a complete database row. */
function buildExpoMessages(notification: NotificationRow, tokens: PushToken[]) {
  return tokens.map((token) => ({
    to: token.expo_push_token,
    title: notification.title,
    body: notification.body,
    sound: 'default',
    data: {
      notificationId: notification.id,
      type: notification.type,
      referenceType: notification.reference_type,
      referenceId: notification.reference_id,
    },
  }));
}

/** Step: send to the Expo Push Service. Wrapped by the caller so a network failure becomes a
 * clean 502 response instead of an unhandled exception — no retry loop of our own (a Database
 * Webhook's own limited retry behavior is enough for this MVP; Vorgabe 31). */
async function sendToExpo(messages: unknown[]): Promise<ExpoPushTicket[] | null> {
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(expoAccessToken ? { authorization: `Bearer ${expoAccessToken}` } : {}),
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    console.error('[send-push-notification] Expo push service returned', response.status);
    return null;
  }

  const result = (await response.json()) as { data?: ExpoPushTicket[] };
  return result.data ?? [];
}

/** Step: apply each ticket result — count sent/failed, record the outcome on the matching
 * push_deliveries row, and deactivate a token only when Expo explicitly says it's gone
 * (DeviceNotRegistered), never on a transient/temporary error (Vorgabe 30). */
async function applyTicketResults(
  supabase: SupabaseServerClient,
  tokensToSend: PushToken[],
  deliveryIdByTokenId: Map<string, string>,
  tickets: ExpoPushTicket[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const staleTokenIds: string[] = [];
  const deliveryUpdates: { id: string; status: 'sent' | 'failed'; ticket_id: string | null; error_code: string | null }[] = [];

  tickets.forEach((ticket, index) => {
    const token = tokensToSend[index];
    const deliveryId = token ? deliveryIdByTokenId.get(token.id) : undefined;

    if (ticket.status === 'ok') {
      sent += 1;
      if (deliveryId) {
        deliveryUpdates.push({ id: deliveryId, status: 'sent', ticket_id: ticket.id ?? null, error_code: null });
      }
      return;
    }

    failed += 1;
    const errorCode = ticket.details?.error ?? null;
    // Never log the token itself or notification body content — only the error code.
    console.error('[send-push-notification] delivery error', errorCode ?? ticket.message ?? 'unknown');

    if (deliveryId) {
      deliveryUpdates.push({ id: deliveryId, status: 'failed', ticket_id: null, error_code: errorCode });
    }

    if (errorCode === 'DeviceNotRegistered' && token) {
      staleTokenIds.push(token.id);
    }
  });

  // Best-effort: a failure to persist final delivery status must never undo pushes that already
  // went out, so this is awaited but never allowed to throw past this point.
  await Promise.all(
    deliveryUpdates.map((update) =>
      supabase
        .from('push_deliveries')
        .update({ status: update.status, ticket_id: update.ticket_id, error_code: update.error_code })
        .eq('id', update.id),
    ),
  ).catch((error) => {
    console.error('[send-push-notification] failed to record delivery outcomes', error instanceof Error ? error.message : 'unknown');
  });

  if (staleTokenIds.length > 0) {
    await supabase.from('push_tokens').update({ is_active: false }).in('id', staleTokenIds);
  }

  return { sent, failed };
}

Deno.serve(async (req: Request) => {
  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: DatabaseWebhookPayload;

  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (payload.type !== 'INSERT' || payload.table !== 'notifications' || !payload.record?.id) {
    return new Response('Ignored: not a notifications INSERT event', { status: 200 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[send-push-notification] missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Server misconfigured', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const notification = await loadNotification(supabase, payload.record.id);

  if (!notification) {
    return new Response('Notification not found', { status: 200 });
  }

  if (notification.recipient_id === notification.actor_id) {
    return new Response('Ignored: recipient is the actor', { status: 200 });
  }

  const tokens = await loadActiveTokens(supabase, notification.recipient_id);

  if (tokens === null) {
    return new Response('Failed to load push tokens', { status: 500 });
  }

  if (tokens.length === 0) {
    return new Response('No active push tokens for recipient', { status: 200 });
  }

  const claim = await claimTokensForDelivery(supabase, notification.id, tokens);

  if (claim === null) {
    return new Response('Failed to record delivery attempts', { status: 500 });
  }

  if (claim.tokensToSend.length === 0) {
    return new Response('Already delivered to every active token for this notification (idempotent no-op)', { status: 200 });
  }

  const messages = buildExpoMessages(notification, claim.tokensToSend);

  let tickets: ExpoPushTicket[] | null;

  try {
    tickets = await sendToExpo(messages);
  } catch (error) {
    console.error('[send-push-notification] network error calling Expo push service', error instanceof Error ? error.message : 'unknown');
    return new Response('Network error calling Expo push service', { status: 502 });
  }

  if (tickets === null) {
    return new Response('Expo push service error', { status: 502 });
  }

  const { sent, failed } = await applyTicketResults(supabase, claim.tokensToSend, claim.deliveryIdByTokenId, tickets);

  return new Response(JSON.stringify({ sent, failed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
