export type AreaKey = 'launch' | 'switches' | 'system' | 'onboarding' | 'queues' | 'notifications' | 'security';
export type MonitorStatus = 'HEALTHY' | 'NEEDS_ACTION' | 'BLOCKED' | 'NOT_CONFIGURED';
export interface MonitorMetric { key: string; label: string; value: number | string | null; source: string; window: string; }
export interface MonitorCondition { area: AreaKey; scope: string; code: string; title: string; severity: 'LOW' | 'HIGH' | 'CRITICAL'; value: number; firstAt: Date; lastAt: Date; owner?: string; }
export interface MonitorArea { key: AreaKey; title: string; status: MonitorStatus; metrics: MonitorMetric[]; conditions: MonitorCondition[]; notes: string[]; truncated: boolean; sourceAvailable: boolean; }
export const metric = (key: string, label: string, value: number | string | null, source: string, window = 'Current records'): MonitorMetric => ({ key, label, value, source, window });
export function area(key: AreaKey, title: string, metrics: MonitorMetric[], conditions: MonitorCondition[] = [], notes: string[] = [], truncated = false): MonitorArea {
  return { key, title, metrics, conditions, notes, truncated, sourceAvailable: true, status: conditions.some(item => item.severity === 'CRITICAL') ? 'BLOCKED' : conditions.length ? 'NEEDS_ACTION' : metrics.some(item => item.value === null) ? 'NOT_CONFIGURED' : 'HEALTHY' };
}
export const switchCoverage: Record<string, { coverage: 'PARTIAL' | 'NOT_ENFORCED'; boundaries: string; dependencies: string[]; limitation: string }> = {
  MPESA_PAYMENTS: { coverage: 'PARTIAL', boundaries: 'HTTP payment initiation', dependencies: [], limitation: 'Internal payment entry points are not fully gated; callbacks and reconciliation remain enabled.' },
  PAYSTACK_PAYMENTS: { coverage: 'PARTIAL', boundaries: 'HTTP payment initiation', dependencies: [], limitation: 'Internal billing checkout paths require further enforcement; callbacks/reconciliation remain enabled.' },
  EMAIL_NOTIFICATIONS: { coverage: 'PARTIAL', boundaries: 'SendGrid provider send', dependencies: [], limitation: 'Other providers/channels and delivery callbacks are not certified.' },
  SMS_NOTIFICATIONS: { coverage: 'PARTIAL', boundaries: 'Twilio provider send, including production OTP', dependencies: [], limitation: 'Turning this OFF can block administrator step-up. Recovery bypass is not implemented.' },
  WHATSAPP_NOTIFICATIONS: { coverage: 'PARTIAL', boundaries: 'Meta provider send', dependencies: [], limitation: 'Live provider acceptance remains outstanding.' },
  CCTV_GATEWAY: { coverage: 'PARTIAL', boundaries: 'Camera live/playback service and gateway adapter', dependencies: [], limitation: 'Existing streaming sessions are not revoked; session/download flows remain incomplete.' },
  NVR_GATEWAY: { coverage: 'PARTIAL', boundaries: 'NVR camera live/playback and gateway adapter', dependencies: [], limitation: 'Existing streaming sessions are not revoked; hardware acceptance remains outstanding.' },
  DOCUMENT_STORAGE: { coverage: 'PARTIAL', boundaries: 'HTTP signed URL route', dependencies: [], limitation: 'Direct uploads and internal storage calls still require enforcement.' },
  LANDLORD_ONBOARDING: { coverage: 'PARTIAL', boundaries: 'HTTP subscription and recovery checkout routes', dependencies: ['PAYSTACK_PAYMENTS'], limitation: 'Internal subscription calls and contract acceptance enforcement are incomplete.' },
  PROPERTY_SETUP_ASSISTANCE: { coverage: 'PARTIAL', boundaries: 'HTTP assistance request creation', dependencies: [], limitation: 'Full request-to-response workflow is not yet implemented.' },
  TENANT_OTP_LOGIN: { coverage: 'NOT_ENFORCED', boundaries: 'None', dependencies: ['SMS_NOTIFICATIONS'], limitation: 'Catalog entry has no tenant-specific enforcement; SMS transport has a separate switch.' },
  DECISION_INTELLIGENCE: { coverage: 'NOT_ENFORCED', boundaries: 'None', dependencies: [], limitation: 'Intelligence service/worker boundaries are not gated.' },
  DECISION_AUTOMATION: { coverage: 'NOT_ENFORCED', boundaries: 'None', dependencies: [], limitation: 'Automation service/worker boundaries are not gated.' },
};
