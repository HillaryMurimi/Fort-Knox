import { SalesIdentityMatch, SalesMergeRequest, SalesProjectionCheckpoint } from '../src/database/models/SalesIdentity.js';
import { AuditLog } from '../src/database/models/AuditLog.js';
import { DomainEvent } from '../src/database/models/DomainEvent.js';
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import {
  SalesDemoSession,
  SalesValueEvent,
} from "../src/database/models/SalesDemoSession.js";
import { Organization } from "../src/database/models/Organization.js";
import { AcquisitionJourney } from "../src/database/models/AcquisitionJourney.js";
import { SalesLead } from "../src/database/models/SalesLead.js";
import { SalesMeeting } from "../src/database/models/SalesMeeting.js";
import { SalesActivity } from "../src/database/models/SalesActivity.js";
import { SalesAgent, SalesAgentRun, SalesAgentApproval } from '../src/database/models/SalesAgent.js';
import { Job } from '../src/database/models/Job.js';
import { SalesCampaign, SalesTrackingLink, SalesAttribution } from '../src/database/models/SalesCampaign.js';
await connectDatabase();
try {
  for (const model of [SalesDemoSession, SalesValueEvent, AcquisitionJourney, SalesLead, SalesMeeting, SalesActivity, SalesAgent, SalesAgentRun, SalesAgentApproval, Job, SalesIdentityMatch, SalesMergeRequest, SalesProjectionCheckpoint, AuditLog, DomainEvent, SalesCampaign, SalesTrackingLink, SalesAttribution])
    await model.createIndexes();
  for (const [key, options] of Organization.schema.indexes())
    if (options.name?.startsWith("guided_pilot_"))
      await Organization.collection.createIndex(key, options);
  process.stdout.write(
    "Sales demo and guided pilot indexes initialized; existing indexes preserved\n",
  );
} finally {
  await disconnectDatabase();
}
