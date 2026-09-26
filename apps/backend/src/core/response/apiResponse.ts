import type { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function apiResponse<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}
