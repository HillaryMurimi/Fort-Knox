import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingForHour } from '../src/lib/greeting.ts';

test('greeting changes at noon and 6pm and resets at midnight', () => {
  for (const hour of [0, 6, 11]) assert.equal(greetingForHour(hour), 'Good morning');
  for (const hour of [12, 17]) assert.equal(greetingForHour(hour), 'Good afternoon');
  for (const hour of [18, 23]) assert.equal(greetingForHour(hour), 'Good evening');
});
