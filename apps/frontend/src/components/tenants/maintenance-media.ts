export const MAX_MAINTENANCE_MEDIA = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

export interface MaintenanceMediaCandidate {
  name: string;
  type: string;
  size: number;
}

export function validateMaintenanceMedia(files: MaintenanceMediaCandidate[], existingCount = 0): string | null {
  if (existingCount + files.length > MAX_MAINTENANCE_MEDIA) return `Add up to ${MAX_MAINTENANCE_MEDIA} photos or videos.`;
  for (const file of files) {
    const isImage = IMAGE_TYPES.has(file.type);
    const isVideo = VIDEO_TYPES.has(file.type);
    if (!isImage && !isVideo) return `${file.name} is not a supported photo or video.`;
    if (isImage && file.size > MAX_IMAGE_BYTES) return `${file.name} is larger than 10 MB.`;
    if (isVideo && file.size > MAX_VIDEO_BYTES) return `${file.name} is larger than 25 MB.`;
  }
  return null;
}

export function isVideoMedia(file: MaintenanceMediaCandidate): boolean {
  return VIDEO_TYPES.has(file.type);
}
