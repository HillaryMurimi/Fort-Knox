'use client';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
import { MotionConfig } from 'motion/react';
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="pmcc.theme" disableTransitionOnChange><MotionConfig reducedMotion="user">{children}</MotionConfig></NextThemeProvider>;
}
