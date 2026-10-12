# Self-service change manifest

79 final repository files. Pre-existing .continue/ content is untouched and excluded. Temporary logs, screenshots, provider secrets and generated Next environment declarations are excluded.

| File                                                                        | Purpose                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/backend/.env.example`                                                 | Production default recovery OFF and safe configuration          |
| `apps/backend/package-lock.json`                                            | Dependencies and lockfile security patches                      |
| `apps/backend/scripts/create-sales-indexes.ts`                              | Index migration or isolated browser verification                |
| `apps/backend/scripts/serve-self-service-test.ts`                           | Index migration or isolated browser verification                |
| `apps/backend/src/config/env.ts`                                            | Production default recovery OFF and safe configuration          |
| `apps/backend/src/core/api/openapi.ts`                                      | API contract                                                    |
| `apps/backend/src/core/billing/entitlement.service.ts`                      | Transactional signed unit capacity                              |
| `apps/backend/src/core/integrations/dispatcher.ts`                          | Controlled event/notification recovery; OFF by default          |
| `apps/backend/src/database/models/AcquisitionJourney.ts`                    | Connected self-service journey                                  |
| `apps/backend/src/database/models/Organization.ts`                          | Additive private onboarding/milestone fields                    |
| `apps/backend/src/modules/audit/event-delivery.service.ts`                  | Controlled event/notification recovery; OFF by default          |
| `apps/backend/src/modules/auth/account-otp.service.ts`                      | Existing signup and verified owner email flow                   |
| `apps/backend/src/modules/auth/auth.schemas.ts`                             | Existing signup and verified owner email flow                   |
| `apps/backend/src/modules/auth/auth.service.ts`                             | Existing signup and verified owner email flow                   |
| `apps/backend/src/modules/billing/prepaid-billing.service.ts`               | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/jobs/job.service.ts`                              | Controlled event/notification recovery; OFF by default          |
| `apps/backend/src/modules/notifications/notification.service.ts`            | Controlled event/notification recovery; OFF by default          |
| `apps/backend/src/modules/onboarding/landlord-onboarding.openapi.ts`        | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/onboarding/landlord-onboarding.schemas.ts`        | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/onboarding/landlord-onboarding.service.ts`        | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/onboarding/onboarding-recovery.service.ts`        | Controlled event/notification recovery; OFF by default          |
| `apps/backend/src/modules/onboarding/portfolio-access.ts`                   | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/onboarding/portfolio-onboarding.controller.ts`    | Guided private paid portfolio setup and real-record progress    |
| `apps/backend/src/modules/onboarding/portfolio-onboarding.routes.ts`        | Guided private paid portfolio setup and real-record progress    |
| `apps/backend/src/modules/onboarding/portfolio-onboarding.schemas.ts`       | Guided private paid portfolio setup and real-record progress    |
| `apps/backend/src/modules/onboarding/portfolio-onboarding.service.ts`       | Guided private paid portfolio setup and real-record progress    |
| `apps/backend/src/modules/onboarding/self-service.openapi.ts`               | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/onboarding/verified-landlord.ts`                  | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/platform-control/platform-control.guard.ts`       | Existing agreement/payment handoff and inline documents         |
| `apps/backend/src/modules/properties/property-setup.service.ts`             | Transactional signed unit capacity                              |
| `apps/backend/src/modules/sales/acquisition-funnel.service.ts`              | Anonymous journey context or trusted admin conversion reporting |
| `apps/backend/src/modules/sales/acquisition.controller.ts`                  | Anonymous journey context or trusted admin conversion reporting |
| `apps/backend/src/modules/sales/acquisition.routes.ts`                      | Anonymous journey context or trusted admin conversion reporting |
| `apps/backend/src/modules/sales/acquisition.schemas.ts`                     | Anonymous journey context or trusted admin conversion reporting |
| `apps/backend/src/modules/sales/acquisition.service.ts`                     | Anonymous journey context or trusted admin conversion reporting |
| `apps/backend/src/modules/sales/pilot-import.service.ts`                    | Shared bounded import, validation, mapping and replay           |
| `apps/backend/src/modules/security/security.routes.ts`                      | Scope Fort Knox gates to security routes                        |
| `apps/backend/src/modules/units/unit.service.ts`                            | Transactional signed unit capacity                              |
| `apps/backend/src/routes/index.ts`                                          | Scoped router mounting                                          |
| `apps/backend/tests/e2e/landlord-onboarding.e2e.test.ts`                    | Regression, scope, import and journey coverage                  |
| `apps/backend/tests/e2e/sales-demo.e2e.test.ts`                             | Regression, scope, import and journey coverage                  |
| `apps/frontend/next.config.ts`                                              | Isolated browser fixture output/types                           |
| `apps/frontend/package-lock.json`                                           | Dependencies and lockfile security patches                      |
| `apps/frontend/package.json`                                                | Dependencies and lockfile security patches                      |
| `apps/frontend/scripts/public-visitor-fixture.mjs`                          | Index migration or isolated browser verification                |
| `apps/frontend/scripts/verify-self-service.mjs`                             | Index migration or isolated browser verification                |
| `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`                      | Actual-data first dashboard and meaningful visit marker         |
| `apps/frontend/src/app/(dashboard)/get-started/page.tsx`                    | Guided private paid portfolio setup and real-record progress    |
| `apps/frontend/src/app/onboarding/page.tsx`                                 | Existing agreement/payment handoff and inline documents         |
| `apps/frontend/src/app/page.tsx`                                            | Public landing/demo-to-plan handoff                             |
| `apps/frontend/src/app/plans/page.tsx`                                      | Public landing/demo-to-plan handoff                             |
| `apps/frontend/src/app/signup/page.tsx`                                     | Existing signup and verified owner email flow                   |
| `apps/frontend/src/components/landlords/first-portfolio.tsx`                | Actual-data first dashboard and meaningful visit marker         |
| `apps/frontend/src/components/marketing/acquisition-beacon.tsx`             | Anonymous journey context or trusted admin conversion reporting |
| `apps/frontend/src/components/marketing/cinematic-demo/demo-experience.tsx` | Public landing/demo-to-plan handoff                             |
| `apps/frontend/src/components/marketing/landing/story-sections.tsx`         | Public landing/demo-to-plan handoff                             |
| `apps/frontend/src/components/sales/acquisition-funnel.tsx`                 | Anonymous journey context or trusted admin conversion reporting |
| `apps/frontend/src/components/sales/sales-intelligence.tsx`                 | Existing admin sales screen self-service section                |
| `apps/frontend/src/lib/acquisition.ts`                                      | Anonymous journey context or trusted admin conversion reporting |
| `apps/frontend/src/lib/data/landlord-onboarding-ui.test.ts`                 | Regression, scope, import and journey coverage                  |
| `apps/frontend/src/lib/data/landlord-onboarding.ts`                         | Existing agreement/payment handoff and inline documents         |
| `apps/frontend/src/lib/data/pilot-import.ts`                                | Shared bounded import, validation, mapping and replay           |
| `apps/frontend/src/lib/data/portfolio-import.test.ts`                       | Regression, scope, import and journey coverage                  |
| `apps/frontend/src/lib/data/portfolio-import.ts`                            | Shared bounded import, validation, mapping and replay           |
| `apps/frontend/src/lib/data/portfolio-onboarding.ts`                        | Guided private paid portfolio setup and real-record progress    |
| `apps/frontend/src/lib/navigation.ts`                                       | Present the owner setup route with existing role boundaries     |
| `apps/frontend/src/lib/route-presentation.test.ts`                          | Regression, scope, import and journey coverage                  |
| `apps/frontend/src/types/organization.ts`                                   | Additive private onboarding/milestone fields                    |
| `apps/frontend/tsconfig.json`                                               | Isolated browser fixture output/types                           |
| `docker-compose.coolify.yml`                                                | Production default recovery OFF and safe configuration          |
| `docs/API_SPECIFICATION.md`                                                 | Canonical behavior, verification and deployment documentation   |
| `docs/CODEX_EXECUTION_TRACKER.md`                                           | Canonical behavior, verification and deployment documentation   |
| `docs/DATABASE_DESIGN.md`                                                   | Canonical behavior, verification and deployment documentation   |
| `docs/FEATURES.md`                                                          | Canonical behavior, verification and deployment documentation   |
| `docs/MASTER_CONTEXT.md`                                                    | Canonical behavior, verification and deployment documentation   |
| `docs/SECURITY.md`                                                          | Canonical behavior, verification and deployment documentation   |
| `docs/SELF_SERVICE_FILE_MANIFEST.md`                                        | Canonical behavior, verification and deployment documentation   |
| `docs/SELF_SERVICE_LANDLORD_ONBOARDING.md`                                  | Canonical behavior, verification and deployment documentation   |
| `docs/TESTING_STRATEGY.md`                                                  | Canonical behavior, verification and deployment documentation   |
