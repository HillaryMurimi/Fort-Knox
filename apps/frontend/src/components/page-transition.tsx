'use client';
import { motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const reduced = useReducedMotion();
  return <motion.div key={path} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="min-w-0">{children}</motion.div>;
}
