import { Types } from 'mongoose';
import { Property } from '../../database/models/Property.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { EntitlementService } from '../../core/billing/entitlement.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CreatePropertyInput, UpdatePropertyInput } from './property.schemas.js';

export class PropertyService {
  static async list(auth: AuthenticatedUser, organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const ids = await ResourceScopeService.scopedPropertyIds(auth, orgId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (ids) filter._id = { $in: ids };
    return Property.find(filter).sort({ name: 1 }).lean();
  }

  static async get(auth: AuthenticatedUser, propertyId: string) {
    const property = await Property.findById(propertyId);
    if (!property) throw new AppError(404, 'NOT_FOUND', 'Property not found');
    await ResourceScopeService.assertProperty(auth, property);
    return property;
  }

  static async create(auth: AuthenticatedUser, organizationId: string, data: CreatePropertyInput) {
    const orgId = new Types.ObjectId(organizationId);
    AuthorizationService.assertCan(auth, 'property.create', { organizationId: orgId });
    await EntitlementService.assertCapacity(organizationId, 'PROPERTIES');
    const property = await Property.create({ ...data, organizationId: orgId, createdBy: auth.userId, updatedBy: auth.userId });
    return property;
  }

  static async update(auth: AuthenticatedUser, propertyId: string, data: UpdatePropertyInput) {
    const property = await Property.findById(propertyId);
    if (!property) throw new AppError(404, 'NOT_FOUND', 'Property not found');
    AuthorizationService.assertCan(auth, 'property.update', { organizationId: property.organizationId, propertyId: property._id });
    Object.assign(property, data, { updatedBy: auth.userId });
    await property.save();
    return property;
  }

  static async remove(auth: AuthenticatedUser, propertyId: string) {
    const property = await Property.findById(propertyId);
    if (!property) throw new AppError(404, 'NOT_FOUND', 'Property not found');
    AuthorizationService.assertCan(auth, 'property.delete', { organizationId: property.organizationId, propertyId: property._id });
    property.status = 'ARCHIVED';
    property.updatedBy = auth.userId;
    await property.save();
    return property;
  }
}
