import multer from 'multer';
import { AppError } from '../../core/errors/AppError.js';

export const MAINTENANCE_MEDIA_LIMIT = 5;
export const MAINTENANCE_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const MAINTENANCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export function isAllowedMaintenanceMediaType(mimeType: string): boolean {
  return allowedTypes.has(mimeType);
}

export function assertMaintenanceMediaFiles(files: Array<{ mimetype: string; size: number }>): void {
  if (files.length === 0) throw new AppError(400, 'MAINTENANCE_MEDIA_REQUIRED', 'Select at least one photo or video');
  if (files.length > MAINTENANCE_MEDIA_LIMIT) throw new AppError(400, 'MAINTENANCE_MEDIA_LIMIT', `A maintenance request accepts at most ${MAINTENANCE_MEDIA_LIMIT} media files`);
  for (const file of files) {
    if (!isAllowedMaintenanceMediaType(file.mimetype)) throw new AppError(400, 'UNSUPPORTED_MAINTENANCE_MEDIA', 'Unsupported photo or video type');
    const limit = file.mimetype.startsWith('image/') ? MAINTENANCE_IMAGE_MAX_BYTES : MAINTENANCE_MEDIA_MAX_BYTES;
    if (file.size > limit) throw new AppError(400, 'MAINTENANCE_MEDIA_TOO_LARGE', file.mimetype.startsWith('image/') ? 'Photos must be 10 MB or smaller' : 'Videos must be 25 MB or smaller');
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAINTENANCE_MEDIA_LIMIT, fileSize: MAINTENANCE_MEDIA_MAX_BYTES },
  fileFilter: (_request, file, callback) => {
    if (!isAllowedMaintenanceMediaType(file.mimetype)) {
      callback(new AppError(400, 'UNSUPPORTED_MAINTENANCE_MEDIA', 'Use JPEG, PNG, WebP, HEIC, MP4, WebM, or QuickTime media.'));
      return;
    }
    callback(null, true);
  },
});

export const maintenanceMediaUpload = upload.array('media', MAINTENANCE_MEDIA_LIMIT);
