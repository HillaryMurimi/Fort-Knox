import { api } from '../api';
import type { Contractor, ContractorPerformance } from './resource-types';
export interface ContractorInput { name:string; phone?:string; email?:string; trade:string; notes?:string; }
export const contractorsClient={
 list:(organizationId:string)=>api<Contractor[]>(`/organizations/${organizationId}/contractors`),
 create:(organizationId:string,input:ContractorInput)=>api<Contractor>(`/organizations/${organizationId}/contractors`,{method:'POST',body:JSON.stringify(input)}),
 get:(id:string)=>api<Contractor>(`/contractors/${id}`),
 update:(id:string,input:Partial<ContractorInput> & {status?:Contractor['status']})=>api<Contractor>(`/contractors/${id}`,{method:'PATCH',body:JSON.stringify(input)}),
 performance:(id:string)=>api<ContractorPerformance>(`/contractors/${id}/performance`)
};
