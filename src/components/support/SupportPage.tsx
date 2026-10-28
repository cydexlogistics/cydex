import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { Clock, Headset, History, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ChatComposer from '@/components/support/ChatComposer';
import ChatThread from '@/components/support/ChatThread';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { refreshSupport, useMySupportChats, useSupportMessages, type SupportChat } from '@/hooks/useSupport';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { cn } from '@/lib/utils';

// Their chats: the open one first, then ended ones to look back at
const ChatList = ({ chats, selectedId, onSelect }: { chats: SupportChat[]; selectedId?: string; onSelect: (id: string) => void }) => {
  if (chats.length === 0) return <p className="p-4 text-sm text-muted-foreground">Your chats with the team will show here.</p>;
  return (
    <ul className="divide-y">
      {chats.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn('w-full space-y-1 p-3 text-left transition-colors hover:bg-muted/60', c.id === selectedId && 'bg-muted')}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {c.status === 'ended' ? format(new Date(c.created_at), 'd MMM yyyy') : 'Current chat'}
              </span>
              {c.unread_count > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            </span>
            <span className="block text-xs text-muted-foreground">
              {c.status === 'waiting' ? 'Waiting for the team' : c.status === 'active' ? `With ${c.admin_name}` : `Ended${c.admin_name ? ` · with ${c.admin_name}` : ''}`}
            </span>
            {c.last_message && <span className="line-clamp-1 text-xs text-muted-foreground">{c.last_message}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
};

// Support for customers, vendors and riders: one chat with the Cydex team at a
// time. Ended chats stay as read-only history; a message after one ends starts
// a new chat.
const SupportPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: chats = [], isLoading } = useMySupportChats();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const openChat = chats.find((c) => c.status !== 'ended');
  // Their open chat, or else the latest one (ended, with a box to start a new chat)
  const chat = chats.find((c) => c.id === pickedId) ?? openChat ?? chats[0];
  const { data: messages = [], isLoading: loadingMessages } = useSupportMessages(chat?.id);
  const canWrite = !chat || chat.status !== 'ended' || !openChat;

  const select = (id: string) => {
    setPickedId(id);
    setHistoryOpen(false);
  };

  const send = async (body: string) => {
    const { data, error } = await supabase.rpc('support_send_message', { p_body: body });
    if (error) {
      toast.error(errorMessage(error, 'Could not send your message'));
      return false;
    }
    setPickedId(data);
    await refreshSupport(queryClient, user?.id);
    return true;
  };

  const header = !chat
    ? { title: 'Chat with Cydex Support', sub: 'Ask us anything about your orders, payments or account.' }
    : chat.status === 'waiting'
      ? { title: 'Waiting for the team', sub: 'Someone will pick up your chat soon. You can keep adding details.' }
      : chat.status === 'active'
        ? { title: `Chatting with ${chat.admin_name}`, sub: 'Cydex Support' }
        : { title: `Chat from ${format(new Date(chat.created_at), 'd MMM yyyy')}`, sub: chat.ended_at ? `Ended ${formatDistanceToNow(new Date(chat.ended_at), { addSuffix: true })}` : 'Ended' };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl"><Headset className="h-6 w-6" /> Support</h1>
        <p className="text-sm text-muted-foreground">Chat with the Cydex team. You'll get a notification when they reply.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="hidden max-h-[calc(100dvh_-_12rem)] overflow-y-auto lg:block">
          <p className="border-b p-3 text-sm font-semibold">Your chats</p>
          {isLoading ? <div className="m-3 h-14 animate-pulse rounded bg-muted" /> : <ChatList chats={chats} selectedId={chat?.id} onSelect={select} />}
        </Card>

        <Card className="flex h-[calc(100dvh_-_13rem_-_var(--bottom-nav,0px))] min-h-[420px] flex-col overflow-hidden lg:h-[calc(100dvh_-_12rem)]">
          <div className="flex items-center gap-3 border-b p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
              {chat?.status === 'waiting' ? <Clock className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-semibold">
                {header.title}
                {chat?.status === 'ended' && <Badge variant="secondary">Ended</Badge>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{header.sub}</p>
            </div>
            {chats.length > 0 && (
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setHistoryOpen(true)}>
                <History className="mr-1.5 h-4 w-4" /> Chats
              </Button>
            )}
          </div>

          <ChatThread
            messages={chat ? messages : []}
            viewer="user"
            loading={isLoading || loadingMessages}
            empty={
              <div className="max-w-xs space-y-2">
                <Headset className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="font-medium">How can we help?</p>
                <p className="text-sm text-muted-foreground">Send a message and someone from the team will pick it up.</p>
              </div>
            }
          />

          {canWrite ? (
            <ChatComposer
              onSend={send}
              placeholder={chat?.status === 'ended' ? 'Send a message to start a new chat' : 'Write a message'}
            />
          ) : (
            <div className="border-t p-3 text-center">
              <Button variant="outline" size="sm" onClick={() => select(openChat!.id)}>Back to your current chat</Button>
            </div>
          )}
        </Card>
      </div>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-80 overflow-y-auto p-0">
          <SheetHeader className="border-b p-4"><SheetTitle>Your chats</SheetTitle></SheetHeader>
          <ChatList chats={chats} selectedId={chat?.id} onSelect={select} />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SupportPage;
