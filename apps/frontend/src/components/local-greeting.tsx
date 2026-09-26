'use client';

import { useEffect, useState } from 'react';
import { greetingForHour } from '@/lib/greeting';

export function LocalGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState('Welcome');
  useEffect(() => {
    const update = () => setGreeting(greetingForHour(new Date().getHours()));
    update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  return <>{greeting}, {name}</>;
}
