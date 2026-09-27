# Paystack Billing Staging Acceptance

Run this against a disposable staging organization and a Paystack **test-mode** merchant account. Do not enter card data into PMCC or commit any key. The backend must have `PAYSTACK_SECRET_KEY=sk_test_...`, `WEB_ORIGIN` pointing at the staging frontend, a public HTTPS API, and a registered Paystack webhook at `/api/v1/integrations/webhooks/PAYSTACK`. Use a merchant-supported currency. Keep the API and jobs worker running throughout.

Record the organization ID, plan keys, checkout references, Paystack event IDs, invoice IDs, request IDs, timestamps and observed statuses in the staging test record. Do not record card numbers, email tokens or secret keys.

## Checkout

1. As the staging landlord, select a positive-price plan in `/billing`. Confirm that the API returns `PENDING` and an HTTPS `checkout.paystack.com` URL, while entitlements remain unavailable.
2. Complete the hosted checkout with a Paystack test card. Confirm Paystack delivers a signed `charge.success` to the registered endpoint. The organization should become `ACTIVE` only after the webhook or an authenticated recovery verification, with one `PAID` invoice for the exact amount and currency.
3. Resend the same webhook from Paystack. Confirm that invoice count, amount paid and period dates do not change. Send a request with an invalid signature and confirm HTTP 401 and no accounting changes.
4. Create a second disposable pending checkout but leave it unpaid. Press **Check payment / retry**. A pending provider transaction must return the same checkout URL and must not grant entitlements. Use a provider-reported failed/abandoned transaction to retry; confirm a new reference on the same Paystack plan and the old reference retained for late-payment investigation.

## Plan Change And Renewal

1. With an active subscription, select another plan. Confirm Paystack updated this organization's dedicated provider plan, `pendingPlanId` is set, and current entitlements stay unchanged. Another organization's plan must not change.
2. Wait for a **real Paystack test-mode renewal charge**. Confirm the signed `charge.success` or paid `invoice.update` has the expected new minor-unit amount and currency. Only then should the local plan change, the new period begin and a separate paid invoice appear. An event with a mismatched amount/currency must fail without changing entitlements.
3. Confirm a failed renewal moves the subscription to `PAST_DUE` and blocks paid entitlements. Do not mark this test passed by replaying the initial checkout event or altering the database clock. Paystack's normal plan intervals may make this a long-running staging observation.

## Cancellation

1. Cancel an active subscription at period end. Confirm Paystack receives `subscription/disable`, PMCC shows the scheduled end, and access continues only through the already paid period. Check that the email token is absent from every API response and log.
2. At the paid-through boundary, confirm access stops and the status becomes `CANCELLED`. Repeat with a separate disposable organization and immediate cancellation; access must stop immediately. Verify duplicate cancellation requests do not create another charge.
3. Compare PMCC invoices, Paystack transactions and settlement reports. Investigate any charge after cancellation or a second charge for the same initial invoice before approving launch.

**Pass gate:** all three sections have provider event/transaction evidence and matching PMCC records. Contract tests and mocked webhooks are useful but do not satisfy this live staging gate.
