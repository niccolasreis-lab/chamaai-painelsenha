import crypto from 'crypto';
import fs from 'fs';
import type express from 'express';
import { getDb } from '../electron/services/database';
import { resolveManagedAssetPath } from './storage';

export type TelaoAsset = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  url: string;
  version: string;
  sizeBytes: number;
  sha256: string;
  priority: number;
};

const hashCache = new Map<string, { size: number; mtimeMs: number; sha256: string }>();

function clampCacheMb(raw: unknown): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(2048, Math.max(32, Math.round(parsed))) : 256;
}

async function hashFile(filePath: string): Promise<{ sizeBytes: number; sha256: string } | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return null;
    const cached = hashCache.get(filePath);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      return { sizeBytes: cached.size, sha256: cached.sha256 };
    }
    const hash = crypto.createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    const sha256 = hash.digest('hex');
    hashCache.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, sha256 });
    return { sizeBytes: stat.size, sha256 };
  } catch {
    return null;
  }
}

function inferKind(type: unknown, url: string): TelaoAsset['kind'] {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('video') || /\.(mp4|webm|mov)$/i.test(url)) return 'video';
  if (normalized.includes('audio') || /\.(mp3|wav|ogg)$/i.test(url)) return 'audio';
  return 'image';
}

export function setupTelaoAssetRoutes(app: express.Express): void {
  app.get('/api/telao/assets/:code', async (req, res) => {
    try {
      const db = getDb();
      const code = String(req.params.code || '').toUpperCase();
      const profile = db.prepare('SELECT * FROM teloes WHERE code = ?').get(code) as any;
      if (!profile) return res.status(404).json({ error: 'Telão não encontrado.' });

      const configRows = db.prepare(
        "SELECT chave, valor FROM configuracoes WHERE chave IN ('telao_cache_limite_mb','telao_tts_revision','logo_cliente','telao_arte_espera')",
      ).all() as Array<{ chave: string; valor: string }>;
      const config = Object.fromEntries(configRows.map((row) => [row.chave, row.valor]));
      const candidates: Array<{ id: string; type: unknown; url: string; priority: number }> = [];

      if (profile.modulo_midia) {
        const legacy = db.prepare(`
          SELECT id, tipo, caminho FROM midias
          WHERE ativo = 1 AND deleted_at IS NULL
            AND COALESCE(file_status, 'active') NOT IN ('missing', 'failed')
            AND COALESCE(status, 'ativo') = 'ativo'
          ORDER BY ordem ASC, id DESC
        `).all() as any[];
        for (const item of legacy) {
          candidates.push({ id: `midia:${item.id}`, type: item.tipo, url: item.caminho, priority: 100 });
        }

        const smart = db.prepare(`
          SELECT id, type, local_path FROM media_items
          WHERE is_active = 1 AND local_path IS NOT NULL AND local_path != ''
            AND (start_at IS NULL OR start_at <= datetime('now', 'localtime'))
            AND (end_at IS NULL OR end_at >= datetime('now', 'localtime'))
          ORDER BY priority DESC, sort_order ASC
        `).all() as any[];
        for (const item of smart) {
          candidates.push({ id: `smart:${item.id}`, type: item.type, url: item.local_path, priority: 90 });
        }
      }

      for (const [key, priority] of [['logo_cliente', 1000], ['telao_arte_espera', 950]] as const) {
        if (config[key]) candidates.push({ id: `config:${key}`, type: 'image', url: config[key], priority });
      }

      const activeVignettes = db.prepare(`
        SELECT DISTINCT vf.id, vf.local_path
        FROM vignette_files vf
        JOIN vignette_schedules vs ON vs.folder_id = vf.folder_id
        WHERE vs.is_active = 1
      `).all() as any[];
      for (const item of activeVignettes) {
        candidates.push({ id: `vignette:${item.id}`, type: 'audio', url: item.local_path, priority: 50 });
      }

      const seen = new Set<string>();
      const assets: TelaoAsset[] = [];
      for (const candidate of candidates) {
        if (!candidate.url || seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        const filePath = resolveManagedAssetPath(candidate.url);
        if (!filePath) continue;
        const fingerprint = await hashFile(filePath);
        if (!fingerprint) continue;
        assets.push({
          id: candidate.id,
          kind: inferKind(candidate.type, candidate.url),
          url: candidate.url,
          version: fingerprint.sha256.slice(0, 16),
          sizeBytes: fingerprint.sizeBytes,
          sha256: fingerprint.sha256,
          priority: candidate.priority,
        });
      }

      assets.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
      const revision = crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 20);
      const cacheMb = clampCacheMb(config.telao_cache_limite_mb);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        revision,
        maxCacheBytes: cacheMb * 1024 * 1024,
        ttsRevision: config.telao_tts_revision || 'initial',
        assets,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });
}
