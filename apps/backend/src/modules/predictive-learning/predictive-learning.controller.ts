import type { Request, Response } from 'express';
import { apiResponse } from '../../core/response/apiResponse.js';
import { requiredParam } from '../../core/http/params.js';
import * as S from './predictive-learning.schemas.js';
import { PredictiveLearningService } from './predictive-learning.service.js';

export const label = async (req: Request, res: Response) =>
  res.json(
    apiResponse(
      await PredictiveLearningService.label(
        req.auth!,
        requiredParam(req.params.organizationId, 'organizationId'),
        S.learnSchema.parse(req.body)
      )
    )
  );

export const train = async (req: Request, res: Response) =>
  res.status(201).json(
    apiResponse(
      await PredictiveLearningService.train(
        req.auth!,
        requiredParam(req.params.organizationId, 'organizationId'),
        S.learnSchema.parse(req.body)
      )
    )
  );

export const models = async (req: Request, res: Response) =>
  res.json(
    apiResponse(
      await PredictiveLearningService.listModels(
        req.auth!,
        requiredParam(req.params.organizationId, 'organizationId'),
        S.modelQuerySchema.parse(req.query)
      )
    )
  );

export const predict = async (req: Request, res: Response) =>
  res.json(
    apiResponse(
      await PredictiveLearningService.predict(
        req.auth!,
        requiredParam(req.params.organizationId, 'organizationId'),
        S.predictionSchema.parse(req.body)
      )
    )
  );

export const promote = async (req: Request, res: Response) =>
  res.json(
    apiResponse(
      await PredictiveLearningService.promote(
        req.auth!,
        requiredParam(req.params.organizationId, 'organizationId'),
        S.promoteSchema.parse(req.body).modelId
      )
    )
  );