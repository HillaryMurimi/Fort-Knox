import {z} from 'zod';
export const paystackChannelSchema=z.enum(['card','bank','apple_pay','ussd','qr','mobile_money','bank_transfer','eft','capitec_pay','payattitude']);
export const paymentInitiateSchema=z.object({provider:z.enum(['MPESA','PAYSTACK','STRIPE','OTHER']),phone:z.string().min(7).max(40).optional(),email:z.string().email().optional(),paystackChannels:z.array(paystackChannelSchema).min(1).max(10).optional()}).strict();
export const storageSignSchema=z.object({provider:z.enum(['CLOUDINARY','S3','OTHER']),key:z.string().min(1),expiresInSeconds:z.number().int().min(60).max(86400).default(900)});
export const cctvHealthSchema=z.object({organizationId:z.string().min(1),cameraId:z.string().min(1)});
