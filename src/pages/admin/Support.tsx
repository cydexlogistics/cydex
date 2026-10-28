import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ArrowLeftRight, Headset, Loader2, Mail, Phone, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import ChatComposer from '@/components/support/ChatComposer';
import ChatThread from '@/components/support/ChatThread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { refreshSupport, supportKey, useSupportMessages, type AdminSupportChat } from '@/hooks/useSupport';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { PAGE_SIZE, pageCount } from '@/lib/pagination';
import { cn } from '@/lib/utils';

type Filter = 'open' | 'waiting' | 'mine' | 'ended' | 'all';
const FILTERS: { value: Filter; label: string; count?: 'open_count' | 'waiting_count' | 'mine_count' }[] = [
  { value: 'open', label: 'Open', count: 'open_count' },
  { value: 'waiting', label: 'Waiting', count: 'waiting_count' },
  { value: 'mine', label: 'Mine', count: 'mine_count' },
  { value: 'ended', label: 'Ended' },
  { value: 'all', label: 'All' },
];

const ROLE_STYLES: Record<string, string> = {
  customer: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  vendor: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  rider: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
};
const RoleBadge = ({ role }: { role: string }) => (
  <Badge variant="outline" className={cn('border-transparent capitalize', ROLE_STYLES[role])}>{role}</Badge>
);

// Waiting, who's handling it (full name), or ended
const StatusBadge = ({ chat, me }: { chat: AdminSupportChat; me?: string }) => {
  if (chat.status === 'waiting') {
    return <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Waiting</Badge>;
  }
  if (chat.status === 'ended') return <Badge variant="secondary">Ended</Badge>;
  return (
    <Badge variant="outline" className="max-w-full border-transparent bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300">
      <span className="truncate">{chat.admin_name}{chat.admin_id === me && ' (you)'}</span>
    </Badge>
  );
};

