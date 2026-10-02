export type OnboardingStatus = 'NOT_STARTED' | 'AWAITING_DOCUMENTS' | 'SUBMITTED' | 'APPROVED';
export type StagingStatus = 'NOT_TESTED' | 'PASSED' | 'FAILED' | 'NOT_APPLICABLE';
export type BlockerSeverity = 'NONE' | 'LOW' | 'HIGH' | 'CRITICAL';
export interface ReadinessReviewInput {
  expectedRevision: number;
  onboarding: OnboardingStatus;
  staging: StagingStatus;
  responsibleOwner: string;
  targetDate: string | null;
  nextAction: string;
  blocker: string;
  severity: BlockerSeverity;
  verificationNote: string;
}
export interface LaunchReadinessItem extends Omit<ReadinessReviewInput, 'expectedRevision'> {
  key: string; name: string; group: string; needsStaging: boolean; optional: boolean; revision: number;
  configuration: 'MISSING' | 'PARTIAL' | 'CONFIGURED' | 'NOT_APPLICABLE';
  verifiedAt: string | null; modifiedBy: string | null; updatedAt: string | null; issues: string[]; ready: boolean;
}
export interface LaunchReadinessResponse {
  environment: string; generatedAt: string; items: LaunchReadinessItem[];
  summary: { total: number; ready: number; blockers: number; unassigned: number };
}
export function reviewInput(item: LaunchReadinessItem): ReadinessReviewInput {
  return { expectedRevision: item.revision, onboarding: item.onboarding, staging: item.staging, responsibleOwner: item.responsibleOwner,
    targetDate: item.targetDate, nextAction: item.nextAction, blocker: item.blocker, severity: item.severity, verificationNote: item.verificationNote };
}
