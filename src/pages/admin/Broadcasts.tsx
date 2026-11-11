import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bell, Loader2, Mail, MapPin, Megaphone, Pencil, Plus, Repeat, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { MapLocationPicker } from '@/components/address/AddressPickerDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PagedList from '@/components/ui/paged-list';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/address';
import type { PickedLocation } from '@/lib/googleMaps';
import { nigerianDate, shiftDate } from '@/lib/nigerianTime';
import { cn } from '@/lib/utils';

type Broadcast = Tables<'broadcasts'>;
type Group = 'customer' | 'vendor' | 'rider';

const GROUPS: Record<Group, string> = { customer: 'Customers', vendor: 'Vendors', rider: 'Riders' };
const STATES: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  repeating: { label: 'Repeating', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  stopped: { label: 'Stopped', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};
const RADII = [2, 5, 10, 20];
const TITLE_MAX = 80;
const BODY_MAX = 2000;
const MAX_SCHEDULES = 20;

// A repeating broadcast's schedule: sent every day from start to end (dates in
// Nigeria), at each of the times (Nigerian time, "HH:MM")
interface Schedule { start: string; end: string; times: string[] }

// Nigeria is UTC+1 all year (no daylight saving)
const lagosMoment = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);

const scheduleIssue = (s: Schedule) =>
  !s.start || !s.end ? 'Choose the start and end dates.'
    : s.end < s.start ? 'The end date is before the start date.'
      : s.times.length === 0 ? 'Add at least one time.'
        : null;

