import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Bike, ExternalLink, Package, ShieldCheck, Store, User } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { summariseHours, type OpeningHours } from '@/lib/openingHours';
import { nairaWhole } from '@/lib/adminPeriod';
import { ID_TYPES, STATUS_LABELS, verificationDocUrl, type Verification, type VerificationStatus } from '@/lib/verification';

type Counts = { total: number; delivered: number; in_progress: number; cancelled: number };

// Shape returned by admin_user_detail()
interface AdminUserDetail {
  profile: {
    id: string; name: string | null; email: string | null; phone: string | null; role: 'customer' | 'vendor' | 'rider' | 'admin';
    status: string; suspension_reason: string | null; avatar: string | null; store_banner_url: string | null;
    referral_code: string | null; created_at: string; login_count: number | null;
  };
  auth: { email_confirmed_at: string | null; last_sign_in_at: string | null; signed_up_at: string | null } | null;
  referred_by: { id: string; name: string | null; code: string; status: string } | null;
  referrals_made: number;
  address: { formatted_address: string | null; directions: string | null; label: string | null } | null;
  verification: (Verification & { category: string | null }) | null;
  hours: { prep_time_minutes: number; opening_hours: OpeningHours | null } | null;
  stats: {
    products?: { total: number; active: number; inactive: number };
    orders?: Counts & { sales?: number; spent?: number };
    rider_requests?: { total: number; delivered: number };
    deliveries?: Counts;
    earned?: number;
    rating?: number | null;
  };
}

const when = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy, HH:mm') : '–');
// Totals in whole naira, like the admin dashboard, so they fit the stat tiles
const naira = nairaWhole;

const Field = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 break-words text-right font-medium">{value ?? '–'}</span>
  </div>
);

const Stat = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <div className="rounded-lg border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-0.5 break-words text-lg font-bold sm:text-xl">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const breakdown = (c: Counts) => `${c.in_progress} in progress · ${c.cancelled} cancelled`;

