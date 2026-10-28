import { useEffect, useRef, type ReactNode } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import type { SupportMessage } from '@/hooks/useSupport';
import { cn } from '@/lib/utils';

const dayLabel = (d: Date) => (isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEE d MMM yyyy'));

// What happened, for the line in the middle of the chat. Admins see full
// names and who did what; customers, vendors and riders see first names.
const eventText = (m: SupportMessage, viewer: 'user' | 'admin') => {
  const who = m.mine ? 'You' : m.sender_name;
  if (m.kind === 'joined') return viewer === 'admin' ? `${who} picked up the chat` : `${m.sender_name} joined the chat`;
  if (m.kind === 'transferred') {
    return viewer === 'admin' ? `${who} transferred the chat to ${m.admin_name}` : `You're now chatting with ${m.admin_name}`;
  }
  return viewer === 'admin' ? `Chat ended by ${who}` : 'Chat ended';
};

interface ChatThreadProps {
  messages: SupportMessage[];
  viewer: 'user' | 'admin';
  loading?: boolean;
  /** Shown when there are no messages */
  empty?: ReactNode;
}

// A chat's messages, oldest at the top, scrolled to the newest
const ChatThread = ({ messages, viewer, loading, empty }: ChatThreadProps) => {
  const bottom = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [last]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 space-y-3 p-4">
        {[0, 1, 2].map((i) => <div key={i} className={cn('h-10 w-2/3 animate-pulse rounded-2xl bg-muted', i === 1 && 'ml-auto')} />)}
      </div>
    );
  }
  if (messages.length === 0) return <div className="flex flex-1 items-center justify-center p-6 text-center">{empty}</div>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
      <ol className="space-y-1">
        {messages.map((m, i) => {
          const at = new Date(m.created_at);
          const prev = messages[i - 1];
          const newDay = !prev || dayLabel(new Date(prev.created_at)) !== dayLabel(at);
          // Name above the first of a run of messages from someone else
          const showName = m.kind === 'message' && !m.mine
            && (newDay || prev?.kind !== 'message' || prev.mine || prev.sender_name !== m.sender_name);
          return (
            <li key={m.id}>
              {newDay && <p className="py-2 text-center text-xs font-medium text-muted-foreground">{dayLabel(at)}</p>}
              {m.kind === 'message' ? (
                <div className={cn('flex flex-col', m.mine ? 'items-end' : 'items-start', showName && 'mt-3')}>
                  {showName && (
                    <span className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                      {m.sender_name}
                      {viewer === 'admin' && m.from_admin && ' (admin)'}
                    </span>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm sm:max-w-[75%]',
                      m.mine ? 'rounded-br-md bg-primary text-black' : 'rounded-bl-md bg-muted text-foreground',
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="mt-0.5 px-1 text-[11px] text-muted-foreground">{format(at, 'HH:mm')}</span>
                </div>
              ) : (
                <div className={cn('flex items-center gap-3 py-3', m.kind === 'ended' && 'pb-1')}>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-center text-xs text-muted-foreground">
                    <span className={cn(m.kind === 'ended' && 'font-medium text-foreground')}>{eventText(m, viewer)}</span>
                    {' · '}
                    {format(at, 'HH:mm')}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div ref={bottom} />
    </div>
  );
};

export default ChatThread;
