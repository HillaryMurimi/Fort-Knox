'use client';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { commandCenterClient,type AlertQuery,type AlertUpdateInput,type CommandCenterQuery } from '../../lib/data/command-center';
import { queryKeys } from '../../lib/data/query-keys';
function key(v:unknown){return JSON.stringify(v??{});}
export function useCommandCenterQuery(org:string|null,params:CommandCenterQuery={}){return useQuery({queryKey:org?queryKeys.commandCenter.dashboard(org,key(params)):['command-center','disabled'],queryFn:()=>commandCenterClient.dashboard(org as string,params),enabled:Boolean(org)});}
export function usePropertyHealthQuery(org:string|null,propertyId:string|null){return useQuery({queryKey:org&&propertyId?queryKeys.commandCenter.propertyHealth(org,propertyId):['property-health','disabled'],queryFn:()=>commandCenterClient.propertyHealth(org as string,propertyId as string),enabled:Boolean(org&&propertyId)});}
export function useIntelligenceAlertsQuery(org:string|null,params:AlertQuery={}){return useQuery({queryKey:org?queryKeys.commandCenter.alerts(org,key(params)):['intelligence-alerts','disabled'],queryFn:()=>commandCenterClient.alerts(org as string,params),enabled:Boolean(org)});}
export function usePropertyHealthHistoryQuery(org:string|null,propertyId:string|null){return useQuery({queryKey:org&&propertyId?queryKeys.commandCenter.history(org,propertyId):['health-history','disabled'],queryFn:()=>commandCenterClient.history(org as string,propertyId as string),enabled:Boolean(org&&propertyId)});}
export function useEvaluateIntelligenceMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(params:CommandCenterQuery={})=>commandCenterClient.evaluate(org as string,params),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.commandCenter.all(org)});}});}
export function useUpdateIntelligenceAlertMutation(org:string|null){const qc=useQueryClient();return useMutation({mutationFn:(v:{id:string;input:AlertUpdateInput})=>commandCenterClient.updateAlert(v.id,v.input),onSuccess:()=>{if(org)void qc.invalidateQueries({queryKey:queryKeys.commandCenter.all(org)});}});}
