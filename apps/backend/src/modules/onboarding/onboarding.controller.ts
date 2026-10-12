import type { Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../../core/response/apiResponse.js';
import { requiredParam } from '../../core/http/params.js';
import { startOnboardingSchema, verifyOnboardingSchema, sendOnboardingOtpSchema, onboardingParamsSchema, organizationParamsSchema } from './onboarding.schemas.js';
import { OnboardingService } from './onboarding.service.js';
export async function start(req: Request, res: Response): Promise<void> { const { organizationId } = organizationParamsSchema.parse({ organizationId: requiredParam(req.params.organizationId, 'organizationId') }); const data = startOnboardingSchema.parse(req.body); res.status(201).json(apiResponse(await OnboardingService.start(req.auth!, organizationId, data))); }
export async function sendOtp(req: Request, res: Response): Promise<void> { const { onboardingId } = onboardingParamsSchema.parse({ onboardingId: requiredParam(req.params.onboardingId, 'onboardingId') }); res.json(apiResponse(await OnboardingService.sendOtp(req.auth!, onboardingId, sendOnboardingOtpSchema.parse(req.body ?? {}).channel))); }
export async function get(req: Request, res: Response): Promise<void> { const { onboardingId } = onboardingParamsSchema.parse({ onboardingId: requiredParam(req.params.onboardingId, 'onboardingId') }); res.json(apiResponse(await OnboardingService.get(req.auth!, onboardingId))); }
export async function requestActivation(req: Request, res: Response): Promise<void> { const input = z.discriminatedUnion('channel', [z.object({ channel: z.literal('EMAIL'), identifier: z.string().email() }).strict(), z.object({ channel: z.literal('SMS'), identifier: z.string().trim().min(7).max(40) }).strict()]).parse(req.body); res.json(apiResponse(await OnboardingService.requestActivation(input.identifier, input.channel))); }
export async function verify(req: Request, res: Response): Promise<void> { const data = verifyOnboardingSchema.parse(req.body); res.json(apiResponse(await OnboardingService.verify(data))); }
