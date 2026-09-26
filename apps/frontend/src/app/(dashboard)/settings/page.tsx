import type { ComponentType } from 'react';
import { PageTitle } from '@/components/ui';
import * as I from '@/components/icons';

type SettingsEntry = readonly [title: string, description: string, icon: ComponentType<{ size?: number }>];

const entries: readonly SettingsEntry[] = [
  ['Organization', 'Properties, buildings, currency and organization profile', I.Building2],
  ['Roles & permissions', 'RBAC, ABAC scopes and membership controls', I.Shield],
  ['Billing & subscription', 'Plan, invoices, usage and provider state', I.CreditCard],
  ['Notifications', 'Event preferences, channels and delivery rules', I.Bell],
  ['Integrations', 'Payment, messaging, storage and CCTV providers', I.CloudCog],
  ['Security', 'Sessions, OTP policy, audit and access controls', I.Settings],
];

export default function Settings() {
  return (
    <>
      <PageTitle
        eyebrow="Administration"
        title="Settings"
        description="Organization, access, billing, notifications and integration configuration."
      />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {entries.map(([title, description, Icon]) => (
          <div className="card p-5 hover:border-[#cfd4dc]" key={title}>
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Icon size={18} />
            </div>
            <div className="font-semibold mt-4">{title}</div>
            <p className="text-sm text-muted-foreground mt-1 leading-5">{description}</p>
            <button className="text-xs font-semibold mt-4">Configure →</button>
          </div>
        ))}
      </div>
    </>
  );
}