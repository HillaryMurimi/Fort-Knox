import { AppError } from '../errors/AppError.js';

export function requiredParam(
  value: string | string[] | undefined,
  name: string
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(400, 'INVALID_PARAMETER', `${name} is required`);
  }

  return value;
}