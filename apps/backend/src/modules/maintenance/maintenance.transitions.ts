import { AppError } from "../../core/errors/AppError.js";
export const maintenanceActionSources = {
  TRIAGE: ["NEW", "TRIAGED"],
  ASSIGN: ["TRIAGED", "ASSIGNED", "QUOTED"],
  QUOTE: ["ASSIGNED", "QUOTED"],
  APPROVE_MAINTENANCE: ["APPROVAL_REQUIRED"],
  START_WORK: ["APPROVED", "IN_PROGRESS"],
  COMPLETE_REPAIR: ["IN_PROGRESS", "APPROVED"],
  VERIFY_REPAIR: ["COMPLETED"],
  CLOSE_REPAIR: ["VERIFIED"],
} as const;
export function assertMaintenanceTransition(
  status: string,
  action: keyof typeof maintenanceActionSources,
) {
  if (!(maintenanceActionSources[action] as readonly string[]).includes(status))
    throw new AppError(
      409,
      "INVALID_TRANSITION",
      "Maintenance is not ready for this action",
    );
}
