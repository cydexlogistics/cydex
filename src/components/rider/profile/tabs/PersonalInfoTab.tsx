import React, { useEffect, useState } from 'react';
import PersonalInfoForm from './forms/PersonalInfoForm';
import NotificationSettingsCard from '@/components/notifications/NotificationSettingsCard';
import { isValidPhone } from '@/lib/phone';

interface PersonalInfoTabProps {
  profile: any;
  /** Saves the name and phone; resolves true when saved */
  onSaveProfile?: (updatedData: { name: string; phone: string }) => Promise<boolean>;
}

type Field = 'name' | 'phone';

// Always editable. "Save changes" is enabled once something changes and every
// field is valid; errors show under the fields.
const PersonalInfoTab = ({ profile, onSaveProfile }: PersonalInfoTabProps) => {
  const saved = { name: profile?.name || '', email: profile?.email || '', phone: profile?.phone || '' };
  const [formData, setFormData] = useState(saved);
  const [touched, setTouched] = useState<Record<Field, boolean>>({ name: false, phone: false });
  const [saving, setSaving] = useState(false);

  // Start again from the saved values whenever they change (loaded, or saved)
  useEffect(() => {
    setFormData({ name: profile?.name || '', email: profile?.email || '', phone: profile?.phone || '' });
    setTouched({ name: false, phone: false });
  }, [profile?.name, profile?.email, profile?.phone]);

  const errors = {
    name: formData.name.trim().length < 2 ? 'Enter your full name.' : null,
    phone: !formData.phone.trim() ? 'Enter your phone number. Customers and vendors use it to reach you.'
      : !isValidPhone(formData.phone) ? 'Enter a valid phone number, e.g. 08012345678.' : null,
  };
  const changed = formData.name.trim() !== saved.name.trim() || formData.phone.trim() !== saved.phone.trim();
  const valid = !errors.name && !errors.phone;

  const save = async () => {
    setTouched({ name: true, phone: true });
    if (!valid || !changed || !onSaveProfile) return;
    setSaving(true);
    try {
      await onSaveProfile({ name: formData.name.trim(), phone: formData.phone.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PersonalInfoForm
        formData={formData}
        errors={errors}
        // Missing details show their error straight away; others once edited
        showErrors={{ name: touched.name || !saved.name, phone: touched.phone || !saved.phone }}
        onInputChange={(field, value) => setFormData((f) => ({ ...f, [field]: value }))}
        onBlur={(field) => setTouched((t) => ({ ...t, [field]: true }))}
        onSave={save}
        canSave={changed && valid}
        saving={saving}
      />

      <div className="mt-4">
        <NotificationSettingsCard />
      </div>
    </>
  );
};

export default PersonalInfoTab;
