import type { Request, Response } from 'express';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { apiResponse } from '../../core/response/apiResponse.js';
import { switchKeySchema, updateSwitchSchema } from './platform-control.schemas.js';
import { PlatformControlService } from './platform-control.service.js';
import { PlatformMonitoringService } from './platform-monitoring.service.js';
import { LaunchReadinessService } from './launch-readiness.service.js';
import { updateReadinessSchema } from './launch-readiness.schemas.js';

export async function list(req: Request, res: Response): Promise<void> {
  AuthorizationService.assertPlatformAdmin(req.auth!);
  res.json(apiResponse(await PlatformControlService.list()));
}

export async function update(req: Request, res: Response): Promise<void> {
  AuthorizationService.assertPlatformAdmin(req.auth!);
  const { key } = switchKeySchema.parse({ key: requiredParam(req.params.key, 'key') });
  const input = updateSwitchSchema.parse(req.body);
  res.json(apiResponse(await PlatformControlService.update(req.auth!, key, input)));
}
export async function launchReadiness(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await LaunchReadinessService.list(req.auth!)));
}
export async function updateLaunchReadiness(req: Request, res: Response): Promise<void> {
  AuthorizationService.assertPlatformAdmin(req.auth!);
  const key = requiredParam(req.params.key, 'key');
  res.json(apiResponse(await LaunchReadinessService.update(req.auth!, key, updateReadinessSchema.parse(req.body))));
}

export async function monitoringOverview(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await PlatformMonitoringService.overview(req.auth!)));
}
export async function monitoringAlerts(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await PlatformMonitoringService.listAlerts(req.auth!, req.query)));
}
export async function monitoringHistory(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await PlatformMonitoringService.history(req.auth!, requiredParam(req.params.id, 'id'), req.query)));
}
export async function monitoringReview(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await PlatformMonitoringService.review(req.auth!, requiredParam(req.params.id, 'id'), req.body)));
}
export async function monitoringWindows(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await PlatformMonitoringService.windows(req.auth!)));
}
export async function monitoringCreateWindow(req: Request, res: Response): Promise<void> {
  res.status(201).json(apiResponse(await PlatformMonitoringService.createWindow(req.auth!, req.body)));
}
export async function monitoringEndWindow(req: Request, res: Response): Promise<void> {
  res.json(apiResponse(await PlatformMonitoringService.endWindow(req.auth!, requiredParam(req.params.id, 'id'))));
}
