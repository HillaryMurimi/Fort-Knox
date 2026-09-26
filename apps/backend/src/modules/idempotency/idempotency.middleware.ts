import type { RequestHandler } from 'express';
import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { IdempotencyRecord } from '../../database/models/IdempotencyRecord.js';
import { AppError } from '../../core/errors/AppError.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hashBody(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

export const idempotencyMiddleware: RequestHandler = async (req, res, next) => {
  if (!MUTATING.has(req.method) || req.path.endsWith('/health') || req.path.includes('/operations') || req.path.startsWith('/auth/social/')) {
    next();
    return;
  }

  const key = req.header('Idempotency-Key');
  if (!key) {
    next();
    return;
  }
  if (key.length < 16 || key.length > 200) {
    next(new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must contain 16-200 characters'));
    return;
  }

  const userId = req.auth?.userId;
  const organizationId = req.auth?.activeOrganizationId;
  const authScope = userId ? String(userId) : crypto.createHash('sha256').update(req.header('authorization') ?? 'anonymous').digest('hex');
  const requestHash = hashBody(req.body);
  const compoundKey = `${authScope}:${req.method}:${req.path}:${key}`;

  try {
    const existing = await IdempotencyRecord.findOne({ key: compoundKey });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        next(new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different request payload'));
        return;
      }
      if (existing.status === 'PROCESSING') {
        next(new AppError(409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'An identical request is already being processed'));
        return;
      }
      res.status(existing.statusCode ?? 200).json(existing.responseBody);
      return;
    }

    await IdempotencyRecord.create({
      key: compoundKey,
      userId: userId && Types.ObjectId.isValid(userId) ? userId : undefined,
      organizationId,
      method: req.method,
      path: req.path,
      requestHash,
      status: 'PROCESSING',
    });

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      void IdempotencyRecord.updateOne(
        { key: compoundKey },
        { $set: { status: 'COMPLETED', statusCode: res.statusCode, responseBody: body } },
      ).catch(() => undefined);
      return originalJson(body);
    }) as typeof res.json;

    next();
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
      const existing = await IdempotencyRecord.findOne({ key: compoundKey });
      if (existing?.status === 'COMPLETED') {
        res.status(existing.statusCode ?? 200).json(existing.responseBody);
        return;
      }
      next(new AppError(409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'An identical request is already being processed'));
      return;
    }
    next(error);
  }
};
