import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { SalesLead } from '../../database/models/SalesLead.js';
import { PropertyOnboardingRequest } from '../../database/models/PropertyOnboardingRequest.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { DemoRequestInput, PropertyOnboardingRequestInput } from './sales.schemas.js';

const reference = (prefix: string) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

export class SalesService {
  static async requestDemo(input: DemoRequestInput) {
    const lead = await SalesLead.create({
      ...input,
      reference: reference('DEMO'),
      source: input.source ?? 'Website',
      stage: 'Contact Established',
      leadStatus: 'New',
      nextAction: 'Schedule demo',
      nextActionDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      crm: { pipeline: 'Website → Demo → Contract → Invoice → Payment → Onboarding → Live', spreadsheetTab: 'Leads', gmailFollowUp: true, driveFolder: 'Sales / Demo Requests' },
    });
    return { status: 'submitted', reference: lead.reference, stage: lead.stage, nextAction: lead.nextAction, createdAt: lead.createdAt };
  }

  static async requestPropertyOnboarding(auth: AuthenticatedUser, organizationId: string, input: PropertyOnboardingRequestInput) {
    const request = await PropertyOnboardingRequest.create({
      organizationId: new Types.ObjectId(organizationId),
      requestedBy: auth.userId,
      ...input,
      crm: { spreadsheetTab: 'Activities', activityType: 'Onboarding', leadStage: 'Onboarding Scheduled', gmailFollowUp: true, driveFolder: `Customer Onboarding/${organizationId}` },
    });
    return { requestId: request._id, status: request.status, requestedAt: request.createdAt, message: 'Your property onboarding request has been received. Our team will confirm the setup session.' };
  }
}