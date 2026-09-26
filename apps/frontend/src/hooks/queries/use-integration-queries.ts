'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationsClient, type PaymentInitiateInput, type StorageSignedUrlInput } from '../../lib/data/integrations';
import { queryKeys } from '../../lib/data/query-keys';
export function useIntegrationHealthQuery(){return useQuery({queryKey:queryKeys.integrations.health(),queryFn:integrationsClient.health,refetchInterval:30000});}
export function useInitiateProviderPaymentMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:({paymentId,input}:{paymentId:string;input:PaymentInitiateInput})=>integrationsClient.initiatePayment(paymentId,input),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.finance.payments(org)});}});}
export function useReconcileProviderPaymentMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(paymentId:string)=>integrationsClient.reconcilePayment(paymentId),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.finance.payments(org)});}});}
export function useStorageSignedUrlMutation(org:string|null){return useMutation({mutationFn:(input:StorageSignedUrlInput)=>integrationsClient.signedUrl(org as string,input)});}
