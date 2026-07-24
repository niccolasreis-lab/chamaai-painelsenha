import * as fs from 'fs';
import * as path from 'path';

export interface MediaFileRecord {
  id: string | number;
  caminho: string;
  file_status: string | null;
}

export interface MediaFileStatusChange {
  id: string | number;
  status: 'active' | 'missing';
}

export function getUploadsDirectory(dataDirectory = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi'): string {
  return path.resolve(dataDirectory, 'uploads');
}

/**
 * Converts a public `/uploads/<file>` URL into a physical path and rejects
 * traversal attempts or paths outside the configured uploads directory.
 */
export function resolveUploadPath(publicPath: string, uploadsDirectory: string): string | null {
  if (typeof publicPath !== 'string' || publicPath.includes('\0')) return null;

  const normalizedPublicPath = publicPath.replace(/\\/g, '/');
  const prefix = '/uploads/';
  if (!normalizedPublicPath.startsWith(prefix)) return null;

  const relativePath = normalizedPublicPath.slice(prefix.length);
  if (!relativePath) return null;

  const uploadsRoot = path.resolve(uploadsDirectory);
  const resolvedPath = path.resolve(uploadsRoot, relativePath);
  const rootWithSeparator = uploadsRoot.endsWith(path.sep) ? uploadsRoot : `${uploadsRoot}${path.sep}`;

  if (!resolvedPath.startsWith(rootWithSeparator)) return null;
  return resolvedPath;
}

export function planMediaFileReconciliation(
  records: MediaFileRecord[],
  uploadsDirectory: string,
  fileExists: (filePath: string) => boolean = fs.existsSync,
): MediaFileStatusChange[] {
  const changes: MediaFileStatusChange[] = [];

  for (const record of records) {
    const filePath = resolveUploadPath(record.caminho, uploadsDirectory);
    const exists = filePath !== null && fileExists(filePath);

    if (!exists && record.file_status !== 'missing') {
      changes.push({ id: record.id, status: 'missing' });
    } else if (exists && record.file_status === 'missing') {
      changes.push({ id: record.id, status: 'active' });
    }
  }

  return changes;
}