const ChatRow = ({ chat, me, selected, onSelect }: { chat: AdminSupportChat; me?: string; selected: boolean; onSelect: () => void }) => (
  <li>
    <button type="button" onClick={onSelect} className={cn('w-full space-y-1.5 p-3 text-left transition-colors hover:bg-muted/60', selected && 'bg-muted')}>
      <span className="flex items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-sm', chat.unread ? 'font-semibold' : 'font-medium')}>{chat.user_name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(chat.last_message_at), { addSuffix: true })}</span>
        {chat.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Needs attention" />}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <RoleBadge role={chat.user_role} />
        <StatusBadge chat={chat} me={me} />
      </span>
      {chat.last_message && (
        <span className="line-clamp-1 text-xs text-muted-foreground">
          {chat.last_message_from_admin && 'Admin: '}
          {chat.last_message}
        </span>
      )}
    </button>
  </li>
);

// One chat: the person, the messages, and what this admin can do
const ChatPanel = ({ chatId, onBack, onShowTheirChats }: { chatId: string; onBack: () => void; onShowTheirChats: (email: string) => void }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: chat, isLoading } = useQuery({
    queryKey: [...supportKey(user?.id), 'admin-chat', chatId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_support_chats', { p_chat_id: chatId, p_limit: 1 });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const { data: messages = [], isLoading: loadingMessages } = useSupportMessages(chatId);
  const isMine = chat?.status === 'active' && chat.admin_id === user?.id;

  const { data: team = [] } = useQuery({
    queryKey: ['admin-support-team'],
    enabled: isMine,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_support_team');
      if (error) throw error;
      return data ?? [];
    },
  });

  const run = async (key: string, action: () => PromiseLike<{ error: unknown }>, done?: string) => {
    setBusy(key);
    const { error } = await action();
    setBusy(null);
    await refreshSupport(queryClient, user?.id);
    if (error) {
      toast.error(errorMessage(error, 'Something went wrong'));
      return false;
    }
    if (done) toast.success(done);
    return true;
  };

  const pickUp = () => run('pick', () => supabase.rpc('admin_pick_support_chat', { p_chat_id: chatId }));
  const reply = (body: string) => run('reply', () => supabase.rpc('admin_reply_support_chat', { p_chat_id: chatId, p_body: body }));
  const transfer = async (to: { id: string; name: string }) => {
    if (!(await confirm({
      title: `Transfer this chat to ${to.name}?`,
      description: `${to.name} will carry on the chat with ${chat?.user_name}. You won't be able to reply after this.`,
      confirmLabel: 'Transfer',
    }))) return;
    run('transfer', () => supabase.rpc('admin_transfer_support_chat', { p_chat_id: chatId, p_to_admin: to.id }), `Chat transferred to ${to.name}`);
  };
  const end = async () => {
    if (!(await confirm({
      title: 'End this chat?',
      description: `${chat?.user_name} will see that the chat has ended. Their next message starts a new chat.`,
      confirmLabel: 'End chat',
      destructive: true,
    }))) return;
    run('end', () => supabase.rpc('admin_end_support_chat', { p_chat_id: chatId }), 'Chat ended');
  };

  if (isLoading) return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!chat) return <p className="p-8 text-center text-muted-foreground">Chat not found.</p>;

  return (
    <>
      <div className="space-y-2 border-b p-3">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="-ml-1 h-8 w-8 shrink-0 lg:hidden" onClick={onBack} aria-label="Back to chats">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="truncate">{chat.user_name}</span>
              <RoleBadge role={chat.user_role} />
              <StatusBadge chat={chat} me={user?.id} />
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <a href={`mailto:${chat.user_email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3 w-3" /> {chat.user_email}</a>
              {chat.user_phone && (
                <a href={`tel:${chat.user_phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" /> {chat.user_phone}</a>
              )}
              <button type="button" className="hover:underline" onClick={() => onShowTheirChats(chat.user_email)}>All their chats</button>
            </p>
          </div>
          {isMine && (
            <div className="flex shrink-0 gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!!busy}>
                    {busy === 'transfer' ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <ArrowLeftRight className="h-4 w-4 sm:mr-1.5" />}
                    <span className="hidden sm:inline">Transfer</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Transfer to</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {team.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">There are no other admins.</p>
                  ) : team.map((a) => (
                    <DropdownMenuItem key={a.id} onSelect={() => transfer(a)} className="justify-between gap-2">
                      <span className="truncate">{a.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{a.open_chats} open</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" disabled={!!busy} onClick={end} className="text-destructive hover:text-destructive">
                {busy === 'end' ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <XCircle className="h-4 w-4 sm:mr-1.5" />}
                <span className="hidden sm:inline">End chat</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <ChatThread messages={messages} viewer="admin" loading={loadingMessages} />

      {chat.status === 'waiting' ? (
        <div className="flex flex-col items-center gap-2 border-t p-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-muted-foreground">Waiting since {format(new Date(chat.created_at), 'd MMM, HH:mm')}. Pick it up to reply.</p>
          <Button size="sm" className="text-black" onClick={pickUp} disabled={!!busy}>
            {busy === 'pick' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Pick up chat
          </Button>
        </div>
      ) : isMine ? (
        <ChatComposer onSend={reply} placeholder={`Reply to ${chat.user_name.split(' ')[0]}`} />
      ) : chat.status === 'active' ? (
        <p className="border-t p-3 text-center text-sm text-muted-foreground">
          {chat.admin_name} is handling this chat. Only they can reply, transfer or end it.
        </p>
      ) : (
        <p className="border-t p-3 text-center text-sm text-muted-foreground">
          Ended{chat.ended_by_name ? ` by ${chat.ended_by_name}` : ''}{chat.ended_at && ` on ${format(new Date(chat.ended_at), 'd MMM yyyy, HH:mm')}`}
        </p>
      )}
    </>
  );
};

// Admin: support chats with customers, vendors and riders
const AdminSupport = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const chatId = params.get('chat');
  const [filter, setFilter] = useState<Filter>('open');
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...supportKey(user?.id), 'admin-list', filter, role, query, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_support_chats', {
        p_filter: filter === 'all' ? undefined : filter, p_role: role === 'all' ? undefined : role,
        p_search: query || undefined, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const first = rows[0];
  // Opening a chat from the list adds a history entry (so Back returns to the list on phones)
  const openChat = (id: string | null) => setParams(id ? { chat: id } : {}, { replace: !!chatId });
  const showTheirChats = (email: string) => {
    setSearch(email);
    setFilter('all');
    setPage(1);
  };

  return (
    <AdminPage title="Support" icon={Headset} description="Chats with customers, vendors and riders. Pick up a waiting chat to reply.">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className={cn('space-y-3', chatId && 'hidden lg:block')}>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'} className={cn('h-8 px-2.5', filter === f.value && 'text-black')}
                onClick={() => { setFilter(f.value); setPage(1); }}>
                {f.label}
                {f.count && first && <span className="ml-1.5 rounded-full bg-background/60 px-1.5 text-xs">{first[f.count]}</span>}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or phone" className="pl-9" />
            </div>
            <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
              <SelectTrigger className="w-32" aria-label="Account type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="vendor">Vendors</SelectItem>
                <SelectItem value="rider">Riders</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card className="overflow-hidden">
            {isLoading && rows.length === 0 ? (
              <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {filter === 'waiting' && !query ? 'Nobody is waiting. All caught up.' : 'No chats.'}
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map((c) => <ChatRow key={c.id} chat={c} me={user?.id} selected={c.id === chatId} onSelect={() => openChat(c.id)} />)}
              </ul>
            )}
          </Card>
          <SimplePagination page={page} pageCount={pageCount(Number(first?.total_count ?? 0))} onPageChange={setPage} />
        </div>

        <Card className={cn('flex h-[calc(100dvh_-_11rem)] min-h-[460px] flex-col overflow-hidden', !chatId && 'hidden lg:flex')}>
          {chatId ? (
            <ChatPanel key={chatId} chatId={chatId} onBack={() => openChat(null)} onShowTheirChats={(email) => {
              showTheirChats(email);
              // Phones show the list or a chat, not both
              if (!window.matchMedia('(min-width: 1024px)').matches) openChat(null);
            }} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <Headset className="h-10 w-10" />
              <p>Choose a chat to read it.</p>
            </div>
          )}
        </Card>
      </div>
    </AdminPage>
  );
};

export default AdminSupport;
