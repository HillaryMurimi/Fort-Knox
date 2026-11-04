import { describe, expect, it } from 'vitest';
import { intelligenceForAgent, intelligenceGuidance, salesIntelligence } from './sales-intelligence.catalog.js';
import { agentKeys } from './sales-agent.schemas.js';

describe('curated sales intelligence', () => {
  it('maps sourced, unvalidated lessons to every existing agent', () => {
    expect(salesIntelligence.length).toBeGreaterThan(0);
    for (const key of agentKeys) {
      const insights = intelligenceForAgent(key);
      expect(insights.length).toBeGreaterThan(0);
      expect(insights.every(item => item.agents.includes(key) && item.status === 'RESEARCHED')).toBe(true);
      expect(intelligenceGuidance(key)).toContain('advisory');
    }
  });
  it('enforces retrieval bounds and source attribution', () => {
    expect(() => intelligenceForAgent('SALES_OUTREACH', 21)).toThrow();
    expect(intelligenceForAgent('SALES_OUTREACH', 0)).toEqual([]);
    expect(salesIntelligence.every(item => item.sourceUrl.startsWith('https://www.youtube.com/watch?v='))).toBe(true);
  });
});
