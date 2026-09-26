'use client';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { contractorsClient,type ContractorInput } from '../../lib/data/contractors';
import { queryKeys } from '../../lib/data/query-keys';
export function useContractorsQuery(org:string|null){return useQuery({queryKey:org?queryKeys.contractors.list(org):['contractors','disabled'],queryFn:()=>contractorsClient.list(org as string),enabled:Boolean(org)});}
export function useContractorQuery(org:string|null,id:string|null){return useQuery({queryKey:org&&id?queryKeys.contractors.detail(org,id):['contractor','disabled'],queryFn:()=>contractorsClient.get(id as string),enabled:Boolean(org&&id)});}
export function useCreateContractorMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(input:ContractorInput)=>contractorsClient.create(org as string,input),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.contractors.all(org)});}});}
export function useUpdateContractorMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(v:{id:string;input:Partial<ContractorInput> & {status?:'ACTIVE'|'INACTIVE'|'SUSPENDED'}})=>contractorsClient.update(v.id,v.input),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.contractors.all(org)});}});}
