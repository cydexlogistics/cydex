// Sends a browser push to the user's devices for one notification, or for one
// support chat message. Called by the database (push_new_notification and
// push_new_support_message triggers, via pg_net) with { notification_id } or
// { support_message_id }. It trusts nothing else in the request: it reads the
// row itself, only sends to the recipients' own subscriptions, and only once
// (push_sent_at), so it needs no secret.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { adminClient } from '../_shared/squad.ts';

const ORDER_LINKS: Record<string, (orderId: string, type: string) => string> = {
  customer: (id) => `/customer/orders/${id}`,
  vendor: (id) => `/vendor/orders/${id}`,
  rider: (id, type) => (type === 'order_nearby' ? '/rider/available' : `/rider/order/${id}`),
  admin: (id) => `/admin/orders/${id}`,
};
// Admin notifications that aren't about one order
const ADMIN_LINKS: Record<string, string> = {
  payout_request: '/admin/payments?tab=payouts',
  verification_request: '/admin/verifications',
};
const ROLE_LABELS: Record<string, string> = { customer: 'Customer', vendor: 'Vendor', rider: 'Rider' };

const ok = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Sends one payload to each subscription, removing ones the browser has dropped
const sendToDevices = async (db: SupabaseClient, subs: { id: string; endpoint: string; p256dh: string; auth: string }[], payload: string) => {
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // The browser unsubscribed or the subscription expired
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('send-push', s.endpoint.slice(0, 40), status, (e as Error).message);
    }
  }));
  return sent;
};

const sendNotification = async (db: SupabaseClient, notificationId: string) => {
  const { data: n } = await db
    .from('notifications')
    .select('id, user_id, type, title, message, metadata, push_sent_at')
    .eq('id', notificationId)
    .maybeSingle();
  if (!n?.user_id || n.push_sent_at) return ok({ skipped: true });

  // Claim it first so a repeated call can't send twice
  const { data: claimed } = await db
    .from('notifications')
    .update({ push_sent_at: new Date().toISOString() })
    .eq('id', n.id)
    .is('push_sent_at', null)
    .select('id');
  if (!claimed?.length) return ok({ skipped: true });

  const [{ data: settings }, { data: subs }, { data: profile }] = await Promise.all([
    db.from('notification_settings').select('push_enabled').eq('profile_id', n.user_id).maybeSingle(),
    db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', n.user_id),
    db.from('profiles').select('role').eq('id', n.user_id).maybeSingle(),
  ]);
  if (!settings?.push_enabled || !subs?.length) return ok({ sent: 0 });

  const role = String(profile?.role ?? '').toLowerCase();
  const orderId = (n.metadata as { order_id?: string } | null)?.order_id;
  const url = orderId && ORDER_LINKS[role] ? ORDER_LINKS[role](orderId, n.type)
    : (role === 'admin' && ADMIN_LINKS[n.type]) || `/${role || 'customer'}/notifications`;
  // Unread count for the badge on the installed app's icon
  const { count: unread } = await db.from('notifications')
    .select('id', { count: 'exact', head: true }).eq('user_id', n.user_id).eq('is_read', false);
  const payload = JSON.stringify({ title: n.title, body: n.message, url, tag: n.id, type: n.type, unread: unread ?? 1 });

  return ok({ sent: await sendToDevices(db, subs, payload) });
};

// Support chat messages never go in notifications (so they stay off the
// Notifications page) and leave the app icon's badge alone
const sendSupportMessage = async (db: SupabaseClient, messageId: string) => {
  const { data: m } = await db
    .from('support_messages')
    .select('id, chat_id, kind, from_admin, body, sender_id, admin_id, push_sent_at, support_chats(user_id, user_role)')
    .eq('id', messageId)
    .maybeSingle();
  if (!m || m.push_sent_at) return ok({ skipped: true });

  const { data: claimed } = await db
    .from('support_messages')
    .update({ push_sent_at: new Date().toISOString() })
    .eq('id', m.id)
    .is('push_sent_at', null)
    .select('id');
  if (!claimed?.length) return ok({ skipped: true });

  const { data: recipients } = await db.rpc('support_message_recipients', { p_message_id: m.id });
  // SETOF uuid: plain ids, or { support_message_recipients: id } depending on the PostgREST version
  const ids = ((recipients ?? []) as (string | Record<string, string>)[])
    .map((r) => (typeof r === 'string' ? r : Object.values(r)[0]))
    .filter(Boolean);
  if (!ids.length) return ok({ sent: 0 });

  const chat = m.support_chats as unknown as { user_id: string; user_role: string };
  const [{ data: settings }, { data: subs }, { data: people }] = await Promise.all([
    db.from('notification_settings').select('profile_id').in('profile_id', ids).eq('push_enabled', true),
    db.from('push_subscriptions').select('id, profile_id, endpoint, p256dh, auth').in('profile_id', ids),
    db.from('profiles').select('id, name').in('id', [chat.user_id, m.sender_id, m.admin_id].filter(Boolean)),
  ]);
  const pushOn = new Set((settings ?? []).map((s) => s.profile_id));
  const nameOf = (id: string | null) => (people ?? []).find((p) => p.id === id)?.name?.trim() || '';
  const firstName = (id: string | null) => nameOf(id).split(/\s+/)[0] || 'Cydex Support';
  const text = (m.body ?? '').slice(0, 200);
  const userName = nameOf(chat.user_id) || 'Someone';
  const roleLabel = ROLE_LABELS[chat.user_role] ?? chat.user_role;

  // To admins: who it's from, with full names. To the person: the admin's first name.
  const toAdmin = !m.from_admin || m.kind === 'transferred';
  const message = toAdmin
    ? m.kind === 'transferred'
      ? { title: 'Support chat passed to you', body: `${nameOf(m.sender_id)} passed you the chat with ${userName} (${roleLabel})` }
      : { title: `${userName} (${roleLabel})`, body: m.admin_id ? text : `Waiting for an admin: ${text}` }
    : m.kind === 'joined'
      ? { title: 'Cydex Support', body: `${firstName(m.sender_id)} has joined your chat` }
      : m.kind === 'ended'
        ? { title: 'Cydex Support', body: `${firstName(m.sender_id)} ended the chat. Send a message any time to start a new one.` }
        : { title: `${firstName(m.sender_id)} from Cydex Support`, body: text };
  const url = toAdmin ? `/admin/support?chat=${m.chat_id}` : `/${chat.user_role}/support`;
  // One notification per chat on the phone: a new message replaces the last
  const payload = JSON.stringify({ ...message, url, tag: `support-${m.chat_id}`, type: 'support_message' });

  const devices = (subs ?? []).filter((s) => pushOn.has(s.profile_id));
  return ok({ sent: await sendToDevices(db, devices, payload) });
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return new Response('Push is not configured', { status: 500 });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:support@cydex.ng', publicKey, privateKey);

  const { notification_id, support_message_id } = await req.json().catch(() => ({}));
  if (support_message_id) return sendSupportMessage(adminClient(), support_message_id);
  if (notification_id) return sendNotification(adminClient(), notification_id);
  return new Response('Missing notification_id', { status: 400 });
});
