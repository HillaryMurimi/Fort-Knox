# Property Management Command Center --- Roles, Permissions, and Scope

## 1. Authorization Rule

Every protected action must be authorized on the server.

Decision model:

``` text
authenticated
AND account active
AND organization membership valid
AND role/permission permits action
AND requested resource is inside authorized scope
AND ownership/relationship rule passes where applicable
AND organization feature entitlement is active
AND resource/business state permits action
AND step-up authentication is satisfied when required
```

A React route guard or hidden button is UX only.

## 2. Roles

### Super Admin

Platform operations across organizations. Not exempt from audit
controls.

### Landlord / Owner

Organization/portfolio owner with broad access inside authorized
organization(s).

The landlord command center may expose scoped portfolio analytics, maintenance
quote approval and completion verification, expense approval, payment settlement
destinations, billing posture, notifications, and resident-facing contact
settings. These controls are UX entry points only: every mutation remains subject
to its backend permission, organization scope, resource state, and audit policy.

### Property Manager

Operational manager limited to assigned organization/property scope and
explicit permissions.

### Caretaker

On-site operator limited to assigned property/building scope.

### Contractor

External worker limited to assigned jobs and data required to perform
them.

### Tenant

End user limited to own tenancy, unit, payments, maintenance, documents,
and relevant announcements.

## 3. Permission Namespace

Recommended convention:

`<resource>.<action>`

Core permissions:

``` text
organization.view
organization.update
organization.settings.manage
organization.manage_members

property.view
property.create
property.update
property.archive
property.assign_staff

building.view
building.create
building.update
building.archive
building.assign_staff

unit.view
unit.create
unit.update
unit.archive
unit.assign

tenant.view
tenant.create
tenant.update
tenant.offboard
tenant.approve_access

tenancy.view
tenancy.create
tenancy.update
tenancy.activate
tenancy.end

rent.view
rent.manage
rent.approve
rent.export

payment.view
payment.record
payment.reconcile
payment.refund

expense.view
expense.create
expense.update
expense.approve
expense.pay

maintenance.view
maintenance.create
maintenance.triage
maintenance.assign
maintenance.quote
maintenance.approve
maintenance.update
maintenance.verify
maintenance.close

contractor.view
contractor.create
contractor.update
contractor.assign
contractor.rate

inspection.view
inspection.create
inspection.complete

document.view
document.upload
document.download
document.delete

cctv.view
cctv.playback
cctv.download
cctv.manage

security_event.view
security_event.acknowledge
security_event.escalate

incident.view
incident.create
incident.update
incident.escalate
incident.resolve
incident.close

announcement.view
announcement.create
announcement.manage

financial.view
financial.manage
financial.export

report.view
report.export

audit.view

staff.view
staff.manage

subscription.view
subscription.manage

feature_flag.view
feature_flag.manage

admin.platform
```

## 4. Default Role Matrix

Legend: ✓ default capability; Scoped = capability only within
assignment/ownership; --- = denied by default.

  ----------------------------------------------------------------------------------------------------
  Capability      Super      Landlord     Manager        Caretaker             Contractor   Tenant
                  Admin                                                                     
  --------------- ---------- ------------ -------------- --------------------- ------------ ----------
  Platform admin  ✓          ---          ---            ---                   ---          ---

  Organization    ✓          ✓            Scoped         ---                   ---          ---
  settings                                                                                  

  Property        ✓          ✓            Scoped         Scoped                Job context  Own
  portfolio                                                                                 tenancy
                                                                                            context

  Property CRUD   ✓          ✓            Scoped         ---                   ---          ---

  Unit management ✓          ✓            Scoped         Scoped limited        ---          ---

  Tenant          ✓          ✓            Scoped         Scoped limited        ---          Own
  management                                                                                profile
                                                                                            only

  Tenancy         ✓          ✓            Scoped         Scoped limited        ---          Own view
  management                                                                                

  Full financial  ✓          ✓            Configurable   ---                   ---          ---
  dashboard                                                                                 

  Own             ✓          ✓            Scoped         Configurable minimal  ---          ✓
  rent/payments                                                                             

  Expense         ✓          ✓            Scoped         Scoped/configurable   ---          ---
  creation                                                                                  

  Expense         ✓          ✓            Configurable   Threshold only        ---          ---
  approval                                                                                  

  Maintenance     ✓          ✓            Scoped         Scoped                Assigned job Own unit
  create                                                                       updates      

  Maintenance     ✓          ✓            Scoped         Scoped/configurable   ---          ---
  assign                                                                                    

  Maintenance     ✓          ✓            Configurable   Threshold only        ---          ---
  approval                                                                                  

  Contractor jobs ✓          ✓            Scoped         Scoped                Assigned     ---
                                                                               only         

  CCTV live       ✓          Entitled     Explicit       Explicit scoped       ---          ---

  CCTV playback   ✓          Entitled     Explicit       Explicit scoped       ---          ---

  CCTV download   ✓          Explicit +   Explicit +     Usually ---           ---          ---
                             step-up      step-up                                           

  Security        ✓          ✓            Scoped         Scoped                Assigned     Own
  incidents                                                                    only if      reports
                                                                               needed       only

  Audit logs      ✓          ✓ scoped     Explicit       Own activity only if  ---          ---
                                          scoped         exposed                            

  Reports         ✓          ✓            Scoped         Limited               Own jobs     Own
                                                                                            records

  Staff           ✓          ✓            Explicit       ---                   ---          ---
  management                                                                                
  ----------------------------------------------------------------------------------------------------

