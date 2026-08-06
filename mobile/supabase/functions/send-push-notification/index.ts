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
  message?: string;
  details?: { error?: string };
};

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');

  if (!webhookSecret || req.headers.get('x-webhook-secret') !== webhookSecret) {
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

  // Re-read the row server-side rather than trusting the webhook body verbatim — a cheap defense
  // in depth, and guards against the row having already been deleted between insert and delivery.
  const { data: notification, error: notificationError } = await supabase
    .from('notifications')
    .select('id, recipient_id, actor_id, type, title, body, reference_type, reference_id')
    .eq('id', payload.record.id)
    .maybeSingle<NotificationRow>();

  if (notificationError || !notification) {
    console.error('[send-push-notification] notification not found', payload.record.id);
    return new Response('Notification not found', { status: 200 });
  }

  if (notification.recipient_id === notification.actor_id) {
    return new Response('Ignored: recipient is the actor', { status: 200 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('id, expo_push_token')
    .eq('user_id', notification.recipient_id)
    .eq('is_active', true)
    .returns<PushToken[]>();

  if (tokensError) {
    console.error('[send-push-notification] failed to load push tokens', tokensError.message);
    return new Response('Failed to load push tokens', { status: 500 });
  }

  if (!tokens || tokens.length === 0) {
    return new Response('No active push tokens for recipient', { status: 200 });
  }

  // Title/body come directly from the already-cleaned notifications row — never from raw
  // reference IDs, event keys, or other internal values. Those only go into `data`.
  const messages = tokens.map((token) => ({
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
    return new Response('Expo push service error', { status: 502 });
  }

  const result = (await response.json()) as { data?: ExpoPushTicket[] };
  const tickets = result.data ?? [];

  let sent = 0;
  let failed = 0;
  const staleTokenIds: string[] = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === 'ok') {
      sent += 1;
      return;
    }

    failed += 1;
    // Never log the token itself or notification body content — only the error code.
    console.error('[send-push-notification] delivery error', ticket.details?.error ?? ticket.message ?? 'unknown');

    if (ticket.details?.error === 'DeviceNotRegistered') {
      const staleToken = tokens[index];
      if (staleToken) {
        staleTokenIds.push(staleToken.id);
      }
    }
  });

  if (staleTokenIds.length > 0) {
    await supabase.from('push_tokens').update({ is_active: false }).in('id', staleTokenIds);
  }

  return new Response(JSON.stringify({ sent, failed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
