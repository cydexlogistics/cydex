import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// One file size limit for every upload in the app (also set on the
// "store-images" storage bucket)
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '5 MB';

// False (with a message) when the file is over the limit
export const checkUploadSize = (file: File): boolean => {
  if (file.size > MAX_UPLOAD_BYTES) {
    toast.error(`Files must be ${MAX_UPLOAD_LABEL} or smaller`);
    return false;
  }
  return true;
};

// For plain file inputs: clears the selection if the file is too big
export const rejectOversizedFile = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file && !checkUploadSize(file)) event.target.value = '';
};

// ---------------------------------------------------------------------------
// Photos (product images, store logos and banners, profile photos)
//
// Photos are shrunk in the browser before upload and stored as files in the
// public "store-images" bucket under <user id>/, never as base64 text in the
// database: text in a row is downloaded with every query that reads the row,
// so a few phone photos made a vendor's product list several MB.
// ---------------------------------------------------------------------------

// Longest side in pixels for each kind of photo
export const PHOTO_MAX_SIZE = { product: 1200, banner: 1600, logo: 512, avatar: 512 } as const;
export type PhotoKind = keyof typeof PHOTO_MAX_SIZE;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image')); };
    img.src = url;
  });

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * The photo scaled down so its longest side is at most maxSize, as WebP (or
 * JPEG where the browser can't make WebP). Returns the original file when
 * that wouldn't make it smaller.
 */
export const shrinkPhoto = async (file: File, maxSize: number, quality = 0.82): Promise<Blob> => {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  let blob = await (async () => {
    ctx.drawImage(img, 0, 0, width, height);
    const webp = await toBlob(canvas, 'image/webp', quality);
    return webp?.type === 'image/webp' ? webp : null;
  })();
  if (!blob) {
    // JPEG has no transparency: put the photo on white
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    blob = await toBlob(canvas, 'image/jpeg', quality);
  }
  const keepOriginal = !blob || (scale === 1 && blob.size >= file.size && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
  return keepOriginal ? file : blob!;
};

/**
 * Shrinks a photo and uploads it to store-images/<userId>/<kind>-<time>.<ext>.
 * Returns its public URL to save on the row.
 */
export const uploadPhoto = async (file: File, userId: string, kind: PhotoKind): Promise<string> => {
  const photo = await shrinkPhoto(file, PHOTO_MAX_SIZE[kind]);
  const ext = photo.type === 'image/webp' ? 'webp' : photo.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('store-images').upload(path, photo, {
    // Each upload gets a new name, so browsers and the CDN can keep it for a year
    cacheControl: '31536000',
    contentType: photo.type || 'image/jpeg',
  });
  if (error) throw error;
  return supabase.storage.from('store-images').getPublicUrl(path).data.publicUrl;
};
