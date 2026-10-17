/**
 * Upload limits shared by the media library UI and its server actions (no server imports: used by client components).
 * MEDIA_MAX_BYTES mirrors MAX_UPLOAD_BYTES in @rentweb/core/storage (checked by ADMIN_B2-15-verify.ts).
 */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 20;
/** Matches MEDIA_LIBRARY_KINDS (no SVG: script-capable, refused since SEC-008). */
export const MEDIA_TYPES_LABEL = "JPG, PNG, WebP, GIF, AVIF, PDF, MP4, WebM";
export const SECTION_IMAGE_TYPES_LABEL = "JPG, PNG, WebP, GIF, AVIF";
export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf,video/mp4,video/webm";
export const SECTION_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

export function fmtMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function tooLargeMessage(name: string, size: number): string {
  return `${name}: ไฟล์ใหญ่เกิน 10 MB (${fmtMb(size)})`;
}
