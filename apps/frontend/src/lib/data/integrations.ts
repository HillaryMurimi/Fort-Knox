import { api } from '../api';

export type IntegrationProvider = 'MPESA'|'PAYSTACK'|'STRIPE'|'EMAIL'|'SMS'|'WHATSAPP'|'CLOUDINARY'|'S3'|'CCTV'|'NVR';
export interface IntegrationHealth { providers: Record<'mpesa'|'paystack'|'stripe'|'email'|'sms'|'whatsapp'|'cloudinary'|'s3'|'cctv'|'nvr', boolean> }
export type PaystackChannel='card'|'bank'|'apple_pay'|'ussd'|'qr'|'mobile_money'|'bank_transfer'|'eft'|'capitec_pay'|'payattitude';
export interface PaymentInitiateInput { provider:'MPESA'|'PAYSTACK'|'STRIPE'|'OTHER'; phone?:string; email?:string; paystackChannels?:PaystackChannel[] }
export interface ProviderPaymentResult { provider:string; providerTransactionId:string; status:string; checkoutRequestId?:string; checkoutUrl?:string; accessCode?:string; customerMessage?:string; amountMinorUnits?:number; currency?:string; paidAt?:string }
export interface StorageSignedUrlInput { provider:'CLOUDINARY'|'S3'|'OTHER'; key:string; expiresInSeconds?:number }
export interface StorageSignedUrlResult { storageKey:string; url?:string; expiresAt?:string }
export interface CctvHealth { status:'ONLINE'|'OFFLINE'|'DEGRADED'; lastSeenAt?:string }

export const integrationsClient = {
  health: () => api<IntegrationHealth>('/integrations/integrations/health'),
  initiatePayment: (paymentId:string,input:PaymentInitiateInput) => api<ProviderPaymentResult>(`/integrations/payments/${paymentId}/provider-initiate`,{method:'POST',body:JSON.stringify(input)}),
  reconcilePayment: (paymentId:string) => api<ProviderPaymentResult|null>(`/integrations/payments/${paymentId}/provider-reconcile`,{method:'POST'}),
  signedUrl: (organizationId:string,input:StorageSignedUrlInput) => api<StorageSignedUrlResult>(`/integrations/organizations/${organizationId}/storage/signed-url`,{method:'POST',body:JSON.stringify({expiresInSeconds:900,...input})}),
  cctvHealth: (organizationId:string,cameraId:string) => api<CctvHealth>(`/integrations/organizations/${organizationId}/cctv/provider-health?organizationId=${encodeURIComponent(organizationId)}&cameraId=${encodeURIComponent(cameraId)}`),
};
