import {Router} from 'express'; import {requireAuth} from '../../middleware/auth.middleware.js'; import {asyncHandler} from '../../core/http/asyncHandler.js'; import * as c from './model-serving.controller.js';
export const modelServingRouter=Router(); modelServingRouter.use(requireAuth);
modelServingRouter.get('/organizations/:organizationId/model-serving/policy',asyncHandler(c.policy)); modelServingRouter.patch('/organizations/:organizationId/model-serving/policy',asyncHandler(c.updatePolicy));
modelServingRouter.post('/organizations/:organizationId/model-serving/deploy',asyncHandler(c.deploy)); modelServingRouter.post('/organizations/:organizationId/model-serving/rollback',asyncHandler(c.rollback));
modelServingRouter.get('/organizations/:organizationId/model-serving/deployments',asyncHandler(c.deployments)); modelServingRouter.post('/organizations/:organizationId/model-serving/monitor',asyncHandler(c.monitor)); modelServingRouter.get('/organizations/:organizationId/model-serving/monitoring',asyncHandler(c.monitoring));

modelServingRouter.post('/organizations/:organizationId/model-serving/approvals',asyncHandler(c.requestApproval));
modelServingRouter.get('/organizations/:organizationId/model-serving/approvals',asyncHandler(c.approvals));
modelServingRouter.patch('/model-serving/approvals/:approvalId',asyncHandler(c.decideApproval));
modelServingRouter.get('/organizations/:organizationId/model-serving/incidents',asyncHandler(c.incidents));
modelServingRouter.patch('/model-serving/incidents/:incidentId',asyncHandler(c.updateIncident));
