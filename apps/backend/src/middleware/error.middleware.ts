import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../core/errors/AppError.js';
import { logger } from '../core/logging/logger.js';

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = req.requestId;
  logger.error({ err: error, requestId }, 'Unhandled request error');

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message, details: error.details }, requestId });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.issues },
      requestId
    });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.errors }, requestId });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PARAMETER', message: `Invalid ${error.path}` }, requestId });
    return;
  }

  if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
    res.status(409).json({ success: false, error: { code: 'DUPLICATE_RESOURCE', message: 'A resource with the same unique identifier already exists' }, requestId });
    return;
  }

  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' }, requestId });
};
