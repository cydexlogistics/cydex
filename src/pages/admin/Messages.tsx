import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle2, CircleDot, Clock, Download, Inbox, Loader2, Mail, Phone, Reply, Search } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import SimplePagination from '@/components/ui/simple-pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/address';
import { PAGE_SIZE } from '@/lib/pagination';
import { cn } from '@/lib/utils';

type Message = Database['public']['Functions']['admin_contact_messages']['Returns'][number];
type Status = 'unresolved' | 'in_progress' | 'resolved';

const STATUSES: Record<Status, { label: string; icon: typeof CircleDot; className: string }> = {
  unresolved: { label: 'Unresolved', icon: CircleDot, className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  in_progress: { label: 'In progress', icon: Clock, className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  resolved: { label: 'Resolved', icon: CheckCircle2, className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
};

const TOPICS: Record<string, string> = {
  general: 'General', orders: 'An order', vendors: 'Selling on Cydex', riders: 'Riding with Cydex', partnerships: 'Partnerships', press: 'Press',
};

// One message: the full text, reply by email, status and an internal note
const MessageCard = ({ m, onSaved }: { m: Message; onSaved: () => void }) => {
  const [open, setOpen] = useState(m.status !== 'resolved');
  const [note, setNote] = useState(m.admin_note ?? '');
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => setNote(m.admin_note ?? ''), [m.admin_note]);
  const status = STATUSES[m.status as Status] ?? STATUSES.unresolved;
  const noteChanged = note.trim() !== (m.admin_note ?? '');

  const save = async (next: Status, withNote: boolean) => {
    setSaving(withNote ? 'note' : next);
    const { error } = await supabase.rpc('admin_set_contact_message_status', {
      p_id: m.id, p_status: next, p_note: withNote ? note.trim() : undefined,
    });
    setSaving(null);
    if (error) return toast.error(errorMessage(error, 'Could not update the message'));
    toast.success(withNote ? 'Note saved' : `Marked ${STATUSES[next].label.toLowerCase()}`);
    onSaved();
  };

  const subject = encodeURIComponent(`Re: your message to Cydex (${TOPICS[m.topic] ?? m.topic})`);
  const quoted = encodeURIComponent(`\n\n---\nOn ${format(new Date(m.created_at), 'd MMM yyyy')}, ${m.name} wrote:\n${m.message}`);

  return (
    <li className="p-3 sm:p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {m.name}
            <Badge variant="outline" className={cn('gap-1 border-transparent', status.className)}><status.icon className="h-3 w-3" /> {status.label}</Badge>
            <Badge variant="outline">{TOPICS[m.topic] ?? m.topic}</Badge>
            {m.sender_role && <Badge variant="secondary" className="capitalize">{m.sender_role} account</Badge>}
          </p>
          <p className={cn('text-sm text-muted-foreground', !open && 'line-clamp-1')}>{open ? m.email : m.message}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground" title={format(new Date(m.created_at), 'd MMM yyyy, HH:mm')}>
          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{m.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={`mailto:${m.email}?subject=${subject}&body=${quoted}`}><Reply className="mr-1.5 h-3.5 w-3.5" /> Reply by email</a>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={`mailto:${m.email}`}><Mail className="mr-1.5 h-3.5 w-3.5" /> {m.email}</a>
            </Button>
            {m.phone && (
              <Button asChild size="sm" variant="ghost">
                <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}><Phone className="mr-1.5 h-3.5 w-3.5" /> {m.phone}</a>
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUSES) as Status[]).map((s) => {
                const S = STATUSES[s];
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={m.status === s ? 'default' : 'outline'}
                    className={cn(m.status === s && 'text-black')}
                    disabled={!!saving || m.status === s}
                    onClick={() => save(s, false)}
                  >
                    {saving === s ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <S.icon className="mr-1.5 h-3.5 w-3.5" />}
                    {S.label}
                  </Button>
                );
              })}
            </div>
            {m.status_updated_at && (
              <p className="text-xs text-muted-foreground">
                Last changed {format(new Date(m.status_updated_at), 'd MMM yyyy, HH:mm')}{m.status_updated_by_name ? ` by ${m.status_updated_by_name}` : ''}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Internal note (only admins see it)</p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. Replied by email, waiting for their order number" />
            <Button size="sm" variant="outline" disabled={!noteChanged || !!saving} onClick={() => save(m.status as Status, true)}>
              {saving === 'note' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save note
            </Button>
          </div>
        </div>
      )}
    </li>
  );
};

const MessagesTab = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status | 'all'>('unresolved');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-contact-messages', status, query, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_contact_messages', {
        p_status: status === 'all' ? undefined : status, p_search: query || undefined,
        p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const first = rows[0];
  const counts: Record<Status, number> = {
    unresolved: Number(first?.unresolved_count ?? 0),
    in_progress: Number(first?.in_progress_count ?? 0),
    resolved: Number(first?.resolved_count ?? 0),
  };
  const total = Number(first?.total_count ?? 0);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-contact-messages'] });
    queryClient.invalidateQueries({ queryKey: ['admin-unresolved-messages'] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['unresolved', 'in_progress', 'resolved', 'all'] as const).map((s) => (
            <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className={cn(status === s && 'text-black')}
              onClick={() => { setStatus(s); setPage(1); }}>
              {s === 'all' ? 'All' : STATUSES[s].label}
              {s !== 'all' && first && <span className="ml-1.5 rounded-full bg-background/60 px-1.5 text-xs">{counts[s]}</span>}
            </Button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or message" className="pl-9" />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              {status === 'unresolved' && !query ? 'Nothing waiting. All caught up.' : 'No messages.'}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((m) => <MessageCard key={m.id} m={m} onSaved={refresh} />)}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
};

// Newsletter sign-ups from the website footer
const NewsletterTab = () => {
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-newsletter', page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await supabase.from('newsletter_subscribers').select('*', { count: 'exact' })
        .order('subscribed_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.from('newsletter_subscribers').select('*').order('subscribed_at', { ascending: false }).limit(100000);
      if (error) throw error;
      const csv = [['Email', 'Signed up', 'Where'], ...(data ?? []).map((r) => [r.email, format(new Date(r.subscribed_at), 'yyyy-MM-dd HH:mm'), r.source])]
        .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cydex-newsletter-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not export'));
    } finally {
      setExporting(false);
    }
  };

  const rows = data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{(data?.total ?? 0).toLocaleString('en-NG')} subscribers</p>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || !data?.total}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Download CSV
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No subscribers yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.email} className="flex items-center justify-between gap-3 p-3 text-sm sm:px-4">
                  <a href={`mailto:${r.email}`} className="truncate font-medium hover:underline">{r.email}</a>
                  <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(r.subscribed_at), 'd MMM yyyy')}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
};

// Admin: messages from the website's contact form, and newsletter sign-ups
const AdminMessages = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'newsletter' ? 'newsletter' : 'messages';
  return (
    <AdminPage title="Messages" icon={Inbox} description="Messages from the website's contact form, and newsletter sign-ups.">
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="messages">Contact messages</TabsTrigger>
          <TabsTrigger value="newsletter">Newsletter</TabsTrigger>
        </TabsList>
        <TabsContent value="messages"><MessagesTab /></TabsContent>
        <TabsContent value="newsletter"><NewsletterTab /></TabsContent>
      </Tabs>
    </AdminPage>
  );
};

export default AdminMessages;
