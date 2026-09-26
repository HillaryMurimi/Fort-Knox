import { describe, expect, it } from 'vitest';
import { paginationQuerySchema, paginationMeta } from './pagination.js';
import { parseIfMatch, versionEtag } from './optimistic-concurrency.js';

describe('API platform contracts', () => {
  it('normalizes pagination defaults', () => {
    const query = paginationQuerySchema.parse({});
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(25);
    expect(paginationMeta(51, query).totalPages).toBe(3);
  });

  it('validates optimistic concurrency versions', () => {
    expect(parseIfMatch('W/"7"')).toBe(7);
    expect(versionEtag(7)).toBe('"7"');
    expect(() => parseIfMatch('abc')).toThrow();
  });
});
