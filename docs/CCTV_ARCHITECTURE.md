# Property Management Command Center --- CCTV Architecture

## 1. Objective

Integrate property surveillance into PMCC as an authorized, auditable
security capability without exposing camera infrastructure directly to
browsers.

Target ecosystems: - Hikvision. - Dahua. - ONVIF-compatible
cameras/NVRs. - Future vendor-specific adapters.

## 2. Non-Negotiable Rule

Do not design the browser around raw RTSP playback.

Conceptual architecture:

``` text
Camera / NVR
     │
     │ RTSP / vendor protocol / ONVIF
     ▼
Private network / secure connector
     │
     ▼
Streaming Gateway
     │
     ├── WebRTC for low-latency live view
     └── HLS or provider-compatible playback where appropriate
     │
     ▼
PMCC authenticated client
```

Control plane:

``` text
React Client
   ↓
PMCC API
   ↓
Authorization + camera scope + entitlement + step-up policy
   ↓
StreamingProvider
   ↓
Short-lived stream/playback session
```

The PMCC API should authorize sessions, not proxy every video byte
unless deliberately designed to do so.

## 3. Camera Registry

Each camera should include: - Organization. - Property. - Building. -
Name/location. - Provider. - Provider camera ID. - NVR/gateway
reference. - Capability flags. - Health/status. - Sensitivity
classification. - Enabled/disabled. - Timestamps.

Secrets belong in a secret manager or encrypted integration store, not
normal camera documents.

## 4. Provider Interfaces

``` ts
interface StreamingProvider {
  createLiveSession(input: LiveSessionInput): Promise<StreamSession>;
  createPlaybackSession(input: PlaybackInput): Promise<StreamSession>;
  createEvidenceExport(input: EvidenceExportInput): Promise<EvidenceExport>;
  getCameraHealth(cameraRef: CameraRef): Promise<CameraHealth>;
}
```

Vendor-specific integration:

``` text
StreamingProvider
├── GenericGatewayProvider
├── HikvisionAdapter
├── DahuaAdapter
└── OnvifAdapter
```

Separate device discovery/control from browser streaming if those
concerns require different infrastructure.

## 5. Authorization

Before creating any stream: 1. Authenticate user. 2. Confirm
account/session active. 3. Confirm organization membership. 4. Confirm
`cctv.view` or relevant action permission. 5. Confirm
property/building/camera scope. 6. Confirm Fort Knox/security
entitlement. 7. Confirm camera enabled. 8. Check step-up requirement. 9.
Create short-lived stream session. 10. Audit outcome.

Playback and export may require stronger permissions than live viewing.

## 6. Landlord Experience

Potential: - Camera grid. - Property/building filters. - Live view. -
Camera health. - Motion/security event timeline. - Playback. - Incident
linkage. - Evidence export. - Security alerts.

## 7. Caretaker Experience

Default: - Only assigned building/property. - Only explicitly permitted
cameras. - Live view if permitted. - Event acknowledgement if
permitted. - No unrestricted export. - No unrelated buildings.

## 8. Security Event Ingestion

``` text
Camera/NVR/vendor
   ↓
Webhook / connector
   ↓
Signature/source verification
   ↓
Provider adapter
   ↓
Normalized SecurityEvent
   ↓
Deduplication
   ↓
Persistence
   ↓
Domain event
   ├── notifications
   ├── dashboard
   └── incident workflow
```

Normalized fields: - Organization/property/building/camera. - Provider
event ID. - Type. - Severity. - Occurred time. - Received time. -
Snapshot/clip reference. - Provider metadata. - Status.

## 9. Incident Workflow

`OPEN → INVESTIGATING → ESCALATED → RESOLVED → CLOSED`

Incident can link: - Multiple security events. - Cameras. - Evidence. -
Users/staff. - Notes. - Maintenance request if physical repair is
required. - Resolution.

## 10. Evidence

Do not treat a vendor URL as durable evidence.

When evidence preservation is authorized: - Copy/export through
controlled backend/gateway workflow. - Store in approved storage. -
Compute checksum where appropriate. - Record source and timestamps. -
Apply retention. - Restrict access. - Audit download/export.

## 11. CCTV Access Audit

Example:

``` text
actorUserId
membershipId
organizationId
propertyId
buildingId
cameraId
action = VIEW_LIVE | VIEW_PLAYBACK | EXPORT_EVIDENCE | MANAGE_CAMERA
outcome = SUCCESS | DENIED | ERROR
sessionId
requestId
timestamp
reason/purpose if required
```

## 12. Step-Up Authentication

Examples requiring recent stronger assurance: - Evidence export. -
Sensitive camera groups. - Long historical playback. - Camera
configuration. - Sharing evidence.

The server validates the assurance state; the frontend cannot
self-assert it.

## 13. Network Security

Prefer: - Cameras/NVRs not directly exposed to public internet. -
VPN/private connector/site gateway. - Firewall allowlists. - Rotated
credentials. - Segmented camera network. - TLS for control/API paths. -
Restricted gateway credentials.

## 14. Resilience

Handle: - Camera offline. - NVR offline. - Gateway unavailable. - Stream
creation failure. - Event webhook retries. - Duplicate events. - Clock
skew. - Storage failure.

UI should show clear degraded states rather than fake "online" data.

## 15. Privacy

CCTV access must be purpose-limited, role-scoped, and auditable.
Deployment must account for applicable surveillance, employment, tenant,
privacy, signage/notice, retention, and disclosure requirements.

PMCC should provide technical controls; customers remain responsible for
lawful deployment and policy configuration.

### Registration availability

New camera records default to OFFLINE. Registration alone does not prove provider connectivity. The landlord setup form accepts a gateway camera identifier, not camera credentials or a raw RTSP URL.
