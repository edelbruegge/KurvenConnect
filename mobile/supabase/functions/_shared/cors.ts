// supabase/functions/_shared/cors.ts
//
// Neither existing Edge Function (send-push-notification, sync-football-games) needs CORS -- both
// are only ever called server-to-server (a Database Webhook / pg_cron+pg_net), never from a
// browser. match-lock-status is the first function this app calls directly from client code
// (mobile/context/match-lock-context.tsx, via supabase.functions.invoke), including the web build,
// so it's also the first to need real CORS handling. Kept here rather than inlined so a future
// second client-invoked function doesn't reinvent this.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Call at the top of the request handler; returns a preflight Response if this *is* one, otherwise
// null so the caller continues with its normal handling.
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return null;
}
