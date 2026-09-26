export type MarketingEvent =
  | 'hero_demo_click'
  | 'product_exploration'
  | 'control_interest'
  | 'fort_knox_interest'
  | 'pricing_interaction'
  | 'final_demo_click'
  | 'demo_request_prepared';

export function trackMarketingEvent(event: MarketingEvent, context?: Record<string, string | number>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pmcc:marketing', { detail: { event, context, occurredAt: new Date().toISOString() } }));
}
