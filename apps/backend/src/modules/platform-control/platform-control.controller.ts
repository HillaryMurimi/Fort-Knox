import type { Request, Response } from 'express';
import { requiredParam } from '../../core/http/params.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { apiResponse } from '../../core/response/apiResponse.js';
import { switchKeySchema, updateSwitchSchema } from './platform-control.schemas.js';
import { PlatformControlService } from './platform-control.service.js';

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