// Every send still to come, earliest first (same as broadcast_next_send in the database)
const upcomingSends = (schedules: Schedule[], after = Date.now()) => {
  const today = nigerianDate(new Date(after));
  const limit = shiftDate(today, 366); // the database refuses schedules beyond a year
  const out = new Set<number>();
  for (const s of schedules) {
    if (scheduleIssue(s)) continue;
    for (let d = s.start < today ? today : s.start; d <= s.end && d <= limit; d = shiftDate(d, 1)) {
      for (const t of s.times) {
        const ms = lagosMoment(d, t).getTime();
        if (ms > after) out.add(ms);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
};

const dayLabel = (d: string) => format(new Date(`${d}T12:00:00Z`), 'd MMM yyyy');
const timeLabel = (t: string) => format(new Date(`2000-01-01T${t}:00`), 'h:mm a');
const describeSchedules = (schedules: Schedule[]) =>
  schedules
    .map((s) => `${s.start === s.end ? dayLabel(s.start) : `${dayLabel(s.start)} – ${dayLabel(s.end)}`} at ${s.times.map(timeLabel).join(', ')}`)
    .join('; ');
const schedulesOf = (b: Broadcast) => (b.repeats && Array.isArray(b.schedules) ? (b.schedules as unknown as Schedule[]) : []);

interface Draft {
  id?: string;
  title: string;
  body: string;
  push: boolean;
  email: boolean;
  groups: Group[];
  area: 'all' | 'near';
  location: PickedLocation | null;
  radius: string;
  when: 'now' | 'later' | 'repeat';
  at: string;
  schedules: Schedule[];
}
const newSchedule = (): Schedule => {
  const today = nigerianDate();
  return { start: today, end: shiftDate(today, 4), times: ['09:00'] };
};
const blank = (): Draft => ({
  title: '', body: '', push: true, email: false, groups: ['customer'], area: 'all', location: null, radius: '5',
  when: 'now', at: format(new Date(Date.now() + 3600e3), "yyyy-MM-dd'T'HH:mm"), schedules: [newSchedule()],
});
// A scheduled or repeating broadcast, to edit
const fromBroadcast = (b: Broadcast): Draft => {
  const near = b.radius_km != null && b.area_latitude != null && b.area_longitude != null;
  return {
    id: b.id,
    title: b.title,
    body: b.body,
    push: b.send_push,
    email: b.send_email,
    groups: b.audience as Group[],
    area: near ? 'near' : 'all',
    location: near ? {
      place_name: null, formatted_address: b.area_address ?? 'The chosen point', street: null, city: null, state: null,
      country: null, place_id: null, latitude: b.area_latitude!, longitude: b.area_longitude!,
    } : null,
    radius: near ? String(Number(b.radius_km)) : '5',
    when: b.repeats ? 'repeat' : 'later',
    at: format(new Date(b.scheduled_at), "yyyy-MM-dd'T'HH:mm"),
    schedules: b.repeats && schedulesOf(b).length ? schedulesOf(b) : [newSchedule()],
  };
};

// Scheduled with some sends done: it's running
const stateOf = (b: Broadcast) =>
  b.status === 'scheduled' && b.send_count > 0 ? 'repeating'
    : b.status === 'cancelled' && b.send_count > 0 ? 'stopped'
      : b.status;

const groupNames = (groups: string[]) => groups.map((g) => GROUPS[g as Group] ?? g).join(', ');
const people = (n: number | null) => `${n ?? 0} ${n === 1 ? 'person' : 'people'}`;
const when = (d: string | number | Date) => format(new Date(d), 'd MMM yyyy, h:mm a');

// One schedule in the form: its dates and times of day
const ScheduleEditor = ({ value, index, onChange, onRemove }: {
  value: Schedule; index: number; onChange: (s: Schedule) => void; onRemove?: () => void;
}) => {
  const [time, setTime] = useState('09:00');
  const issue = scheduleIssue(value);
  const addTime = () => time && !value.times.includes(time) && onChange({ ...value, times: [...value.times, time].sort() });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Schedule {index + 1}</p>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove schedule ${index + 1}`} onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`bc-start-${index}`} className="text-xs text-muted-foreground">From</Label>
          <Input id={`bc-start-${index}`} type="date" value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value, end: value.end && value.end < e.target.value ? e.target.value : value.end })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`bc-end-${index}`} className="text-xs text-muted-foreground">To</Label>
          <Input id={`bc-end-${index}`} type="date" value={value.end} min={value.start || undefined} onChange={(e) => onChange({ ...value, end: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`bc-time-${index}`} className="text-xs text-muted-foreground">Times each day (Nigerian time)</Label>
        {value.times.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.times.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 pr-1">
                {timeLabel(t)}
                <button type="button" aria-label={`Remove ${timeLabel(t)}`} className="rounded-full p-0.5 hover:bg-background"
                  onClick={() => onChange({ ...value, times: value.times.filter((x) => x !== t) })}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input id={`bc-time-${index}`} type="time" className="w-32" value={time} onChange={(e) => setTime(e.target.value)} />
          <Button type="button" variant="outline" size="sm" className="h-10" onClick={addTime} disabled={!time || value.times.includes(time)}>
            <Plus className="mr-1 h-4 w-4" /> Add time
          </Button>
        </div>
      </div>
      {issue && <p className="text-xs text-destructive">{issue}</p>}
    </div>
  );
};

// Admin: send an announcement to customers, vendors and/or riders, as a
// notification (with push) and/or an email, to everyone or only people near a
// place: now, at a set time, or repeatedly on one or more schedules
// (admin_save_broadcast; the send-due-broadcasts job sends scheduled ones).
// Broadcasts that are scheduled or still repeating can be edited or stopped.
const AdminBroadcasts = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ['admin-broadcasts'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const radius = Number(draft?.radius);
  const near = draft?.area === 'near';
  const areaOk = !near || (!!draft?.location && radius > 0 && radius <= 500);
  const later = draft?.when === 'later';
  const repeat = draft?.when === 'repeat';
  const atOk = !later || (!!draft?.at && new Date(draft.at).getTime() > Date.now());
  const sends = repeat && draft ? upcomingSends(draft.schedules) : [];
  const repeatOk = !repeat || (!!draft && draft.schedules.length > 0 && draft.schedules.every((s) => !scheduleIssue(s)) && sends.length > 0);
  const valid = !!draft && draft.title.trim().length > 1 && draft.body.trim().length > 1 && (draft.push || draft.email)
    && draft.groups.length > 0 && areaOk && atOk && repeatOk;
  const editing = !!draft?.id;

  // How many people it would reach, as the audience and area change
  const { data: reach, isFetching: counting } = useQuery({
    queryKey: ['admin-broadcast-reach', draft?.groups.join(','), near ? `${draft?.location?.latitude},${draft?.location?.longitude},${radius}` : 'all'],
    enabled: !!draft && draft.groups.length > 0 && areaOk,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_broadcast_reach', {
        p_audience: draft!.groups,
        p_latitude: near ? draft!.location!.latitude : undefined,
        p_longitude: near ? draft!.location!.longitude : undefined,
        p_radius_km: near ? radius : undefined,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const toggleGroup = (g: Group, on: boolean) => draft && setDraft({ ...draft, groups: on ? [...draft.groups, g] : draft.groups.filter((x) => x !== g) });
  const setSchedule = (i: number, s: Schedule) => setDraft((d) => (d ? { ...d, schedules: d.schedules.map((x, j) => (j === i ? s : x)) } : d));

  const send = async () => {
    if (!draft || !valid) return;
    const how = [draft.push ? 'a notification' : null, draft.email ? 'an email' : null].filter(Boolean).join(' and ');
    const where = near ? `within ${radius} km of ${draft.location!.place_name || draft.location!.formatted_address}` : 'everywhere';
    const audience = `${how} to ${groupNames(draft.groups).toLowerCase()} ${where}${reach !== undefined ? ` (about ${people(reach)})` : ''}`;
    const title = draft.title.trim();
    if (!(await confirm({
      title: editing ? `Are you sure you want to save your changes to “${title}”?`
        : repeat || later ? `Are you sure you want to schedule “${title}”?`
          : `Are you sure you want to send “${title}” now?`,
      description: repeat
        ? `It goes as ${audience}, ${describeSchedules(draft.schedules)} (Nigerian time): ${sends.length} ${sends.length === 1 ? 'send' : 'sends'}${
          editing ? ' left' : ''}, the next on ${when(sends[0])}. You can edit or stop it until its last send.`
        : `It goes as ${audience}${later ? `, on ${format(new Date(draft.at), 'd MMM yyyy')} at ${format(new Date(draft.at), 'h:mm a')}` : ' now'}. ${
          later ? 'You can edit or cancel it until then.' : 'It can’t be taken back once sent.'}`,
      confirmLabel: editing ? (draft.when === 'now' ? 'Yes, save and send' : 'Yes, save') : repeat || later ? 'Yes, schedule it' : 'Yes, send it',
    }))) return;

    setSaving(true);
    const { error } = await supabase.rpc('admin_save_broadcast', {
      p_id: draft.id,
      p_title: title,
      p_body: draft.body.trim(),
      p_audience: draft.groups,
      p_send_push: draft.push,
      p_send_email: draft.email,
      p_area_address: near ? draft.location!.formatted_address : undefined,
      p_latitude: near ? draft.location!.latitude : undefined,
      p_longitude: near ? draft.location!.longitude : undefined,
      p_radius_km: near ? radius : undefined,
      p_scheduled_at: later ? new Date(draft.at).toISOString() : undefined,
      p_repeats: repeat,
      p_schedules: repeat ? (draft.schedules as unknown as Json) : undefined,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save the broadcast'));
    toast.success(editing ? (draft.when === 'now' ? 'Saved and sent' : 'Changes saved') : repeat || later ? 'Broadcast scheduled' : 'Broadcast sent');
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
  };

  const cancel = async (b: Broadcast) => {
    const running = b.send_count > 0;
    if (!(await confirm({
      title: `Are you sure you want to ${running ? 'stop' : 'cancel'} “${b.title}”?`,
      description: running ? 'Its remaining sends won’t go out. What was already sent stays.' : 'It won’t be sent.',
      confirmLabel: running ? 'Yes, stop it' : 'Yes, cancel it',
      destructive: true,
    }))) return;
    const { error } = await supabase.rpc('admin_cancel_broadcast', { p_id: b.id });
    if (error) return toast.error(errorMessage(error, 'Could not stop the broadcast'));
    toast.success(running ? 'Broadcast stopped' : 'Broadcast cancelled');
    queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
  };

  // When it went (or goes) out, for the list
  const timing = (b: Broadcast) => {
    const sentPart = b.sent_at && b.send_count > 0
      ? b.repeats
        ? `sent ${b.send_count} ${b.send_count === 1 ? 'time' : 'times'}, last ${when(b.sent_at)} to ${people(b.recipients)}`
        : `sent ${when(b.sent_at)} to ${people(b.recipients)}`
      : null;
    const emails = b.send_email && b.send_count > 0 ? ` (${b.emails_queued ?? 0} emails)` : '';
    if (b.status === 'scheduled') return [sentPart && sentPart + emails, `next ${when(b.scheduled_at)}`].filter(Boolean).join(' · ');
    if (b.status === 'sent') return (sentPart ?? 'sent') + emails;
    return sentPart ? sentPart + emails : `was due ${when(b.scheduled_at)}`;
  };

  return (
    <AdminPage
      title="Broadcasts"
      icon={Megaphone}
      description="Send an announcement to customers, vendors or riders: as a notification, an email, or both."
      actions={<Button onClick={() => setDraft(blank())}><Plus className="mr-1.5 h-4 w-4" /> New broadcast</Button>}
    >
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
          ) : broadcasts.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No broadcasts yet.</p>
          ) : (
            <PagedList
              items={broadcasts}
              getKey={(b) => b.id}
              paginationClassName="border-t p-3"
              render={(b, i) => {
                const state = STATES[stateOf(b)];
                return (
                  <div className={cn('flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:px-4', i > 0 && 'border-t')}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="break-words">{b.title}</span>
                        <Badge variant="outline" className={cn('border-transparent', state?.className)}>{state?.label ?? b.status}</Badge>
                        {b.repeats && <Badge variant="outline" className="gap-1"><Repeat className="h-3 w-3" /> Repeats</Badge>}
                        {b.send_push && <Badge variant="outline" className="gap-1"><Bell className="h-3 w-3" /> Notification</Badge>}
                        {b.send_email && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> Email</Badge>}
                      </p>
                      <p className="line-clamp-2 whitespace-pre-line break-words text-sm text-muted-foreground">{b.body}</p>
                      {b.repeats && schedulesOf(b).length > 0 && (
                        <p className="break-words text-xs text-muted-foreground">Every day {describeSchedules(schedulesOf(b))}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        To {groupNames(b.audience).toLowerCase()}
                        {b.radius_km != null ? ` within ${Number(b.radius_km)} km of ${b.area_address ?? 'the chosen point'}` : ', everywhere'}
                        {' · '}
                        {timing(b)}
                      </p>
                    </div>
                    {b.status === 'scheduled' && (
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDraft(fromBroadcast(b))}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => cancel(b)}>{b.send_count > 0 ? 'Stop' : 'Cancel'}</Button>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit broadcast' : 'New broadcast'}</DialogTitle>
            <DialogDescription>
              People with push on get it on their phone too. Emails go only to people who haven't turned email
              notifications off.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bc-title">Title</Label>
                <Input id="bc-title" value={draft.title} maxLength={TITLE_MAX} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Free delivery this Saturday" />
                <p className="text-right text-xs text-muted-foreground">{draft.title.length}/{TITLE_MAX}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-body">Message</Label>
                <Textarea id="bc-body" rows={5} value={draft.body} maxLength={BODY_MAX} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="What you want people to know. In an email, a blank line starts a new paragraph." />
                <p className="flex justify-between text-xs text-muted-foreground">
                  <span>{draft.push && draft.body.length > 180 ? 'A phone notification only shows about the first 180 characters.' : ''}</span>
                  <span>{draft.body.length}/{BODY_MAX}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Send as</Label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.push} onCheckedChange={(c) => setDraft({ ...draft, push: !!c })} />
                  Notification in the app, with push
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.email} onCheckedChange={(c) => setDraft({ ...draft, email: !!c })} />
                  Email
                </label>
                {!draft.push && !draft.email && <p className="text-xs text-destructive">Choose at least one.</p>}
              </div>

              <div className="space-y-2">
                <Label>Send to</Label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {(Object.keys(GROUPS) as Group[]).map((g) => (
                    <label key={g} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={draft.groups.includes(g)} onCheckedChange={(c) => toggleGroup(g, !!c)} />
                      {GROUPS[g]}
                    </label>
                  ))}
                </div>
                {draft.groups.length === 0 && <p className="text-xs text-destructive">Choose at least one group.</p>}
              </div>

              <div className="space-y-2">
                <Label>Where</Label>
                <RadioGroup value={draft.area} onValueChange={(v) => setDraft({ ...draft, area: v as Draft['area'] })} className="gap-2">
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="all" /> Everyone in those groups</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="near" /> Only people near a place</label>
                </RadioGroup>
                {near && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <MapLocationPicker value={draft.location} onChange={(l) => setDraft((d) => (d ? { ...d, location: l } : d))} />
                    {draft.location && (
                      <p className="flex items-start gap-1.5 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="break-words">{draft.location.formatted_address}</span>
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="bc-radius">Radius (km)</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input id="bc-radius" type="number" min={0.1} max={500} step="any" className="w-28" value={draft.radius} onChange={(e) => setDraft({ ...draft, radius: e.target.value })} />
                        {RADII.map((r) => (
                          <Button key={r} type="button" size="sm" variant={Number(draft.radius) === r ? 'default' : 'outline'} className="h-8" onClick={() => setDraft({ ...draft, radius: String(r) })}>
                            {r} km
                          </Button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reaches people with a saved address inside the circle (a customer's delivery addresses, a vendor's
                      store, a rider's home) and riders whose last known location is inside it.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>When</Label>
                <RadioGroup value={draft.when} onValueChange={(v) => setDraft({ ...draft, when: v as Draft['when'] })} className="gap-2">
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="now" /> Now</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="later" /> Once, at a set time</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="repeat" /> Repeat on a schedule</label>
                </RadioGroup>
                {later && (
                  <>
                    <Input type="datetime-local" aria-label="Send time" value={draft.at} min={format(new Date(), "yyyy-MM-dd'T'HH:mm")} onChange={(e) => setDraft({ ...draft, at: e.target.value })} />
                    {!atOk && <p className="text-xs text-destructive">Choose a time in the future.</p>}
                  </>
                )}
                {repeat && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Sent every day from the start date to the end date, at each time you add. For different dates (say
                      the 21st–25th, then the 28th–31st), add another schedule.
                    </p>
                    {draft.schedules.map((s, i) => (
                      <ScheduleEditor
                        key={i}
                        index={i}
                        value={s}
                        onChange={(next) => setSchedule(i, next)}
                        onRemove={draft.schedules.length > 1 ? () => setDraft({ ...draft, schedules: draft.schedules.filter((_, j) => j !== i) }) : undefined}
                      />
                    ))}
                    {draft.schedules.length < MAX_SCHEDULES && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, schedules: [...draft.schedules, newSchedule()] })}>
                        <Plus className="mr-1 h-4 w-4" /> Add another schedule
                      </Button>
                    )}
                    {draft.schedules.every((s) => !scheduleIssue(s)) && (
                      <p className={cn('text-xs', sends.length ? 'text-muted-foreground' : 'text-destructive')}>
                        {sends.length
                          ? `${sends.length} ${sends.length === 1 ? 'send' : 'sends'}${editing ? ' left' : ''}. Next: ${format(new Date(sends[0]), 'EEE d MMM, h:mm a')}.`
                          : 'All these times have passed. Choose dates and times in the future.'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                {draft.groups.length === 0 || !areaOk
                  ? near && !draft.location ? 'Choose a place on the map to see how many people it reaches.' : 'Choose who to send it to.'
                  : counting && reach === undefined ? 'Counting…'
                    : `This reaches ${people(reach ?? 0)} right now${repeat ? ' (counted again at each send)' : ''}.`}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>{editing ? 'Close' : 'Cancel'}</Button>
            <Button onClick={send} disabled={saving || !valid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? (draft?.when === 'now' ? 'Save and send now' : 'Save changes') : repeat || later ? 'Schedule' : 'Send now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
};

export default AdminBroadcasts;
