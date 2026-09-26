'use client';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { securityClient,type AccessEventQuery,type CreateAccessEventInput,type CreateAccessPointInput,type CreateCameraInput,type CreateIncidentInput,type CreateSecurityEventInput,type IncidentQuery,type IncidentUpdateInput,type SecurityEventQuery,type SecurityEventUpdateInput,type UpdateAccessPointInput,type UpdateCameraInput } from '../../lib/data/security';
import { queryKeys } from '../../lib/data/query-keys';
function paramsKey(value:unknown){return JSON.stringify(value??{});}
export function useCamerasQuery(org:string|null){return useQuery({queryKey:org?queryKeys.security.cameras(org):['security','cameras','disabled'],queryFn:()=>securityClient.cameras.list(org as string),enabled:Boolean(org)});}
export function useSecurityEventsQuery(org:string|null,params:SecurityEventQuery={}){return useQuery({queryKey:org?queryKeys.security.events(org,paramsKey(params)):['security','events','disabled'],queryFn:()=>securityClient.events.list(org as string,params),enabled:Boolean(org)});}
export function useSecuritySummaryQuery(org:string|null){return useQuery({queryKey:org?queryKeys.security.summary(org):['security','summary','disabled'],queryFn:()=>securityClient.events.summary(org as string),enabled:Boolean(org)});}
export function useIncidentsQuery(org:string|null,params:IncidentQuery={}){return useQuery({queryKey:org?queryKeys.security.incidents(org,paramsKey(params)):['security','incidents','disabled'],queryFn:()=>securityClient.incidents.list(org as string,params),enabled:Boolean(org)});}
export function useAccessPointsQuery(org:string|null){return useQuery({queryKey:org?queryKeys.security.accessPoints(org):['security','access-points','disabled'],queryFn:()=>securityClient.accessPoints.list(org as string),enabled:Boolean(org)});}
export function useAccessEventsQuery(org:string|null,params:AccessEventQuery={}){return useQuery({queryKey:org?queryKeys.security.accessEvents(org,paramsKey(params)):['security','access-events','disabled'],queryFn:()=>securityClient.accessEvents.list(org as string,params),enabled:Boolean(org)});}
function useSecurityMutation<T>(org:string|null,fn:(v:T)=>Promise<unknown>){const qc=useQueryClient();return useMutation({mutationFn:fn,onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.security.all(org)});}});}
export function useCreateCameraMutation(org:string|null){return useSecurityMutation<CreateCameraInput>(org,(v)=>securityClient.cameras.create(org as string,v));}
export function useUpdateCameraMutation(org:string|null){return useSecurityMutation<{id:string;input:UpdateCameraInput}>(org,(v)=>securityClient.cameras.update(v.id,v.input));}
export function useCreateSecurityEventMutation(org:string|null){return useSecurityMutation<CreateSecurityEventInput>(org,(v)=>securityClient.events.create(org as string,v));}
export function useUpdateSecurityEventMutation(org:string|null){return useSecurityMutation<{id:string;input:SecurityEventUpdateInput}>(org,(v)=>securityClient.events.update(v.id,v.input));}
export function useCreateIncidentMutation(org:string|null){return useSecurityMutation<CreateIncidentInput>(org,(v)=>securityClient.incidents.create(org as string,v));}
export function useUpdateIncidentMutation(org:string|null){return useSecurityMutation<{id:string;input:IncidentUpdateInput}>(org,(v)=>securityClient.incidents.update(v.id,v.input));}
export function useCreateAccessPointMutation(org:string|null){return useSecurityMutation<CreateAccessPointInput>(org,(v)=>securityClient.accessPoints.create(org as string,v));}
export function useUpdateAccessPointMutation(org:string|null){return useSecurityMutation<{id:string;input:UpdateAccessPointInput}>(org,(v)=>securityClient.accessPoints.update(v.id,v.input));}
export function useCreateAccessEventMutation(org:string|null){return useSecurityMutation<CreateAccessEventInput>(org,(v)=>securityClient.accessEvents.create(org as string,v));}
