'use client';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { predictiveLearningClient,type LabelOutcomesInput,type PredictiveModelQuery } from '../../lib/data/predictive-learning';
import { queryKeys } from '../../lib/data/query-keys';
const key=(v:unknown)=>JSON.stringify(v??{});
export function usePredictiveModelsQuery(org:string|null,params:PredictiveModelQuery={}){return useQuery({queryKey:org?queryKeys.predictiveLearning.models(org,key(params)):['predictive-models','disabled'],queryFn:()=>predictiveLearningClient.models(org as string,params),enabled:Boolean(org)});}
export function useLabelPredictiveOutcomesMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(input:LabelOutcomesInput={})=>predictiveLearningClient.labelOutcomes(org as string,input),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.predictiveLearning.all(org)});}});}
