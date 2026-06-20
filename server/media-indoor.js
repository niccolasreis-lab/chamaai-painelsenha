"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMediaIndoorRoutes = setupMediaIndoorRoutes;
const database_1 = require("../electron/services/database");
const safeJsonParse = (str, fallback = {}) => {
    try {
        return str ? JSON.parse(str) : fallback;
    }
    catch (e) {
        return fallback;
    }
};
function setupMediaIndoorRoutes(app, broadcastEvent, requireMaster) {
    // ==========================================
    // CONFIGURAÇÕES GERAIS DE MÍDIA INDOOR
    // ==========================================
    app.get('/api/media/settings', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const ativaRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'midia_indoor_ativa'").get();
            const layoutRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'midia_indoor_layout'").get();
            res.json({
                midia_indoor_ativa: ativaRow ? ativaRow.valor === '1' : true,
                midia_indoor_layout: layoutRow ? layoutRow.valor : 'lateral'
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/media/settings', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { midia_indoor_ativa, midia_indoor_layout } = req.body;
            if (typeof midia_indoor_ativa === 'boolean') {
                db.prepare("UPDATE configuracoes SET valor = ?, atualizado_em = datetime('now') WHERE chave = 'midia_indoor_ativa'").run(midia_indoor_ativa ? '1' : '0');
            }
            if (midia_indoor_layout) {
                const acceptedLayouts = ['lateral', 'rodape', 'background', 'full'];
                if (!acceptedLayouts.includes(midia_indoor_layout)) {
                    return res.status(400).json({ error: 'Layout inválido. Valores aceitos: lateral, rodape, background, full' });
                }
                db.prepare("UPDATE configuracoes SET valor = ?, atualizado_em = datetime('now') WHERE chave = 'midia_indoor_layout'").run(midia_indoor_layout);
            }
            broadcastEvent('MEDIA_SETTINGS_UPDATED', { midia_indoor_ativa, midia_indoor_layout });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ==========================================
    // CONTEÚDOS (ITEMS)
    // ==========================================
    app.get('/api/media/items', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const items = db.prepare('SELECT * FROM media_items ORDER BY priority DESC, sort_order ASC').all();
            // Parse metadata_json for convenience
            const parsedItems = items.map((i) => ({
                ...i,
                metadata: safeJsonParse(i.metadata_json),
                is_active: i.is_active === 1
            }));
            res.json(parsedItems);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/media/items', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { title, type, source_url, local_path, duration_seconds, sort_order, is_active, start_at, end_at, weekdays, campaign_id, priority, metadata } = req.body;
            const info = db.prepare(`
        INSERT INTO media_items (title, type, source_url, local_path, duration_seconds, sort_order, is_active, start_at, end_at, weekdays, campaign_id, priority, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(title, type, source_url || null, local_path || null, duration_seconds || 15, sort_order || 0, is_active ? 1 : 0, start_at || null, end_at || null, weekdays || null, campaign_id || null, priority || 0, metadata ? JSON.stringify(metadata) : null);
            broadcastEvent('MEDIA_ITEMS_UPDATED', { action: 'create' });
            res.json({ success: true, id: info.lastInsertRowid });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/media/items/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { title, type, source_url, local_path, duration_seconds, sort_order, is_active, start_at, end_at, weekdays, campaign_id, priority, metadata } = req.body;
            db.prepare(`
        UPDATE media_items 
        SET title = ?, type = ?, source_url = ?, local_path = ?, duration_seconds = ?, sort_order = ?, is_active = ?, start_at = ?, end_at = ?, weekdays = ?, campaign_id = ?, priority = ?, metadata_json = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(title, type, source_url || null, local_path || null, duration_seconds || 15, sort_order || 0, is_active ? 1 : 0, start_at || null, end_at || null, weekdays || null, campaign_id || null, priority || 0, metadata ? JSON.stringify(metadata) : null, req.params.id);
            broadcastEvent('MEDIA_ITEMS_UPDATED', { action: 'update', id: req.params.id });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/media/items/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            db.prepare('DELETE FROM media_items WHERE id = ?').run(req.params.id);
            broadcastEvent('MEDIA_ITEMS_UPDATED', { action: 'delete', id: req.params.id });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ==========================================
    // CAMPANHAS
    // ==========================================
    app.get('/api/media/campaigns', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const campaigns = db.prepare('SELECT * FROM media_campaigns ORDER BY priority DESC, created_at DESC').all();
            res.json(campaigns.map((c) => ({
                ...c,
                is_active: c.is_active === 1,
                replace_default_schedule: c.replace_default_schedule === 1
            })));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/media/campaigns', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { name, description, is_active, starts_at, ends_at, priority, theme_id, replace_default_schedule } = req.body;
            const info = db.prepare(`
        INSERT INTO media_campaigns (name, description, is_active, starts_at, ends_at, priority, theme_id, replace_default_schedule)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, description || null, is_active ? 1 : 0, starts_at || null, ends_at || null, priority || 0, theme_id || null, replace_default_schedule ? 1 : 0);
            broadcastEvent('MEDIA_CAMPAIGN_UPDATED', { action: 'create' });
            res.json({ success: true, id: info.lastInsertRowid });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/media/campaigns/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { name, description, is_active, starts_at, ends_at, priority, theme_id, replace_default_schedule } = req.body;
            db.prepare(`
        UPDATE media_campaigns 
        SET name = ?, description = ?, is_active = ?, starts_at = ?, ends_at = ?, priority = ?, theme_id = ?, replace_default_schedule = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(name, description || null, is_active ? 1 : 0, starts_at || null, ends_at || null, priority || 0, theme_id || null, replace_default_schedule ? 1 : 0, req.params.id);
            broadcastEvent('MEDIA_CAMPAIGN_UPDATED', { action: 'update', id: req.params.id });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/media/campaigns/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            db.prepare('DELETE FROM media_campaigns WHERE id = ?').run(req.params.id);
            db.prepare('UPDATE media_items SET campaign_id = NULL WHERE campaign_id = ?').run(req.params.id);
            broadcastEvent('MEDIA_CAMPAIGN_UPDATED', { action: 'delete', id: req.params.id });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ==========================================
    // TEMAS
    // ==========================================
    // Similar implementation... I will simplify.
    app.get('/api/media/themes', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const themes = db.prepare('SELECT * FROM media_themes ORDER BY created_at DESC').all();
            res.json(themes.map((t) => ({
                ...t,
                is_active: t.is_active === 1,
                custom_css: safeJsonParse(t.custom_css_json)
            })));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/media/themes', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { name, type, primary_color, secondary_color, background_image, overlay_image, logo_path, custom_css, is_active, starts_at, ends_at } = req.body;
            const info = db.prepare(`
        INSERT INTO media_themes (name, type, primary_color, secondary_color, background_image, overlay_image, logo_path, custom_css_json, is_active, starts_at, ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, type || 'custom', primary_color || null, secondary_color || null, background_image || null, overlay_image || null, logo_path || null, custom_css ? JSON.stringify(custom_css) : null, is_active ? 1 : 0, starts_at || null, ends_at || null);
            broadcastEvent('MEDIA_THEME_UPDATED', { action: 'create' });
            res.json({ success: true, id: info.lastInsertRowid });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/media/themes/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { name, type, primary_color, secondary_color, background_image, overlay_image, logo_path, custom_css, is_active, starts_at, ends_at } = req.body;
            db.prepare(`
        UPDATE media_themes 
        SET name = ?, type = ?, primary_color = ?, secondary_color = ?, background_image = ?, overlay_image = ?, logo_path = ?, custom_css_json = ?, is_active = ?, starts_at = ?, ends_at = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(name, type || 'custom', primary_color || null, secondary_color || null, background_image || null, overlay_image || null, logo_path || null, custom_css ? JSON.stringify(custom_css) : null, is_active ? 1 : 0, starts_at || null, ends_at || null, req.params.id);
            broadcastEvent('MEDIA_THEME_UPDATED', { action: 'update', id: req.params.id });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/media/themes/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            db.prepare('DELETE FROM media_themes WHERE id = ?').run(req.params.id);
            db.prepare('UPDATE media_campaigns SET theme_id = NULL WHERE theme_id = ?').run(req.params.id);
            broadcastEvent('MEDIA_THEME_UPDATED', { action: 'delete', id: req.params.id });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ==========================================
    // PLAYLIST ATIVA
    // ==========================================
    app.get('/api/media/active-playlist', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            // 1. Verificar configuração principal
            const ativaRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'midia_indoor_ativa'").get();
            if (!ativaRow || ativaRow.valor !== '1') {
                return res.json({ active: false, items: [], theme: null });
            }
            // 2. Buscar campanha ativa com maior prioridade
            const activeCampaign = db.prepare(`
        SELECT * FROM media_campaigns 
        WHERE is_active = 1 
          AND (starts_at IS NULL OR starts_at <= datetime('now', 'localtime'))
          AND (ends_at IS NULL OR ends_at >= datetime('now', 'localtime'))
        ORDER BY priority DESC, created_at DESC
        LIMIT 1
      `).get();
            let items = [];
            let theme = null;
            if (activeCampaign) {
                // Se a campanha substitui a programação padrão, pegamos só itens da campanha.
                if (activeCampaign.replace_default_schedule === 1) {
                    items = db.prepare(`
            SELECT * FROM media_items 
            WHERE is_active = 1 AND campaign_id = ?
            ORDER BY sort_order ASC
          `).all(activeCampaign.id);
                }
                else {
                    // Mistura itens da campanha e itens padrão
                    items = db.prepare(`
            SELECT * FROM media_items 
            WHERE is_active = 1 
              AND (
                (campaign_id = ?)
                OR 
                (campaign_id IS NULL 
                 AND (start_at IS NULL OR start_at <= datetime('now', 'localtime'))
                 AND (end_at IS NULL OR end_at >= datetime('now', 'localtime')))
              )
            ORDER BY priority DESC, sort_order ASC
          `).all(activeCampaign.id);
                }
                // Buscar tema associado, se houver
                if (activeCampaign.theme_id) {
                    theme = db.prepare('SELECT * FROM media_themes WHERE id = ? AND is_active = 1').get(activeCampaign.theme_id);
                    if (theme && theme.custom_css_json)
                        theme.custom_css = safeJsonParse(theme.custom_css_json);
                }
            }
            else {
                // Sem campanha ativa, buscar itens padrão (sem campanha)
                items = db.prepare(`
          SELECT * FROM media_items 
          WHERE is_active = 1 AND campaign_id IS NULL
            AND (start_at IS NULL OR start_at <= datetime('now', 'localtime'))
            AND (end_at IS NULL OR end_at >= datetime('now', 'localtime'))
          ORDER BY priority DESC, sort_order ASC
        `).all();
            }
            // Verificar também tema ativo global se não veio de campanha
            if (!theme) {
                theme = db.prepare(`
          SELECT * FROM media_themes 
          WHERE is_active = 1
            AND (starts_at IS NULL OR starts_at <= datetime('now', 'localtime'))
            AND (ends_at IS NULL OR ends_at >= datetime('now', 'localtime'))
          ORDER BY created_at DESC
          LIMIT 1
        `).get();
                if (theme && theme.custom_css_json)
                    theme.custom_css = safeJsonParse(theme.custom_css_json);
            }
            res.json({
                active: true,
                campaign: activeCampaign || null,
                theme: theme || null,
                items: items.map(i => ({ ...i, metadata: safeJsonParse(i.metadata_json) }))
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ==========================================
    // PREVISÃO DO TEMPO (OPEN-METEO COM CACHE)
    // ==========================================
    app.get('/api/media/weather', async (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            let lat = -23.55; // Default: São Paulo
            let lng = -46.63;
            if (req.query.lat && req.query.lon) {
                lat = parseFloat(req.query.lat);
                lng = parseFloat(req.query.lon);
            }
            else {
                const latRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'clima_latitude'").get();
                const lngRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'clima_longitude'").get();
                if (latRow && lngRow) {
                    lat = parseFloat(latRow.valor);
                    lng = parseFloat(lngRow.valor);
                }
            }
            // Checar se temos cache recente (menos de 30 min)
            const cache = db.prepare(`
        SELECT * FROM weather_cache 
        WHERE latitude = ? AND longitude = ? 
        ORDER BY updated_at DESC LIMIT 1
      `).get(lat, lng);
            const thirtyMinsAgo = new Date(Date.now() - 30 * 60000);
            if (cache && new Date(cache.updated_at) > thirtyMinsAgo) {
                return res.json({ ...safeJsonParse(cache.data_json), fromCache: true });
            }
            // Tentar buscar do Open-Meteo
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (response.ok) {
                    const data = await response.json();
                    // Salvar no cache
                    db.prepare(`
            INSERT INTO weather_cache (latitude, longitude, data_json, updated_at) 
            VALUES (?, ?, ?, datetime('now', 'localtime'))
          `).run(lat, lng, JSON.stringify(data));
                    return res.json({ ...data, fromCache: false });
                }
            }
            catch (fetchErr) {
                console.error('Erro ao buscar Open-Meteo:', fetchErr);
            }
            // Se falhou e tem cache, retorna o cache antigo
            if (cache) {
                return res.json({ ...safeJsonParse(cache.data_json), fromCache: true, stale: true });
            }
            // Se não tem cache e falhou
            res.status(503).json({ error: 'Não foi possível buscar a previsão do tempo.' });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}
