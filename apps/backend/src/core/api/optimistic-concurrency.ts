import { AppError } from '../errors/AppError.js';

export function parseIfMatch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/^W\//, '').replace(/^"|"$/g, '');
  const version = Number(normalized);
  if (!Number.isInteger(version) || version < 0) {
    throw new AppError(400, 'INVALID_IF_MATCH', 'If-Match must contain a non-negative integer entity version');
  }
  return version;
}

export function assertVersion(currentVersion: number | undefined, expectedVersion: number | undefined): void {
  if (expectedVersion === undefined) return;
  if (currentVersion !== expectedVersion) {
    throw new AppError(409, 'VERSION_CONFLICT', 'The resource has changed since it was read', { currentVersion, expectedVersion });
  }
}

export function versionEtag(version: number): string {
  return `"${version}"`;
}
