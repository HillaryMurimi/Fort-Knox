export function resolveMpesaAccountReference(template: string | null | undefined, leaseNumber: string): string | null {
  if (!template) return null;
  const reference = template.replaceAll('{{leaseNumber}}', leaseNumber).trim();
  return /^[a-zA-Z0-9]{1,12}$/.test(reference) ? reference : null;
}
