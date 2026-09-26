import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, isVideoMedia, validateMaintenanceMedia } from './maintenance-media';

describe('maintenance media validation', () => {
  it('accepts supported camera photos and videos', () => {
    expect(validateMaintenanceMedia([{ name: 'leak.jpg', type: 'image/jpeg', size: 2_000_000 }, { name: 'noise.mp4', type: 'video/mp4', size: 8_000_000 }])).toBeNull();
  });

  it('rejects unsupported files and oversized media', () => {
    expect(validateMaintenanceMedia([{ name: 'notes.pdf', type: 'application/pdf', size: 100 }])).toContain('not a supported');
    expect(validateMaintenanceMedia([{ name: 'large.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 }])).toContain('10 MB');
    expect(validateMaintenanceMedia([{ name: 'large.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }])).toContain('25 MB');
  });

  it('enforces the combined five-file limit and identifies video', () => {
    expect(validateMaintenanceMedia([{ name: 'extra.jpg', type: 'image/jpeg', size: 100 }], 5)).toContain('up to 5');
    expect(isVideoMedia({ name: 'clip.webm', type: 'video/webm', size: 100 })).toBe(true);
  });
});
