import React from 'react';
import { Loader2, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import SingleAddressField from '@/components/address/SingleAddressField';
import { cn } from '@/lib/utils';

interface PersonalInfoFormProps {
  formData: { name: string; email: string; phone: string };
  errors: { name: string | null; phone: string | null };
  /** Which fields to show errors for (touched, or missing when loaded) */
  showErrors: { name: boolean; phone: boolean };
  onInputChange: (field: 'name' | 'phone', value: string) => void;
  onBlur: (field: 'name' | 'phone') => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
}

const PersonalInfoForm = ({ formData, errors, showErrors, onInputChange, onBlur, onSave, canSave, saving }: PersonalInfoFormProps) => {
  const { permission, position, label } = useRiderLocation();
  const liveLocation =
    permission !== 'granted' ? 'Location is off' : !position ? 'Finding your location…' : label ? `Near ${label}` : 'Location on';
  const nameError = showErrors.name ? errors.name : null;
  const phoneError = showErrors.phone ? errors.phone : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <User className="h-5 w-5 mr-2" />
          Personal Information
        </CardTitle>
        <CardDescription>Update your basic profile information</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); onSave(); }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                placeholder="Your full name"
                value={formData.name}
                onChange={(e) => onInputChange('name', e.target.value)}
                onBlur={() => onBlur('name')}
                aria-invalid={!!nameError}
                className={cn(nameError && 'border-destructive focus-visible:ring-destructive')}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Your login email. Contact support to change it.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="e.g. 08012345678"
                value={formData.phone}
                onChange={(e) => onInputChange('phone', e.target.value)}
                onBlur={() => onBlur('phone')}
                aria-invalid={!!phoneError}
                className={cn(phoneError && 'border-destructive focus-visible:ring-destructive')}
              />
              {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
            </div>
            <div className="md:col-span-2">
              {/* Saved address; saves on its own through the address picker */}
              <SingleAddressField
                label="Address"
                addressLabel="Home"
                pickerTitle="Your address"
                pickerDescription="Search for your address, then drag the map so the pin sits exactly on it."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Current location</Label>
              {/* Live location, separate from the saved address (used for the 5 km order radius) */}
              <p className="rounded-md border p-3 text-sm">
                {liveLocation}
                <span className="block text-xs text-muted-foreground">Updated automatically while you use the app</span>
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={!canSave || saving} className="bg-primary hover:bg-primary-hover text-black">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default PersonalInfoForm;
