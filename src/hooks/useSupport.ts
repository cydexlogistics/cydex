import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { playNotificationSound } from '@/lib/notificationSound';

type Fns = Database['public']['Functions'];
export type SupportChat = Fns['my_support_chats']['Returns'][number];
export type AdminSupportChat = Fns['admin_support_chats']['Returns'][number];
export type SupportMessage = Fns['support_chat_messages']['Returns'][number];
type SupportMessageRow = Database['public']['Tables']['support_messages']['Row'];

export const supportKey = (userId?: string) => ['support', userId];

// The number on Support in the menu: unread replies for customers, vendors and
// riders; for admins, chats waiting to be picked up plus their own with unread messages
export const useSupportUnread = () => {
  const { user } = useAuth();
  const { data = 0 } = useQuery({
    queryKey: [...supportKey(user?.id), 'unread'],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('support_unread_count');
      if (error) throw error;
      return data ?? 0;
    },
  });
  return data;
};

// The signed-in customer's, vendor's or rider's chats: the open one first
export const useMySupportChats = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...supportKey(user?.id), 'mine'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_support_chats');
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useSupportMessages = (chatId: string | null | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...supportKey(user?.id), 'messages', chatId],
    enabled: !!user?.id && !!chatId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('support_chat_messages', { p_chat_id: chatId! });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Seeing the messages marks the chat read (for the person, or the admin handling it)
  const count = query.data?.length ?? 0;
  useEffect(() => {
    if (!chatId || !count || document.visibilityState !== 'visible') return;
    supabase.rpc('support_mark_read', { p_chat_id: chatId }).then(({ error }) => {
      if (!error) queryClient.invalidateQueries({ queryKey: [...supportKey(user?.id), 'unread'] });
    });
  }, [chatId, count, queryClient, user?.id]);

  return query;
};

export const refreshSupport = (queryClient: ReturnType<typeof useQueryClient>, userId?: string) =>
  queryClient.invalidateQueries({ queryKey: supportKey(userId) });

// Keeps chats live and chimes (with a pop-up, unless the chat is already on
// screen) for each new message meant for this person. Mount once per session
// (DashboardLayout). Push notifications cover the app being closed.
export const useSupportRealtime = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const userId = user?.id;
  const role = user?.role?.toLowerCase();

  useEffect(() => {
    if (!userId || !role) return;
    const isAdmin = role === 'admin';
    const channel = supabase
      .channel(`support-${userId}`)
      .on(
        'postgres_changes',
        // Admins see every chat; everyone else only their own
        { event: 'INSERT', schema: 'public', table: 'support_messages', ...(isAdmin ? {} : { filter: `user_id=eq.${userId}` }) },
        (payload) => {
          const m = payload.new as SupportMessageRow;
          refreshSupport(queryClient, userId);
          if (m.sender_id === userId) return;

          // Admins: messages in chats they handle or that are waiting, and chats passed to them.
          // Everyone else: the team's replies, and the chat being picked up or ended.
          const forMe = isAdmin
            ? (!m.from_admin && (!m.admin_id || m.admin_id === userId)) || (m.kind === 'transferred' && m.admin_id === userId)
            : m.from_admin && m.kind !== 'transferred';
          if (!forMe) return;
          playNotificationSound('support_message');

          const href = isAdmin ? `/admin/support?chat=${m.chat_id}` : `/${role}/support`;
          const onScreen = isAdmin
            ? window.location.pathname === '/admin/support' && new URLSearchParams(window.location.search).get('chat') === m.chat_id
            : window.location.pathname === href;
          if (onScreen) return;
          const [title, description] = isAdmin
            ? m.kind === 'transferred'
              ? ['A support chat was passed to you', undefined]
              : [m.admin_id ? 'New support message' : 'Support chat waiting', m.body ?? undefined]
            : m.kind === 'joined'
              ? ['Cydex Support', 'Someone from the team has joined your chat']
              : m.kind === 'ended'
                ? ['Cydex Support', 'Your chat has ended']
                : ['Cydex Support', m.body ?? undefined];
          toast(title, { description, action: { label: 'Open', onClick: () => navigate(href) } });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role, queryClient, navigate]);
};
