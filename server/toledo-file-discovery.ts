import * as fs from 'fs';
import * as path from 'path';

export interface ToledoSourceFile {
  path: string;
  kind: 'fixed_txt' | 'fixed_bak' | 'versioned_txt';
  mtimeMs: number;
  size: number;
}

/** Resolves conventional Toledo exports and the versioned MGV6 archive format. */
export function findToledoSourceFile(dir: string, fileNameTxt: string, fileNameBak: string): ToledoSourceFile | null {
  const fixedCandidates: Array<Omit<ToledoSourceFile, 'mtimeMs'>> = [
    { path: path.join(dir, fileNameTxt), kind: 'fixed_txt', size: 0 },
    { path: path.join(dir, fileNameBak), kind: 'fixed_bak', size: 0 },
  ];
  const candidates: ToledoSourceFile[] = [];

  for (const candidate of fixedCandidates) {
    try {
      const stat = fs.statSync(candidate.path);
      if (stat.isFile()) candidates.push({ ...candidate, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
    }
  }

  if (fileNameTxt.toUpperCase() === 'ITENSMGV.TXT') {
    const versionedExport = /^itensmgv-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.txt$/i;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !versionedExport.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      candidates.push({
        path: filePath,
        kind: 'versioned_txt',
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
    }
  }

  return candidates.reduce<ToledoSourceFile | null>((newest, candidate) => {
    if (!newest) return candidate;
    if (candidate.mtimeMs !== newest.mtimeMs) {
      return candidate.mtimeMs > newest.mtimeMs ? candidate : newest;
    }
    return candidate.path > newest.path ? candidate : newest;
  }, null);
}

export function hasToledoSourceChanged(
  previous: ToledoSourceFile | null,
  current: ToledoSourceFile | null,
): boolean {
  if (!current) return false;
  if (!previous) return true;
  return current.path !== previous.path
    || current.mtimeMs !== previous.mtimeMs
    || current.size !== previous.size;
}
