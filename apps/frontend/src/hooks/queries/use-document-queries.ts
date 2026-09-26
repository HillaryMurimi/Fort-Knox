'use client';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { documentClient,evidenceClient,storageClient,type CreateDocumentInput,type CreateEvidenceInput,type EvidenceQuery,type UpdateDocumentInput } from '../../lib/data/documents';
import { queryKeys } from '../../lib/data/query-keys';
export function useDocumentsQuery(org:string|null){return useQuery({queryKey:org?queryKeys.documents.list(org):['documents','disabled'],queryFn:()=>documentClient.list(org as string),enabled:Boolean(org)});}
export function useDocumentQuery(org:string|null,id:string|null){return useQuery({queryKey:org&&id?queryKeys.documents.detail(org,id):['document','disabled'],queryFn:()=>documentClient.get(id as string),enabled:Boolean(org&&id)});}
export function useEvidenceQuery(org:string|null,params:EvidenceQuery={}){return useQuery({queryKey:org?queryKeys.evidence.list(org,JSON.stringify(params)):['evidence','disabled'],queryFn:()=>evidenceClient.list(org as string,params),enabled:Boolean(org)});}
export function useCreateDocumentMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(v:CreateDocumentInput)=>documentClient.create(org as string,v),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.documents.all(org)});}});}
export function useUpdateDocumentMutation(org:string|null,id:string){const qc=useQueryClient();return useMutation({mutationFn:(v:UpdateDocumentInput)=>documentClient.update(id,v),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.documents.all(org)});}});}
export function useCreateEvidenceMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(v:CreateEvidenceInput)=>evidenceClient.create(org as string,v),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.evidence.all(org)});}});}

export function useSignedStorageUrlMutation(org: string | null) { return useMutation({ mutationFn: (v: { key: string; provider: 'CLOUDINARY' | 'S3' | 'OTHER'; expiresInSeconds?: number }) => storageClient.signedUrl(org as string, v.key, v.provider, v.expiresInSeconds), }); }
