import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MIN_LENGTH = 8;

type Field = 'current' | 'next' | 'confirm';

// Change password for any signed-in customer, vendor or rider. The current
// password is checked by signing in with it again before the new one is saved.
const ChangePasswordCard = ({ className }: { className?: string }) => {
  const [values, setValues] = useState<Record<Field, string>>({ current: '', next: '', confirm: '' });
  const [touched, setTouched] = useState<Record<Field, boolean>>({ current: false, next: false, confirm: false });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wrongCurrent, setWrongCurrent] = useState(false);

  const errors: Record<Field, string | null> = {
    current: !values.current ? 'Enter your current password.' : wrongCurrent ? 'That isn’t your current password.' : null,
    next: !values.next ? 'Enter a new password.'
      : values.next.length < MIN_LENGTH ? `Use at least ${MIN_LENGTH} characters.`
        : values.next === values.current ? 'Choose a password different from your current one.' : null,
    confirm: !values.confirm ? 'Enter the new password again.' : values.confirm !== values.next ? 'The passwords don’t match.' : null,
  };
  const valid = !errors.current && !errors.next && !errors.confirm;
  const changed = Object.values(values).some(Boolean);

  const set = (field: Field, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (field === 'current') setWrongCurrent(false);
  };
  const blur = (field: Field) => setTouched((t) => ({ ...t, [field]: true }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ current: true, next: true, confirm: true });
    if (!valid) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Please log in again');
      // Confirm the current password before changing it
      const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: values.current });
      if (checkError) {
        setWrongCurrent(true);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: values.next });
      if (error) throw error;
      toast.success('Password changed');
      setValues({ current: '', next: '', confirm: '' });
      setTouched({ current: false, next: false, confirm: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change your password');
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: Field; label: string; autoComplete: string }[] = [
    { key: 'current', label: 'Current password', autoComplete: 'current-password' },
    { key: 'next', label: 'New password', autoComplete: 'new-password' },
    { key: 'confirm', label: 'Confirm new password', autoComplete: 'new-password' },
  ];

  return (
    <Card className={cn('shadow-none', className)}>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Password</CardTitle>
        <CardDescription>Change your password. You’ll stay logged in on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="max-w-md space-y-4" noValidate>
          {fields.map(({ key, label, autoComplete }) => {
            const error = touched[key] || (key === 'current' && wrongCurrent) ? errors[key] : null;
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`pw-${key}`}>{label}</Label>
                <div className="relative">
                  <Input
                    id={`pw-${key}`}
                    type={show ? 'text' : 'password'}
                    autoComplete={autoComplete}
                    value={values[key]}
                    onChange={(e) => set(key, e.target.value)}
                    onBlur={() => blur(key)}
                    aria-invalid={!!error}
                    className={cn('pr-10', error && 'border-destructive focus-visible:ring-destructive')}
                  />
                  {key === 'current' && (
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      aria-label={show ? 'Hide passwords' : 'Show passwords'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
            );
          })}
          <Button type="submit" disabled={saving || !changed || !valid}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ChangePasswordCard;
