import { Types } from 'mongoose';
import { normalizePhone } from '../auth/auth.service.js';
import { availableChannels } from '../auth/otp-policy.js';
import { User } from '../../database/models/User.js';
import { OrganizationMembership } from '../../database/models/OrganizationMembership.js';
import { Role } from '../../database/models/Role.js';
import { EntitlementService } from '../../core/billing/entitlement.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';

export class UserService {
  static async createInOrganization(auth: NonNullable<Express.Request['auth']>, organizationId: string, data: { phone:string; email?:string; firstName:string; lastName:string; roleIds:string[]; scope:{allProperties:boolean;propertyIds:string[];buildingIds:string[];unitIds:string[]} }) {
    AuthorizationService.assertCan(auth,'user.create',{organizationId});
    await EntitlementService.assertCapacity(organizationId, 'USERS');
    const roleCount = await Role.countDocuments({ _id:{$in:data.roleIds}, $or:[{organizationId:null,system:true},{organizationId:new Types.ObjectId(organizationId)}] });
    if (roleCount !== data.roleIds.length) throw new AppError(400,'INVALID_ROLES','One or more roles are not valid for this organization');
    data.phone = normalizePhone(data.phone);
    if (!(await availableChannels()).includes('SMS') && !data.email) throw new AppError(400, 'EMAIL_REQUIRED', 'An email address is required while SMS authentication is unavailable.');
    let user = await User.findOne({phone:data.phone});
    if (user) {
      const existing = await OrganizationMembership.findOne({userId:user._id,organizationId});
      if (existing && existing.status !== 'REMOVED') throw new AppError(409,'MEMBER_EXISTS','User is already a member of this organization');
    } else {
      user = await User.create({phone:data.phone,email:data.email,firstName:data.firstName,lastName:data.lastName});
    }
    await OrganizationMembership.findOneAndUpdate({userId:user._id,organizationId},{roleIds:data.roleIds,scope:data.scope,status:'ACTIVE',invitedBy:auth.userId,joinedAt:new Date()},{upsert:true,new:true,setDefaultsOnInsert:true});
    return User.findById(user._id).select('-__v');
  }

  static async updateInOrganization(auth: NonNullable<Express.Request['auth']>, organizationId: string, userId: string, data: {firstName?:string;lastName?:string;email?:string|null;status?:'ACTIVE'|'SUSPENDED'|'DEACTIVATED'}) {
    AuthorizationService.assertCan(auth,'user.update',{organizationId});
    const membership=await OrganizationMembership.findOne({userId,organizationId,status:{$ne:'REMOVED'}}); if(!membership) throw new AppError(404,'NOT_FOUND','Organization membership not found');
    if (await User.exists({ _id: userId, isPlatformAdmin: true })) throw new AppError(403, 'PROTECTED_ADMIN_ACCOUNT', 'Platform administrator accounts cannot be changed through organization user management.');
    if (data.email !== undefined) {
      const current = await User.findById(userId);
      if (!current) throw new AppError(404, 'NOT_FOUND', 'User not found');
      if (current.emailVerifiedAt && data.email !== current.email) throw new AppError(403, 'VERIFIED_CONTACT_PROTECTED', 'Verified authentication contacts require a secure account recovery workflow.');
      if (data.email !== current.email) {
        const changed = await User.findOneAndUpdate({ _id: userId, emailVerifiedAt: { $exists: false },
          ...(current.email ? { email: current.email } : { email: { $exists: false } }) },
          { $set: data, $unset: { emailVerifiedAt: 1 }, $inc: { authVersion: 1 } }, { new: true, runValidators: true }).select('-__v');
        if (!changed) throw new AppError(409, 'CONTACT_CHANGED', 'Contact verification changed; refresh and use the secure recovery workflow.');
        return changed;
      }
    }
    const user=await User.findByIdAndUpdate(userId,data,{new:true,runValidators:true}).select('-__v'); if(!user) throw new AppError(404,'NOT_FOUND','User not found'); return user;
  }
}
