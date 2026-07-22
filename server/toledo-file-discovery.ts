import * as fs from 'fs';
import * as path from 'path';

export interface ToledoSourceFile {
  path: string;
  kind: 'fixed_txt' | 'fixed_bak' | 'versioned_txt';
  mtimeMs: number;
}

/** Resolves conventional Toledo exports and the versioned MGV6 archive format. */
export function findToledoSourceFile(dir: string, fileNameTxt: string, fileNameBak: string): ToledoSourceFile | null {
  const fixedCandidates: Array<Omit<ToledoSourceFile, 'mtimeMs'>> = [
    { path: path.join(dir, fileNameTxt), kind: 'fixed_txt' },
    { path: path.join(dir, fileNameBak), kind: 'fixed_bak' },
  ];
  for (const candidate of fixedCandidates) {
    try {
      const stat = fs.statSync(candidate.path);
      if (stat.isFile()) return { ...candidate, mtimeMs: stat.mtimeMs };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (fileNameTxt.toUpperCase() !== 'ITENSMGV.TXT') return null;

  const versionedExport = /^itensmgv-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.txt$/i;
  let newest: ToledoSourceFile | null = null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !versionedExport.test(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    const stat = fs.statSync(filePath);
    const candidate: ToledoSourceFile = { path: filePath, kind: 'versioned_txt', mtimeMs: stat.mtimeMs };
    if (!newest || candidate.mtimeMs > newest.mtimeMs || (candidate.mtimeMs === newest.mtimeMs && candidate.path > newest.path)) newest = candidate;
  }
  return newest;
}
