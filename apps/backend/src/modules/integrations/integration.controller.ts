import { Request, Response } from 'express';
import { IntegrationService } from './integration.service.js';
import { apiResponse } from '../../core/api/api-response.js';
import { requiredParam } from '../../core/http/params.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import {
  paymentInitiateSchema,
  storageSignSchema,
  cctvHealthSchema,
} from './integration.schemas.js';

const auth = (req: Request) => req.auth as AuthenticatedUser;

export async function initiatePayment(req: Request, res: Response) {
  const d = paymentInitiateSchema.parse(req.body);
  return res.status(202).json(
    apiResponse(
      await IntegrationService.initiatePayment(
        auth(req),
        requiredParam(req.params.paymentId, 'paymentId'),
        d.provider,
        d.phone,
        d.email,
        d.paystackChannels,
      ),
    ),
  );
}

export async function reconcilePayment(req: Request, res: Response) {
  return res.json(
    apiResponse(
      await IntegrationService.reconcilePayment(
        auth(req),
        requiredParam(req.params.paymentId, 'paymentId'),
      ),
    ),
  );
}

export async function signedUrl(req: Request, res: Response) {
  const d = storageSignSchema.parse(req.body);
  return res.json(
    apiResponse(
      await IntegrationService.signedUrl(
        auth(req),
        requiredParam(req.params.organizationId, 'organizationId'),
        d.key,
        d.provider,
        d.expiresInSeconds,
      ),
    ),
  );
}

export async function cctvHealth(req: Request, res: Response) {
  const d = cctvHealthSchema.parse(req.query);
  return res.json(
    apiResponse(await IntegrationService.cctvHealth(auth(req), d.organizationId, d.cameraId)),
  );
}

export async function health(_req: Request, res: Response) {
  return res.json(apiResponse(await IntegrationService.health()));
}

export async function webhook(req: Request, res: Response) {
  const provider = requiredParam(req.params.provider, 'provider').toUpperCase();
  if (!['MPESA', 'PAYSTACK'].includes(provider)) {
    throw new AppError(
      400,
      'UNSUPPORTED_WEBHOOK_PROVIDER',
      'Unsupported webhook provider',
    );
  }
  const raw =
    (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const result = await IntegrationService.handleWebhook(
    provider as 'MPESA' | 'PAYSTACK',
    raw,
    req.header('x-paystack-signature') ??
      req.header('x-webhook-signature') ?? undefined,
  );
  return res.status(200).json(apiResponse({ received: true, eventId: result.eventId }));
}
