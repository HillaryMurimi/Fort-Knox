'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui';
export const THEME_MODES = [{ key: 'light', label: 'Light', icon: Sun }, { key: 'dark', label: 'Dark', icon: Moon }, { key: 'system', label: 'System', icon: Monitor }] as const;
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <div role="group" aria-label="Appearance" className="flex shrink-0 rounded-lg border border-border bg-card p-0.5">{THEME_MODES.map(({ key, label, icon: Icon }) => <Button key={key} type="button" variant="ghost" size="icon" aria-label={label + ' theme'} title={label + ' theme'} aria-pressed={mounted && theme === key} disabled={!mounted} onClick={() => setTheme(key)} className="h-8 w-8 transition-colors aria-pressed:bg-muted aria-pressed:text-foreground"><Icon size={15}/></Button>)}</div>;
}
