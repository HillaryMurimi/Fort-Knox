import { PRODUCT_NAME } from '../../config/brand.js';
// A starting draft for commercial/legal review. Never published automatically.
export const defaultContractDraft = {
  templateId: 'PMCC_SERVICES', name: `${PRODUCT_NAME} Property Command Center Services Agreement`, version: 1,
  plans: ['CONTROL', 'FORT_KNOX'],
  body: `SERVICES AGREEMENT

Organization: {{legalName}}
Application organization ID: {{organizationId}}
Legal identifier: {{legalIdentifier}}
Landlord account: {{landlordName}}
Agreement effective date: {{effectiveDate}}

1. Services and portfolio
The organization subscribes to {{planName}} ({{planKey}}) for a declared portfolio of {{unitCount}} units. Access includes the capabilities and limits of the selected plan. Hardware and installation: {{hardwareTerms}}

2. Price and initial commitment
The monthly equivalent subscription price is {{currency}} {{monthlyPrice}}. The initial commitment is {{prepaidMonths}} months, payable upfront in the amount of {{currency}} {{initialAmount}}. The invoice records the contracted price and unit calculation. No trial replaces this prepaid commitment.

3. Payment and activation
The contract must be reviewed and signed before checkout. Opening checkout or reporting a successful payment does not activate access. Activation requires a verified provider payment matching the organization's invoice. The prepaid access term begins on verified payment; the invoice service dates identify the commercial term quoted at issue and the receipt records the actual activation access dates.

4. Subsequent billing and cancellation
After the prepaid access term, billing follows the {{billingCycle}} cycle at the contracted price unless an audited plan change takes effect at a paid renewal. The first recurring debit is scheduled after the prepaid term ends. Cancellation through subscription controls ends renewal according to the paid-term cancellation setting. Refunds and disputed or duplicate payments require provider reconciliation and recorded review.

5. Electronic agreement and records
The authorized signatory confirms authority, accepts these terms and consents to use their typed name as an electronic signature. The application retains this version, commercial snapshot, agreement hash, signer identity, timestamp and acceptance evidence. Signed agreements and historical invoices cannot be silently edited. Corrections use an explicit replacement or amendment and preserve the original record.

6. Organization responsibilities
The organization supplies accurate legal and portfolio details, manages authorized access and uses the service for lawful property operations. Personal data, evidence and security access remain subject to organization permissions and the applicable published privacy and service policies. This draft requires review of those policies and all commercial/legal terms before publication.`,
};