// Admin: one person's account, what they entered at sign-up and onboarding,
// and their activity (vendors: products and orders; riders: deliveries)
const UserDetail = () => {
  const { id = '' } = useParams();
  const { nameOf } = useVehicleTypes(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_detail', { p_profile_id: id });
      if (error) throw error;
      return data as unknown as AdminUserDetail;
    },
  });

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link to="/admin/users"><ArrowLeft className="mr-1 h-4 w-4" /> All users</Link>
    </Button>
  );

  if (isLoading || !data) {
    return (
      <AdminPage title="User" icon={User}>
        {back}
        {error ? <p className="text-destructive">{errorMessage(error, 'Could not load this user')}</p>
          : <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />)}</div>}
      </AdminPage>
    );
  }

  const { profile: p, auth, verification: v, stats } = data;
  const isVendor = p.role === 'vendor';
  const isRider = p.role === 'rider';
  const hours = data.hours?.opening_hours && Object.keys(data.hours.opening_hours).length ? summariseHours(data.hours.opening_hours) : [];

  const openDoc = async (path: string) => {
    try {
      window.open(await verificationDocUrl(path), '_blank', 'noopener');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not open the document'));
    }
  };
  const docs = v ? ([
    [isVendor ? 'business licence' : 'ID document', isVendor ? v.business_license_path : v.id_document_path],
    ['vehicle photo', v.vehicle_photo_path],
    ['registration document', v.vehicle_registration_doc_path],
  ] as const).filter(([, path]) => !!path) : [];

  return (
    <AdminPage
      title={<span className="min-w-0 break-words">{p.name || 'Unnamed'}</span>}
      description={`${p.role.charAt(0).toUpperCase()}${p.role.slice(1)} · joined ${format(new Date(p.created_at), 'd MMM yyyy')}`}
      icon={isVendor ? Store : isRider ? Bike : User}
    >
      {back}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="capitalize">{p.role}</Badge>
        {p.status === 'suspended' && <Badge variant="destructive">Suspended</Badge>}
        {(isVendor || isRider) && (
          <Badge variant="secondary">{v ? STATUS_LABELS[v.status as VerificationStatus] ?? v.status : 'Not onboarded'}</Badge>
        )}
      </div>
      {p.status === 'suspended' && p.suspension_reason && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span className="font-medium">Suspended:</span> {p.suspension_reason}
        </p>
      )}

      {/* Activity */}
      {isVendor && stats.products && stats.orders && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Products" value={stats.products.total} hint={`${stats.products.active} active · ${stats.products.inactive} hidden or sold out`} />
          <Stat label="Orders delivered" value={stats.orders.delivered} hint={`${stats.orders.total} paid orders · ${breakdown(stats.orders)}`} />
          <Stat label="Sales (delivered)" value={naira(stats.orders.sales)} />
          <Stat label="Rider requests" value={stats.rider_requests?.total ?? 0} hint={`${stats.rider_requests?.delivered ?? 0} delivered`} />
        </div>
      )}
      {isRider && stats.deliveries && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Orders delivered" value={stats.deliveries.delivered} hint={`${stats.deliveries.total} taken · ${breakdown(stats.deliveries)}`} />
          <Stat label="Earned (delivered)" value={naira(stats.earned)} />
          <Stat label="Rating" value={stats.rating ? Number(stats.rating).toFixed(1) : '–'} />
          <Stat label="In progress" value={stats.deliveries.in_progress} />
        </div>
      )}
      {p.role === 'customer' && stats.orders && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Orders delivered" value={stats.orders.delivered} hint={`${stats.orders.total} paid orders · ${breakdown(stats.orders)}`} />
          <Stat label="Spent (delivered)" value={naira(stats.orders.spent)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Account and sign-up */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" /> Account</CardTitle></CardHeader>
          <CardContent>
            <Field label={isVendor ? 'Store name' : 'Name'} value={p.name} />
            <Field label="Email" value={p.email && <a href={`mailto:${p.email}`} className="text-primary hover:underline">{p.email}</a>} />
            <Field label="Phone" value={p.phone && <a href={`tel:${p.phone}`} className="text-primary hover:underline">{p.phone}</a>} />
            <Field label="Signed up" value={when(auth?.signed_up_at ?? p.created_at)} />
            <Field label="Email confirmed" value={auth?.email_confirmed_at ? when(auth.email_confirmed_at) : 'Not yet'} />
            <Field label="Last signed in" value={when(auth?.last_sign_in_at)} />
            {!!p.login_count && <Field label="Logins" value={p.login_count} />}
            {p.role !== 'admin' && <Field label="Referral code" value={p.referral_code} />}
            <Field
              label="Referred by"
              value={data.referred_by
                ? <Link to={`/admin/users/${data.referred_by.id}`} className="text-primary hover:underline">{data.referred_by.name || 'Unnamed'} ({data.referred_by.code})</Link>
                : 'No one'}
            />
            {p.role !== 'admin' && <Field label="People they referred" value={data.referrals_made} />}
            {data.address?.formatted_address && (
              <Field
                label={isVendor ? 'Store address' : 'Address'}
                value={<>{data.address.formatted_address}{data.address.directions && <span className="block text-xs font-normal text-muted-foreground">{data.address.directions}</span>}</>}
              />
            )}
          </CardContent>
        </Card>

        {/* What vendors and riders entered at onboarding */}
        {(isVendor || isRider) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Onboarding and verification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!v ? (
                <p className="text-sm text-muted-foreground">They haven't finished onboarding yet.</p>
              ) : (
                <>
                  {isVendor && (p.store_banner_url || p.avatar) && (
                    <div className="relative h-24 overflow-hidden rounded-lg bg-gray-200 dark:bg-muted">
                      {p.store_banner_url && <img src={p.store_banner_url} alt="Store banner" className="h-full w-full object-cover" />}
                      {p.avatar && <img src={p.avatar} alt="Store logo" className="absolute bottom-2 left-2 h-14 w-14 rounded-lg border-2 border-background object-cover" />}
                    </div>
                  )}
                  <div>
                    <Field label="Status" value={STATUS_LABELS[v.status as VerificationStatus] ?? v.status} />
                    <Field label="Submitted" value={when(v.submitted_at)} />
                    {v.reviewed_at && <Field label="Reviewed" value={when(v.reviewed_at)} />}
                    {isVendor ? (
                      <>
                        <Field label="Business category" value={v.category} />
                        <Field label="Registered business" value={v.is_registered_business ? 'Yes' : 'No'} />
                        {data.hours && <Field label="Preparation time" value={`${data.hours.prep_time_minutes} min`} />}
                        {hours.length > 0 && <Field label="Opening hours" value={hours.map((line) => <span key={line} className="block">{line}</span>)} />}
                      </>
                    ) : (
                      <>
                        <Field label="Vehicle" value={nameOf(v.vehicle_type)} />
                        {v.vehicle_model && <Field label="Model" value={`${v.vehicle_model}${v.vehicle_year ? ` (${v.vehicle_year})` : ''}`} />}
                        {v.vehicle_color && <Field label="Colour" value={v.vehicle_color} />}
                        {v.vehicle_registration && <Field label="Registration number" value={v.vehicle_registration} />}
                        <Field label="ID type" value={ID_TYPES.find((t) => t.value === v.id_document_type)?.label} />
                      </>
                    )}
                    {v.rejection_reason && <Field label="Last rejection" value={v.rejection_reason} />}
                    {v.suspension_reason && <Field label="Suspended for" value={v.suspension_reason} />}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {docs.map(([label, path]) => (
                      <Button key={label} variant="outline" size="sm" onClick={() => openDoc(path!)}>
                        <ExternalLink className="mr-2 h-4 w-4" /> View {label}
                      </Button>
                    ))}
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/verifications"><ShieldCheck className="mr-2 h-4 w-4" /> Review in Verifications</Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* The orders search matches customer emails and customer, vendor and rider names */}
      {p.role !== 'admin' && (p.role === 'customer' ? p.email : p.name) && (
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link to={`/admin/orders?q=${encodeURIComponent((p.role === 'customer' ? p.email : p.name)!)}`}>
            <Package className="mr-2 h-4 w-4" /> See their orders
          </Link>
        </Button>
      )}
    </AdminPage>
  );
};

export default UserDetail;
