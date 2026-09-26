'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { PageTransition } from './page-transition';
import { DevRoleSwitcher } from './dev/dev-role-switcher';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  const openMobileSidebar =
    useCallback(() => {
      setMobileSidebarOpen(true);
    }, []);

  const closeMobileSidebar =
    useCallback(() => {
      setMobileSidebarOpen(false);
    }, []);

  const toggleMobileSidebar =
    useCallback(() => {
      setMobileSidebarOpen(
        (current) => !current,
      );
    }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow =
      'hidden';

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [mobileSidebarOpen]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:bg-card focus:p-3">Skip to content</a>
      <DevRoleSwitcher/>
      <div className="flex min-h-screen">
        <Sidebar
          mobileOpen={
            mobileSidebarOpen
          }
          onMobileClose={
            closeMobileSidebar
          }
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onMobileMenuToggle={
              toggleMobileSidebar
            }
            mobileMenuOpen={
              mobileSidebarOpen
            }
          />

          <main id="main-content" className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-7">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
