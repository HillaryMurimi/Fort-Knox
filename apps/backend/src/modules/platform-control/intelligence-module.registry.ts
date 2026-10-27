export const intelligenceModuleRegistry = [
  { key: 'INTELLIGENCE_RENT_LEDGER', name: 'Universal rent ledger', description: 'Rent and collection intelligence across verified sources.', plans: ['CONTROL', 'FORT_KNOX'], entitlement: 'intelligence.rent-ledger', dependencies: [] },
  { key: 'INTELLIGENCE_PROFITABILITY', name: 'Property profitability', description: 'Expense classification and property-level operating results.', plans: ['CONTROL', 'FORT_KNOX'], entitlement: 'intelligence.profitability', dependencies: ['INTELLIGENCE_RENT_LEDGER'] },
  { key: 'INTELLIGENCE_OCCUPANCY', name: 'Occupancy and retention', description: 'Occupancy history and tenant retention intelligence.', plans: ['CONTROL', 'FORT_KNOX'], entitlement: 'intelligence.occupancy', dependencies: [] },
  { key: 'INTELLIGENCE_FORECASTING', name: 'Financial forecasting', description: 'Five-year forecasts and scenario simulations.', plans: ['FORT_KNOX'], entitlement: 'intelligence.forecasting', dependencies: ['INTELLIGENCE_RENT_LEDGER', 'INTELLIGENCE_PROFITABILITY', 'INTELLIGENCE_OCCUPANCY'] },
  { key: 'INTELLIGENCE_MAINTENANCE', name: 'Predictive maintenance', description: 'Maintenance history and asset-risk intelligence.', plans: ['FORT_KNOX'], entitlement: 'intelligence.maintenance', dependencies: [] },
  { key: 'INTELLIGENCE_VALUATION', name: 'Property valuation', description: 'Investment and valuation assumptions with provenance.', plans: ['FORT_KNOX'], entitlement: 'intelligence.valuation', dependencies: ['INTELLIGENCE_PROFITABILITY', 'INTELLIGENCE_OCCUPANCY'] },
  { key: 'INTELLIGENCE_ANOMALIES', name: 'Financial anomaly detection', description: 'Reviewable financial exceptions and unusual patterns.', plans: ['FORT_KNOX'], entitlement: 'intelligence.anomalies', dependencies: ['INTELLIGENCE_RENT_LEDGER', 'INTELLIGENCE_PROFITABILITY'] },
  { key: 'INTELLIGENCE_MORNING_BRIEF', name: 'Intelligent morning brief', description: 'A sourced summary of existing financial and operational intelligence.', plans: ['FORT_KNOX'], entitlement: 'intelligence.morning-brief', dependencies: ['INTELLIGENCE_RENT_LEDGER', 'INTELLIGENCE_PROFITABILITY', 'INTELLIGENCE_OCCUPANCY'] },
  { key: 'INTELLIGENCE_DIGITAL_TWIN', name: 'Portfolio financial digital twin', description: 'Portfolio scenarios assembled from shared intelligence outputs.', plans: ['FORT_KNOX'], entitlement: 'intelligence.digital-twin', dependencies: ['INTELLIGENCE_FORECASTING', 'INTELLIGENCE_PROFITABILITY', 'INTELLIGENCE_OCCUPANCY', 'INTELLIGENCE_VALUATION'] },
] as const;

export type IntelligenceModuleKey = (typeof intelligenceModuleRegistry)[number]['key'];

export function isPlannedIntelligenceModule(key: string): key is IntelligenceModuleKey {
  return intelligenceModuleRegistry.some(module => module.key === key);
}
