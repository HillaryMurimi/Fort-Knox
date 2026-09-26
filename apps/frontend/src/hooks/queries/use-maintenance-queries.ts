'use client';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { maintenanceClient,type ApproveInput,type AssignInput,type CreateMaintenanceInput,type MaintenancePolicyInput,type ProgressInput,type QuoteInput,type TriageInput,type VerifyInput } from '../../lib/data/maintenance';
import type { EvidenceRecord, MaintenanceRequest } from '../../lib/data/resource-types';
import { queryKeys } from '../../lib/data/query-keys';
export function useMaintenanceQuery(org:string|null){return useQuery({queryKey:org?queryKeys.maintenance.list(org):['maintenance','disabled'],queryFn:()=>maintenanceClient.list(org as string),enabled:Boolean(org)});}
export function useMaintenanceDetailQuery(org:string|null,id:string|null){return useQuery({queryKey:org&&id?queryKeys.maintenance.detail(org,id):['maintenance-detail','disabled'],queryFn:()=>maintenanceClient.get(id as string),enabled:Boolean(org&&id)});}
export function useMaintenancePolicyQuery(org:string|null){return useQuery({queryKey:org?queryKeys.maintenance.policy(org):['maintenance-policy','disabled'],queryFn:()=>maintenanceClient.policy.get(org as string),enabled:Boolean(org)});}
function useMaintenanceAction<T,R=unknown>(org:string|null,fn:(input:T)=>Promise<R>){const qc=useQueryClient();return useMutation({mutationFn:fn,onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.maintenance.all(org)});}});}
export function useCreateMaintenanceMutation(org:string|null){return useMaintenanceAction<CreateMaintenanceInput,MaintenanceRequest>(org,(input)=>maintenanceClient.create(org as string,input));}
export function useAddMaintenanceEvidenceMutation(org:string|null){return useMaintenanceAction<{id:string;files:File[]},EvidenceRecord[]>(org,(value)=>maintenanceClient.addEvidence(value.id,value.files));}
export function useTriageMaintenanceMutation(org:string|null){return useMaintenanceAction<{id:string;input:TriageInput}>(org,(v)=>maintenanceClient.triage(v.id,v.input));}
export function useAssignMaintenanceMutation(org:string|null){return useMaintenanceAction<{id:string;input:AssignInput}>(org,(v)=>maintenanceClient.assign(v.id,v.input));}
export function useQuoteMaintenanceMutation(org:string|null){return useMaintenanceAction<{id:string;input:QuoteInput}>(org,(v)=>maintenanceClient.quote(v.id,v.input));}
export function useApproveMaintenanceMutation(org:string|null){return useMaintenanceAction<{id:string;input?:ApproveInput}>(org,(v)=>maintenanceClient.approve(v.id,v.input));}
export function useProgressMaintenanceMutation(org:string|null){return useMaintenanceAction<{id:string;input:ProgressInput}>(org,(v)=>maintenanceClient.progress(v.id,v.input));}
export function useVerifyMaintenanceMutation(org:string|null){return useMaintenanceAction<{id:string;input?:VerifyInput}>(org,(v)=>maintenanceClient.verify(v.id,v.input));}
export function useCloseMaintenanceMutation(org:string|null){return useMaintenanceAction<{id:string;notes?:string}>(org,(v)=>maintenanceClient.close(v.id,v.notes));}
export function useSetMaintenancePolicyMutation(org:string|null){return useMaintenanceAction<MaintenancePolicyInput>(org,(input)=>maintenanceClient.policy.set(org as string,input));}
