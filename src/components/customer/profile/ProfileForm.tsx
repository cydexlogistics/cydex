import React from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Field = 'name' | 'phone';

interface ProfileFormProps {
  values: { name: string; email: string; phone: string };
  errors: Record<Field, string | null>;
  /** Which fields to show errors for (touched, or missing when loaded) */
  showErrors: Record<Field, boolean>;
  onChange: (field: Field, value: string) => void;
  onBlur: (field: Field) => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
}

// Always editable; "Save changes" is enabled once something changes and the
// values are valid. Errors show under the fields.
const ProfileForm = ({ values, errors, showErrors, onChange, onBlur, onSave, canSave, saving }: ProfileFormProps) => {
  const error = (field: Field) => (showErrors[field] ? errors[field] : null);

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); onSave(); }} className="md:w-2/3 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          placeholder="Your full name"
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
          onBlur={() => onBlur('name')}
          aria-invalid={!!error('name')}
          className={cn(error('name') && 'border-destructive focus-visible:ring-destructive')}
        />
        {error('name') && <p className="text-xs text-destructive">{error('name')}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" value={values.email} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">Your login email. Contact support to change it.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          placeholder="e.g. 08012345678"
          value={values.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          onBlur={() => onBlur('phone')}
          aria-invalid={!!error('phone')}
          className={cn(error('phone') && 'border-destructive focus-visible:ring-destructive')}
        />
        {error('phone') && <p className="text-xs text-destructive">{error('phone')}</p>}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={!canSave || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
};

export default ProfileForm;
