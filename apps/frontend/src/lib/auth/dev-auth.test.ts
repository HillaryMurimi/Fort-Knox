import { describe, expect, it } from 'vitest';
import { resolveDevAuthRole } from './dev-auth';

describe('development preview role resolution', () => {
  it('uses the selected preview role before the configured default', () => {
    expect(resolveDevAuthRole('TENANT', 'LANDLORD', 'development')).toBe('TENANT');
  });

  it('falls back to the configured role when no preview is selected', () => {
    expect(resolveDevAuthRole(null, 'PROPERTY_MANAGER', 'development')).toBe('PROPERTY_MANAGER');
  });

  it('rejects invalid stored role values', () => {
    expect(resolveDevAuthRole('OWNER', 'CARETAKER', 'development')).toBe('CARETAKER');
  });

  it('never enables a preview role in production', () => {
    expect(resolveDevAuthRole('SUPER_ADMIN', 'SUPER_ADMIN', 'production')).toBeNull();
  });
});

