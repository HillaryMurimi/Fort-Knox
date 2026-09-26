export function passwordConfirmationError(password: string, confirmation: string): string | null {
  if (password.length < 12 || password.length > 200) {
    return 'Use a password between 12 and 200 characters.';
  }
  if (password !== confirmation) {
    return 'Passwords do not match.';
  }
  return null;
}
