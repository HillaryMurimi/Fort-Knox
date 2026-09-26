import { describe, expect, it } from 'vitest';
import {
  MAINTENANCE_MEDIA_LIMIT,
  MAINTENANCE_MEDIA_MAX_BYTES,
  assertMaintenanceMediaFiles,
  isAllowedMaintenanceMediaType,
} from '../../src/modules/maintenance/maintenance-media.middleware.js';

describe('maintenance media upload policy', () => {
  it('allows supported camera image and video formats', () => {
    expect(isAllowedMaintenanceMediaType('image/jpeg')).toBe(true);
    expect(isAllowedMaintenanceMediaType('image/heic')).toBe(true);
    expect(isAllowedMaintenanceMediaType('video/mp4')).toBe(true);
    expect(isAllowedMaintenanceMediaType('video/quicktime')).toBe(true);
  });

  it('rejects unrelated and executable content types', () => {
    expect(isAllowedMaintenanceMediaType('application/pdf')).toBe(false);
    expect(isAllowedMaintenanceMediaType('application/javascript')).toBe(false);
  });

  it('keeps upload count and per-file size bounded', () => {
    expect(MAINTENANCE_MEDIA_LIMIT).toBe(5);
    expect(MAINTENANCE_MEDIA_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(() => assertMaintenanceMediaFiles([{ mimetype: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }])).toThrow('10 MB');
    expect(() => assertMaintenanceMediaFiles([{ mimetype: 'video/mp4', size: MAINTENANCE_MEDIA_MAX_BYTES + 1 }])).toThrow('25 MB');
  });
});
