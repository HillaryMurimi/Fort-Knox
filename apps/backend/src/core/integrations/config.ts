import { env } from '../../config/env.js';
export const integrationConfig={
 mpesa:{enabled:Boolean(env.MPESA_CONSUMER_KEY&&env.MPESA_CONSUMER_SECRET&&env.MPESA_SHORT_CODE&&env.MPESA_PASSKEY),baseUrl:env.MPESA_BASE_URL,consumerKey:env.MPESA_CONSUMER_KEY,consumerSecret:env.MPESA_CONSUMER_SECRET,shortCode:env.MPESA_SHORT_CODE,passkey:env.MPESA_PASSKEY,callbackUrl:env.MPESA_CALLBACK_URL,webhookSecret:env.MPESA_WEBHOOK_SECRET},
 paystack:{enabled:Boolean(env.PAYSTACK_SECRET_KEY),baseUrl:env.PAYSTACK_BASE_URL,secretKey:env.PAYSTACK_SECRET_KEY,callbackUrl:env.PAYSTACK_CALLBACK_URL},
 email:{provider:env.EMAIL_PROVIDER,from:env.EMAIL_FROM},
 sendgrid:{apiKey:env.SENDGRID_API_KEY},
 sms:{provider:env.SMS_PROVIDER,from:env.SMS_FROM},
 twilio:{accountSid:env.TWILIO_ACCOUNT_SID,authToken:env.TWILIO_AUTH_TOKEN},
 whatsapp:{phoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID,accessToken:env.WHATSAPP_ACCESS_TOKEN},
 cloudinary:{cloudName:env.CLOUDINARY_CLOUD_NAME,apiKey:env.CLOUDINARY_API_KEY,apiSecret:env.CLOUDINARY_API_SECRET},
 s3:{bucket:env.S3_BUCKET,region:env.S3_REGION,accessKeyId:env.S3_ACCESS_KEY_ID,secretAccessKey:env.S3_SECRET_ACCESS_KEY,endpoint:env.S3_ENDPOINT},
 cctv:{baseUrl:env.CCTV_PROVIDER_BASE_URL,apiKey:env.CCTV_PROVIDER_API_KEY},
 nvr:{baseUrl:env.NVR_BASE_URL,apiKey:env.NVR_API_KEY}
};
