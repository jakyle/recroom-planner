import { supabase } from './client';

const BUCKET = 'refs';

/** Upload an image for a project (R13.7 limits: ≤5 MB after client-side downscale). Returns the storage path. */
export async function uploadProjectImage(projectId: string, blob: Blob, ext: string): Promise<string> {
  const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function signedImageUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeProjectImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** Downscale to ≤ maxPx on the long side; PNG for transparency, JPEG otherwise. */
export async function downscaleImage(file: File, maxPx = 2048): Promise<{ blob: Blob; ext: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  const png = file.type === 'image/png';
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), png ? 'image/png' : 'image/jpeg', 0.9));
  return { blob, ext: png ? 'png' : 'jpg', width: w, height: h };
}
