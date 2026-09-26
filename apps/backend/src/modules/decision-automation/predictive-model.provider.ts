export interface PredictionInput { domain:'ARREARS'|'VACANCY'|'REVENUE'; features:Record<string,number>; }
export interface PredictionOutput { value:number; probability?:number; confidence:number; modelVersion:string; }

/**
 * Stable provider boundary for future trained models. The current production
 * implementation remains rule-based and explainable; a trained model can be
 * introduced behind this interface without changing the API/action layer.
 */
export interface PredictiveModelProvider { predict(input:PredictionInput):Promise<PredictionOutput>; }
