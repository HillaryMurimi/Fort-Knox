import { describe, expect, it } from 'vitest';
import { passwordConfirmationError } from './signup-validation';

describe('landlord password confirmation', () => {
  it('accepts matching passwords at both length boundaries', () => {
    for (const length of [12, 200]) {
      const password = 'a'.repeat(length);
      expect(passwordConfirmationError(password, password)).toBeNull();
    }
  });

  it('rejects missing or mismatched confirmation', () => {
    expect(passwordConfirmationError('a secure password', '')).toBe('Passwords do not match.');
    expect(passwordConfirmationError('a secure password', 'A secure password')).toBe('Passwords do not match.');
  });

  it('does not silently trim passwords', () => {
    expect(passwordConfirmationError('a secure password ', 'a secure password')).toBe('Passwords do not match.');
  });

  it('enforces the backend password length policy', () => {
    for (const password of ['', 'a'.repeat(11), 'a'.repeat(201)]) {
      expect(passwordConfirmationError(password, password)).toBe('Use a password between 12 and 200 characters.');
    }
  });
});
