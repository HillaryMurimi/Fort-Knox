import { describe, expect, it } from 'vitest';
import {
  canPresentRoute,
  navigationFor,
  roleForPath,
  ROLE_HOME,
} from './navigation';

describe('role preview navigation', () => {
  it('uses the selected tenant role for the tenant workspace', () => {
    expect(roleForPath(['TENANT'], '/tenant')).toBe('TENANT');
    expect(canPresentRoute('TENANT', '/tenant', [], true)).toBe(true);
    expect(canPresentRoute('TENANT', '/dashboard', [], true)).toBe(false);
  });

  it('builds navigation from the selected role only', () => {
    const labels = navigationFor('TENANT', [], true)
      .flatMap((section) => section.items)
      .map((item) => item.label);

    expect(labels).toContain('My Home');
    expect(labels).toContain('Rent & Payments');
    expect(labels).not.toContain('Command Center');
  });

  it('shows permission-labelled items in preview without granting API access', () => {
    const normalLabels = navigationFor('CARETAKER', [], false)
      .flatMap((section) => section.items)
      .map((item) => item.label);
    const previewLabels = navigationFor('CARETAKER', [], true)
      .flatMap((section) => section.items)
      .map((item) => item.label);

    expect(normalLabels).not.toContain('Security');
    expect(previewLabels).toContain('Security');
  });
});

describe('route presentation', () => {
  it.each(Object.entries(ROLE_HOME))('presents the %s home route', (role, home) => {
    expect(canPresentRoute(role as keyof typeof ROLE_HOME, home, [], true)).toBe(true);
  });

  it('keeps unrelated role workspaces unavailable', () => {
    expect(canPresentRoute('CONTRACTOR', '/tenant', [], true)).toBe(false);
    expect(canPresentRoute('TENANT', '/admin', [], true)).toBe(false);
  });

  it('normalizes hash and query fragments consistently', () => {
    expect(canPresentRoute('TENANT', '/tenant#payments', [], true)).toBe(true);
    expect(canPresentRoute('LANDLORD', '/properties?status=ACTIVE', [], true)).toBe(true);
  });
});
