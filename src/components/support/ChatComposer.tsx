import { useState, type KeyboardEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatComposerProps {
  /** Resolves true when sent, so the box can be cleared */
  onSend: (body: string) => Promise<boolean>;
  placeholder?: string;
  disabled?: boolean;
}

// Message box: Enter sends, Shift+Enter adds a new line
const ChatComposer = ({ onSend, placeholder = 'Write a message', disabled }: ChatComposerProps) => {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const canSend = !!body.trim() && !sending && !disabled;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const sent = await onSend(body.trim());
    setSending(false);
    if (sent) setBody('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t p-2 sm:p-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        maxLength={2000}
        aria-label="Message"
        className="max-h-32 min-h-10 resize-none"
      />
      <Button type="button" size="icon" onClick={send} disabled={!canSend} aria-label="Send" className="shrink-0 text-black">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
};

export default ChatComposer;
