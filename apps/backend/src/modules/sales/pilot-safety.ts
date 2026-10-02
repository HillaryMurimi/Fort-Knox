import { Organization } from "../../database/models/Organization.js";
import { AppError } from "../../core/errors/AppError.js";
export async function assertOperationalIntegrationAllowed(
  organizationId: unknown,
) {
  const org = await Organization.findById(organizationId)
    .select("guidedPilot onboarding settings.platformDemoDataset")
    .lean();
  if (!org)
    throw new AppError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization must exist before an operational integration",
    );
  if (org?.settings?.platformDemoDataset)
    throw new AppError(
      403,
      "DEMO_INTEGRATION_BLOCKED",
      "Demo organizations cannot invoke production integrations",
    );
  if (org?.guidedPilot && org.onboarding?.state !== "ACTIVE")
    throw new AppError(
      403,
      "PILOT_INTEGRATION_BLOCKED",
      "Operational external integrations remain disabled until verified commercial activation",
    );
}