This table defines defaults, not hard-coded invariants. Organization
policies may grant/restrict within safe platform boundaries.

### Contractor maintenance boundaries

- A contractor may list and open only maintenance assigned to the authenticated user's active Contractor profile (or directly to that user).
- Contractors may submit a quote, start approved work, upload scoped photo/video evidence, and submit completion notes and actual cost.
- Quote submission never authorizes work; approval remains a management control.
- Completion never self-verifies the repair. Verification and closure remain independent tenant/authorized-staff actions.
- Property, building, floor, unit, document, and evidence visibility remains limited to the assigned job context.

### Property manager workspace boundaries

- The manager home aggregates only records returned by organization and property-scoped APIs; it does not broaden membership scope in the client.
- Managers may triage and assign maintenance, approve quotes, independently verify completion, and close verified requests when their backend permissions allow each transition.
- Expense approval, tenancy activation, arrears follow-up, security acknowledgement, and inspection completion remain separate audited backend commands.
- Financial totals, tenant records, contractors, security events, and property health remain limited to assigned properties unless a broader organization scope is explicitly granted.
- Frontend queue counts and hidden controls are presentation aids only. Backend RBAC + ABAC remains authoritative for every command.

## 5. Scope Model

A principal can carry assignments such as:

``` ts
type AccessScope = {
  organizationIds: string[];
  propertyIds: string[];
  buildingIds: string[];
  unitIds?: string[];
  jobIds?: string[];
};
```

Do not rely exclusively on a token snapshot for long-lived authorization
if assignments can change. Critical operations should resolve current
authorization state or use appropriately short-lived/cache-invalidated
authorization data.

## 6. Tenant Ownership Rules

A tenant may: - View their own active tenancy and allowed historical
tenancy. - View own charges/payments/receipts. - Create maintenance for
own active unit. - View own maintenance. - View documents explicitly
assigned to them. - View announcements targeted to their scope.

A tenant may not: - Supply another tenant ID to access records. - Change
their assigned unit. - Query another unit's payments/maintenance. -
Enumerate organization users. - Access CCTV unless a future explicit
product feature is designed.

## 7. Caretaker Rules

Caretaker queries must include assignment scope. A caretaker cannot gain
access by guessing IDs.

Default denied: - Portfolio-wide P&L. - Unassigned
properties/buildings. - Landlord-only reports. - Unrestricted rent
balances. - CCTV outside assigned scope. - CCTV download unless
explicitly granted. - Role/permission management.

Spending authority is policy-driven and can include a monetary ceiling.

The caretaker workspace exposes only assigned-site operations: building and
unit status, resident occupancy references, maintenance intake and controlled
field transitions, evidence capture, inspections, incidents, scoped security
signals, contractor contacts, inventory/service records, and personal
notifications. Quotes above the maintenance policy threshold remain pending for
an authorized manager or owner. Caretakers do not receive expense approval,
portfolio reporting, organization settings, role administration, CCTV playback,
or evidence export controls by default.

Security records are filtered at their most specific stored hierarchy. A
unit-level record must match an assigned unit, a building-level record must
match an assigned building, and a property-level record must match an assigned
property. Having one assigned building does not expose records belonging to a
different building on the same property.

## 8. Contractor Rules

Contractor access is job-centric: - Assigned work order. - Minimum
property/unit location necessary for work. - Quote/invoice. - Work
evidence. - Job conversation.

Do not expose unrelated tenant financial data or portfolio information.

## 9. CCTV Step-Up

Policy may require recent step-up authentication for: - Playback beyond
a configured age. - Evidence download. - Camera administration. -
Sharing/export. - Highly sensitive camera groups.

Store `stepUpVerifiedAt` or equivalent session assurance data
server-side.

## 10. Authorization Tests

At minimum: - Tenant A cannot access Tenant B. - Tenant cannot change
unit association. - Caretaker A cannot access Building B. - Caretaker
cannot access landlord financials by direct API request. - Contractor
cannot access unassigned jobs. - Landlord A cannot access Landlord B
organization. - Manager cannot exceed assigned property scope. - CCTV
unauthorized live/playback/download is rejected. - Removing an
assignment revokes subsequent access. - Feature entitlement denial works
independently from RBAC. - Frontend tampering cannot bypass API
authorization.
