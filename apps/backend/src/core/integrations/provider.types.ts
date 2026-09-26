export type PaymentProviderKey = 'MPESA' | 'PAYSTACK' | 'STRIPE' | 'OTHER';
export type PaystackChannel = 'card' | 'bank' | 'apple_pay' | 'ussd' | 'qr' | 'mobile_money' | 'bank_transfer' | 'eft' | 'capitec_pay' | 'payattitude';
export type ProviderKey = PaymentProviderKey | 'SMTP' | 'SENDGRID' | 'TWILIO' | 'WHATSAPP_CLOUD' | 'CLOUDINARY' | 'S3' | 'GENERIC_CCTV' | 'NVR_HTTP';

export interface PaymentInitiationInput { organizationId:string; paymentId?:string; amount:number; currency:string; phone?:string; email?:string; reference:string; description?:string; callbackUrl?:string; metadata?:Record<string,unknown>; paystackChannels?:PaystackChannel[]; paystackSubaccountCode?:string; }
export interface PaymentInitiationResult { provider:string; providerTransactionId:string; status:'PENDING'|'CONFIRMED'|'FAILED'; checkoutRequestId?:string; checkoutUrl?:string; accessCode?:string; customerMessage?:string; amountMinorUnits?:number; currency?:string; paidAt?:Date; raw?:unknown; }
export interface PaymentProvider { readonly key:PaymentProviderKey; initiate(input:PaymentInitiationInput):Promise<PaymentInitiationResult>; query(providerTransactionId:string):Promise<PaymentInitiationResult>; }

export interface MessageInput { to:string; subject?:string; body:string; from?:string; metadata?:Record<string,unknown>; }
export interface MessageResult { provider:string; providerMessageId:string; status:'QUEUED'|'SENT'|'DELIVERED'|'FAILED'; raw?:unknown; }
export interface EmailProvider { readonly key:ProviderKey; send(input:MessageInput):Promise<MessageResult>; }
export interface SmsProvider { readonly key:ProviderKey; send(input:MessageInput):Promise<MessageResult>; }
export interface WhatsAppProvider { readonly key:ProviderKey; send(input:MessageInput):Promise<MessageResult>; }

export interface CctvStreamResult { liveUrl?:string; playbackUrl?:string; expiresAt?:Date; metadata?:Record<string,unknown>; }
export interface CctvProvider { readonly key:ProviderKey; live(cameraRef:string):Promise<CctvStreamResult>; playback(cameraRef:string,from:Date,to:Date):Promise<CctvStreamResult>; health(cameraRef:string):Promise<{status:'ONLINE'|'OFFLINE'|'DEGRADED';lastSeenAt?:Date}>; }
