import { z } from 'zod';
import { AppError } from '../../core/errors/AppError.js';
import { env } from '../../config/env.js';

export const researchSourceSchema = z.object({
  title: z.string().trim().min(1).max(300), url: z.string().url().max(1500),
  excerpt: z.string().max(2000), retrievedAt: z.date(), provider: z.literal('BRAVE'),
}).strict();
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export interface SalesResearchProvider {
  readonly key: 'BRAVE';
  search(query: string, signal?: AbortSignal): Promise<ResearchSource[]>;
}
// These are source references for human review, never endpoints the server will scrape.
export function publicResearchUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) || /^\d+(\.\d+){3}$/.test(url.hostname) || url.hostname.includes(':')) return null;
    return url.href;
  } catch { return null; }
}
const sourceResponse = z.object({ web: z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), description: z.string().nullish() })).max(20) }).optional() });
export class BraveSalesResearchProvider implements SalesResearchProvider {
  readonly key = 'BRAVE' as const;
  constructor(private readonly apiKey: string) {}
  async search(raw: string, signal?: AbortSignal): Promise<ResearchSource[]> {
    const query = z.string().trim().min(3).max(300).parse(raw);
    if (!this.apiKey) throw new AppError(503, 'RESEARCH_NOT_CONFIGURED', 'Permitted research provider is not configured');
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query); url.searchParams.set('count', '10'); url.searchParams.set('search_lang', 'en'); url.searchParams.set('safesearch', 'strict');
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), headers: { accept: 'application/json', 'X-Subscription-Token': this.apiKey } });
      if (!response.ok) throw new AppError(503, 'RESEARCH_PROVIDER_UNAVAILABLE', 'Research provider request was not accepted');
      const parsed = sourceResponse.parse(await response.json()), now = new Date();
      const seen = new Set<string>(), sources: ResearchSource[] = [];
      for (const item of (parsed.web?.results ?? []).slice(0, 10)) {
        const sourceUrl = publicResearchUrl(item.url);
        if (!sourceUrl || seen.has(sourceUrl)) continue;
        seen.add(sourceUrl);
        sources.push(researchSourceSchema.parse({ title: item.title.replace(/<[^>]*>/g, '').trim().slice(0, 300), url: sourceUrl, excerpt: (item.description ?? '').replace(/<[^>]*>/g, '').slice(0, 2000), retrievedAt: now, provider: 'BRAVE' }));
      }
      return sources;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'RESEARCH_PROVIDER_UNAVAILABLE', 'Research provider returned unavailable or invalid evidence');
    }
  }
}
let testProvider: SalesResearchProvider | undefined;
export function setSalesResearchTestProvider(provider?: SalesResearchProvider) {
  if (env.NODE_ENV !== 'test') throw new Error('TEST_PROVIDER_FORBIDDEN');
  testProvider = provider;
}
export function salesResearchProvider(): SalesResearchProvider | undefined {
  if (env.NODE_ENV === 'test') return testProvider;
  if (testProvider) return testProvider;
  if (!env.SALES_RESEARCH_API_KEY || !env.SALES_RESEARCH_LICENSE_REVIEWED) return undefined;
  return new BraveSalesResearchProvider(env.SALES_RESEARCH_API_KEY);
}
