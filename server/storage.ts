import fs from 'fs';
import path from 'path';

export const CHAMAAI_DATA_DIR = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
export const UPLOADS_DIR = path.join(CHAMAAI_DATA_DIR, 'uploads');
export const TTS_DIR = path.join(UPLOADS_DIR, 'tts');

export function ensureStorageDirectories(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  for (const type of ['tipo1', 'tipo2', 'tipo3']) {
    fs.mkdirSync(path.join(TTS_DIR, type), { recursive: true });
  }
}

export function resolveManagedAssetPath(publicPath: string): string | null {
  if (typeof publicPath !== 'string') return null;
  // O manifesto nunca deve transformar uma URL externa em acesso ao disco local.
  if (!publicPath.startsWith('/') || publicPath.startsWith('//')) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(publicPath, 'http://localhost').pathname);
  } catch {
    return null;
  }

  let relative: string;
  if (pathname.startsWith('/uploads/')) {
    relative = pathname.slice('/uploads/'.length);
  } else if (pathname.startsWith('/tts/')) {
    relative = path.join('tts', pathname.slice('/tts/'.length));
  } else {
    return null;
  }

  const resolved = path.resolve(UPLOADS_DIR, relative);
  const uploadsRoot = path.resolve(UPLOADS_DIR) + path.sep;
  return resolved.startsWith(uploadsRoot) ? resolved : null;
}

export function unlinkManagedAsset(publicPath: string): boolean {
  const filePath = resolveManagedAssetPath(publicPath);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  fs.unlinkSync(filePath);
  return true;
}
