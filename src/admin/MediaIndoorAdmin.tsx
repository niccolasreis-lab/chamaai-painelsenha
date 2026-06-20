import { useState, useEffect, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MediaItem {
  id: number;
  title: string;
  type: 'image' | 'video' | 'youtube' | 'weather' | 'url';
  source_url?: string;
  local_path?: string;
  duration_seconds: number;
  sort_order: number;
  is_active: boolean;
  start_at?: string;
  end_at?: string;
  weekdays?: string;
  campaign_id?: number | null;
  priority: number;
  metadata?: Record<string, any>;
}

interface Campaign {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  starts_at?: string;
  ends_at?: string;
  priority: number;
  theme_id?: number | null;
  replace_default_schedule: boolean;
}

interface Theme {
  id: number;
  name: string;
  type: 'seasonal' | 'brand' | 'custom';
  primary_color?: string;
  secondary_color?: string;
  background_image?: string;
  is_active: boolean;
  starts_at?: string;
  ends_at?: string;
}

// ─── Icons inline ─────────────────────────────────────────────────────────────
const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

// ─── Type badge colors ────────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  image:   { label: 'Imagem',      icon: 'image',           color: 'bg-blue-100 text-blue-700' },
  video:   { label: 'Vídeo',       icon: 'smart_display',   color: 'bg-purple-100 text-purple-700' },
  youtube: { label: 'YouTube',     icon: 'play_circle',     color: 'bg-red-100 text-red-700' },
  weather: { label: 'Clima',       icon: 'partly_cloudy_day',color: 'bg-sky-100 text-sky-700' },
  url:     { label: 'URL / Web',   icon: 'language',        color: 'bg-amber-100 text-amber-700' },
};

// ─── Confirm dialog helper ────────────────────────────────────────────────────
function useConfirm() {
  return (msg: string) => window.confirm(msg);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
function TabConfig({ API_URL }: { API_URL: string }) {
  const [settings, setSettings] = useState({ midia_indoor_ativa: true, midia_indoor_layout: 'lateral' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/media/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(console.error);
  }, []);

  const save = async (next: typeof settings) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/media/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) { setSettings(next); setToast('Salvo!'); setTimeout(() => setToast(''), 2000); }
    } catch { setToast('Erro ao salvar'); } finally { setSaving(false); }
  };

  const LAYOUTS = [
    { id: 'lateral',     label: 'Lateral',     desc: 'Painel lateral direito', icon: 'view_sidebar' },
    { id: 'rodape',      label: 'Rodapé',      desc: 'Barra inferior',         icon: 'view_agenda' },
    { id: 'background',  label: 'Background',  desc: 'Plano de fundo',         icon: 'wallpaper' },
    { id: 'full',        label: 'Full Screen',  desc: 'Tela cheia',             icon: 'fullscreen' },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-6 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold shadow-xl z-50 text-sm uppercase tracking-widest">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between p-6 bg-surface-variant rounded-2xl border border-outline-variant/40">
        <div>
          <h3 className="font-bold text-lg text-ink">Mídia Indoor Ativada</h3>
          <p className="text-sm text-ink-secondary mt-1">Se desativado, o telão exibirá apenas o painel de senhas.</p>
        </div>
        <button
          disabled={saving}
          onClick={() => save({ ...settings, midia_indoor_ativa: !settings.midia_indoor_ativa })}
          className={`w-14 h-8 flex items-center rounded-full p-1 transition-all duration-200 ${settings.midia_indoor_ativa ? 'bg-primary' : 'bg-outline-variant'}`}
        >
          <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-200 ${settings.midia_indoor_ativa ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      <div className="p-6 bg-surface-variant rounded-2xl border border-outline-variant/40">
        <h3 className="font-bold text-lg text-ink mb-1">Layout de Exibição</h3>
        <p className="text-sm text-ink-secondary mb-5">Escolha como a Mídia Indoor aparecerá na tela do Telão.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {LAYOUTS.map(l => (
            <button
              key={l.id}
              disabled={saving}
              onClick={() => save({ ...settings, midia_indoor_layout: l.id })}
              className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                settings.midia_indoor_layout === l.id
                  ? 'border-primary bg-primary/10 text-primary shadow-sm'
                  : 'border-outline-variant/40 hover:border-primary/40 text-ink-secondary hover:bg-surface'
              }`}
            >
              <Icon name={l.icon} className="text-3xl" />
              <div className="text-center">
                <div className="font-bold text-sm uppercase tracking-wide">{l.label}</div>
                <div className="text-xs opacity-60 mt-0.5">{l.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CONTEÚDO (ITEMS)
// ═══════════════════════════════════════════════════════════════════════════════
const BLANK_ITEM: Omit<MediaItem, 'id'> = {
  title: '', type: 'image', source_url: '', duration_seconds: 15,
  sort_order: 0, is_active: true, priority: 0, campaign_id: null,
};

function TabItems({ API_URL, campaigns }: { API_URL: string; campaigns: Campaign[] }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [form, setForm] = useState<Omit<MediaItem, 'id'>>(BLANK_ITEM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const fetchItems = () => {
    setLoading(true);
    fetch(`${API_URL}/api/media/items`)
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(fetchItems, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const openCreate = () => { setForm(BLANK_ITEM); setEditing(null); setUploadFile(null); setShowForm(true); };
  const openEdit = (item: MediaItem) => {
    setForm({ ...item }); setEditing(item); setUploadFile(null); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert('Informe um título.'); return; }
    setSaving(true);
    try {
      // Se tem arquivo local para upload, envia pelo endpoint de mídias clássicas
      if (uploadFile && (form.type === 'image' || form.type === 'video')) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('nome', form.title);
        fd.append('duracao', String(form.duration_seconds));
        const up = await fetch(`${API_URL}/api/midias`, { method: 'POST', body: fd });
        if (!up.ok) throw new Error('Falha no upload');
        const upData = await up.json();
        form.local_path = upData.caminho || upData.path || '';
        form.source_url = '';
      }

      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API_URL}/api/media/items/${editing.id}` : `${API_URL}/api/media/items`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      showToast(editing ? 'Item atualizado!' : 'Item criado!');
      setShowForm(false);
      fetchItems();
    } catch (e: any) {
      showToast('Erro: ' + (e.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: MediaItem) => {
    try {
      await fetch(`${API_URL}/api/media/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, is_active: !item.is_active }),
      });
      fetchItems();
    } catch {}
  };

  const deleteItem = async (item: MediaItem) => {
    if (!confirm(`Excluir "${item.title}"?`)) return;
    await fetch(`${API_URL}/api/media/items/${item.id}`, { method: 'DELETE' });
    showToast('Excluído!');
    fetchItems();
  };

  const needsUrl = (type: string) => ['youtube', 'url', 'weather'].includes(type);
  const needsFile = (type: string) => ['image', 'video'].includes(type);

  return (
    <div className="space-y-6 relative">
      {toast && (
        <div className="fixed top-6 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold shadow-xl z-50 text-sm uppercase tracking-widest">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink uppercase tracking-wide">Conteúdos</h2>
          <p className="text-ink-secondary text-sm mt-1">{items.length} item(s) cadastrado(s)</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Icon name="add" className="text-lg" /> Novo Conteúdo
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 flex items-center justify-center gap-3 text-ink-secondary text-sm font-bold uppercase tracking-widest">
          <Icon name="refresh" className="animate-spin" /> Carregando...
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4 text-ink-secondary/40">
          <Icon name="smart_display" className="text-6xl" />
          <p className="font-bold uppercase tracking-widest text-sm">Nenhum conteúdo cadastrado</p>
          <button onClick={openCreate} className="text-primary font-bold text-sm underline">Adicionar primeiro conteúdo</button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const meta = TYPE_META[item.type] || TYPE_META.url;
            return (
              <div key={item.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${item.is_active ? 'border-outline-variant/40 bg-surface hover:border-primary/30' : 'border-outline-variant/20 bg-surface-variant opacity-60'}`}>
                {/* Type icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                  <Icon name={meta.icon} className="text-2xl" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink truncate">{item.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${meta.color}`}>{meta.label}</span>
                    {item.priority > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">Prioridade {item.priority}</span>}
                    {item.campaign_id && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold">Campanha</span>}
                  </div>
                  <p className="text-xs text-ink-secondary mt-0.5 truncate">
                    {item.source_url || item.local_path || '—'} · {item.duration_seconds}s
                  </p>
                </div>

                {/* Sort order */}
                <div className="hidden md:flex flex-col items-center shrink-0">
                  <span className="text-xs text-ink-secondary uppercase font-bold tracking-wide">Ordem</span>
                  <span className="font-black text-ink text-lg">{item.sort_order}</span>
                </div>

                {/* Toggle */}
                <button onClick={() => toggleActive(item)} className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-all shrink-0 ${item.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${item.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(item)} className="p-2 rounded-xl hover:bg-primary/10 text-ink-secondary hover:text-primary transition-colors">
                    <Icon name="edit" className="text-lg" />
                  </button>
                  <button onClick={() => deleteItem(item)} className="p-2 rounded-xl hover:bg-error/10 text-ink-secondary hover:text-error transition-colors">
                    <Icon name="delete" className="text-lg" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div 
            className="bg-surface rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
              <h3 className="text-xl font-bold text-ink uppercase tracking-wide">{editing ? 'Editar Conteúdo' : 'Novo Conteúdo'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-surface-variant rounded-xl transition-colors"><Icon name="close" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Título */}
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Título *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface"
                  placeholder="Ex: Promoção de Natal" />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, type: k as any, source_url: '', local_path: '' }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all ${form.type === k ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-ink-secondary hover:border-primary/30'}`}>
                      <Icon name={v.icon} className="text-base" />{v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* URL ou arquivo */}
              {needsUrl(form.type) && (
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">
                    {form.type === 'youtube' ? 'URL do YouTube' : form.type === 'weather' ? 'Cidade (opcional)' : 'URL da Página'}
                  </label>
                  <input value={form.source_url || ''} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface"
                    placeholder={form.type === 'youtube' ? 'https://youtube.com/watch?v=...' : form.type === 'weather' ? '-23.55,-46.63' : 'https://...'} />
                </div>
              )}

              {needsFile(form.type) && (
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Arquivo (upload)</label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-outline-variant/50 rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                  >
                    <Icon name={uploadFile ? 'check_circle' : 'upload'} className={`text-3xl mb-2 ${uploadFile ? 'text-emerald-500' : 'text-ink-secondary/50'}`} />
                    <p className="text-sm font-bold text-ink-secondary">
                      {uploadFile ? uploadFile.name : (form.local_path || 'Clique para selecionar')}
                    </p>
                    <p className="text-xs text-ink-secondary/50 mt-1">
                      {form.type === 'video' ? 'MP4, WebM, MOV' : 'JPG, PNG, GIF, WebP'}
                    </p>
                    <input ref={fileRef} type="file" className="hidden"
                      accept={form.type === 'video' ? 'video/*' : 'image/*'}
                      onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
                  </div>
                  {/* Ou URL direta */}
                  <p className="text-xs text-center text-ink-secondary my-2 font-bold">— ou informe o caminho —</p>
                  <input value={form.local_path || ''} onChange={e => setForm(f => ({ ...f, local_path: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface"
                    placeholder="/uploads/minha-imagem.jpg" />
                </div>
              )}

              {/* Duração e Ordem */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Duração (s)</label>
                  <input type="number" min={3} max={300} value={form.duration_seconds}
                    onChange={e => setForm(f => ({ ...f, duration_seconds: Number(e.target.value) }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Prioridade</label>
                  <input type="number" min={0} max={99} value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
              </div>

              {/* Campanha */}
              {campaigns.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Vincular à Campanha (opcional)</label>
                  <select value={form.campaign_id ?? ''} onChange={e => setForm(f => ({ ...f, campaign_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface">
                    <option value="">— Padrão (sem campanha) —</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Agendamento */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Início (opcional)</label>
                  <input type="datetime-local" value={form.start_at || ''}
                    onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Término (opcional)</label>
                  <input type="datetime-local" value={form.end_at || ''}
                    onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
              </div>

              {/* Ativo */}
              <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl">
                <span className="font-bold text-sm text-ink">Ativo na playlist</span>
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-all ${form.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/30 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-ink-secondary hover:bg-surface-variant transition-all">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                {saving && <Icon name="refresh" className="animate-spin text-base" />}
                {editing ? 'Salvar alterações' : 'Criar conteúdo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CAMPANHAS
// ═══════════════════════════════════════════════════════════════════════════════
const BLANK_CAMPAIGN: Omit<Campaign, 'id'> = {
  name: '', description: '', is_active: true, priority: 0, replace_default_schedule: false,
};

function TabCampaigns({ API_URL, themes, onCampaignsChange }: { API_URL: string; themes: Theme[]; onCampaignsChange: (c: Campaign[]) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState<Omit<Campaign, 'id'>>(BLANK_CAMPAIGN);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const confirm = useConfirm();

  const fetch_ = () => {
    setLoading(true);
    fetch(`${API_URL}/api/media/campaigns`)
      .then(r => r.json())
      .then(d => { const arr = Array.isArray(d) ? d : []; setCampaigns(arr); onCampaignsChange(arr); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(fetch_, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const openCreate = () => { setForm(BLANK_CAMPAIGN); setEditing(null); setShowForm(true); };
  const openEdit = (c: Campaign) => { setForm({ ...c }); setEditing(c); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Informe um nome.'); return; }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API_URL}/api/media/campaigns/${editing.id}` : `${API_URL}/api/media/campaigns`;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error('Falha');
      showToast(editing ? 'Campanha atualizada!' : 'Campanha criada!');
      setShowForm(false);
      fetch_();
    } catch { showToast('Erro ao salvar'); } finally { setSaving(false); }
  };

  const toggle = async (c: Campaign) => {
    await fetch(`${API_URL}/api/media/campaigns/${c.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, is_active: !c.is_active }),
    });
    fetch_();
  };

  const del = async (c: Campaign) => {
    if (!confirm(`Excluir campanha "${c.name}"? Os conteúdos serão desvinculados.`)) return;
    await fetch(`${API_URL}/api/media/campaigns/${c.id}`, { method: 'DELETE' });
    showToast('Excluída!'); fetch_();
  };

  return (
    <div className="space-y-6">
      {toast && <div className="fixed top-6 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold shadow-xl z-50 text-sm uppercase tracking-widest">{toast}</div>}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink uppercase tracking-wide">Campanhas</h2>
          <p className="text-ink-secondary text-sm mt-1">Organize conteúdos por evento ou período.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-primary/90 active:scale-95 transition-all">
          <Icon name="add" className="text-lg" /> Nova Campanha
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center gap-3 text-ink-secondary text-sm font-bold uppercase tracking-widest">
          <Icon name="refresh" className="animate-spin" /> Carregando...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4 text-ink-secondary/40">
          <Icon name="campaign" className="text-6xl" />
          <p className="font-bold uppercase tracking-widest text-sm">Nenhuma campanha cadastrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${c.is_active ? 'border-outline-variant/40 bg-surface' : 'border-outline-variant/20 bg-surface-variant opacity-60'}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${c.is_active ? 'bg-violet-100 text-violet-700' : 'bg-surface-variant text-ink-secondary'}`}>
                <Icon name="campaign" className="text-2xl" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-ink">{c.name}</span>
                  {c.priority > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">P{c.priority}</span>}
                  {c.replace_default_schedule && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">Substitui padrão</span>}
                </div>
                {c.description && <p className="text-xs text-ink-secondary mt-0.5 truncate">{c.description}</p>}
                {(c.starts_at || c.ends_at) && (
                  <p className="text-xs text-ink-secondary/60 mt-0.5">
                    {c.starts_at ? new Date(c.starts_at).toLocaleDateString('pt-BR') : '∞'} → {c.ends_at ? new Date(c.ends_at).toLocaleDateString('pt-BR') : '∞'}
                  </p>
                )}
              </div>
              <button onClick={() => toggle(c)} className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-all shrink-0 ${c.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${c.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(c)} className="p-2 rounded-xl hover:bg-primary/10 text-ink-secondary hover:text-primary transition-colors"><Icon name="edit" className="text-lg" /></button>
                <button onClick={() => del(c)} className="p-2 rounded-xl hover:bg-error/10 text-ink-secondary hover:text-error transition-colors"><Icon name="delete" className="text-lg" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal campanha */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div 
            className="bg-surface rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
              <h3 className="text-xl font-bold text-ink uppercase tracking-wide">{editing ? 'Editar Campanha' : 'Nova Campanha'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-surface-variant rounded-xl transition-colors"><Icon name="close" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Nome *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface"
                  placeholder="Ex: Promoção de Inverno" />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Descrição</label>
                <textarea rows={2} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface resize-none"
                  placeholder="Descreva o objetivo desta campanha..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Início</label>
                  <input type="datetime-local" value={form.starts_at || ''} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Término</label>
                  <input type="datetime-local" value={form.ends_at || ''} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Prioridade (maior = exibido primeiro)</label>
                <input type="number" min={0} max={99} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                  className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface" />
              </div>
              {themes.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Tema Visual (opcional)</label>
                  <select value={form.theme_id ?? ''} onChange={e => setForm(f => ({ ...f, theme_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface">
                    <option value="">— Sem tema específico —</option>
                    {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl">
                <div>
                  <span className="font-bold text-sm text-ink">Substituir programação padrão</span>
                  <p className="text-xs text-ink-secondary mt-0.5">Quando ativa, exibe APENAS conteúdos desta campanha.</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, replace_default_schedule: !f.replace_default_schedule }))}
                  className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-all ${form.replace_default_schedule ? 'bg-red-500' : 'bg-outline-variant'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.replace_default_schedule ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl">
                <span className="font-bold text-sm text-ink">Campanha Ativa</span>
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-all ${form.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/30 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-ink-secondary hover:bg-surface-variant transition-all">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                {saving && <Icon name="refresh" className="animate-spin text-base" />}
                {editing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: TEMAS
// ═══════════════════════════════════════════════════════════════════════════════
const BLANK_THEME: Omit<Theme, 'id'> = {
  name: '', type: 'custom', primary_color: '#2563eb', secondary_color: '#16a34a',
  background_image: '', is_active: false,
};

function TabThemes({ API_URL, onThemesChange }: { API_URL: string; onThemesChange: (t: Theme[]) => void }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Theme | null>(null);
  const [form, setForm] = useState<Omit<Theme, 'id'>>(BLANK_THEME);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const confirm = useConfirm();

  const fetch_ = () => {
    setLoading(true);
    fetch(`${API_URL}/api/media/themes`)
      .then(r => r.json())
      .then(d => { const arr = Array.isArray(d) ? d : []; setThemes(arr); onThemesChange(arr); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(fetch_, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const openCreate = () => { setForm(BLANK_THEME); setEditing(null); setShowForm(true); };
  const openEdit = (t: Theme) => { setForm({ ...t }); setEditing(t); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Informe um nome.'); return; }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API_URL}/api/media/themes/${editing.id}` : `${API_URL}/api/media/themes`;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error('Falha');
      showToast(editing ? 'Tema atualizado!' : 'Tema criado!');
      setShowForm(false); fetch_();
    } catch { showToast('Erro ao salvar'); } finally { setSaving(false); }
  };

  const toggle = async (t: Theme) => {
    await fetch(`${API_URL}/api/media/themes/${t.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...t, is_active: !t.is_active }),
    });
    fetch_();
  };

  const del = async (t: Theme) => {
    if (!confirm(`Excluir tema "${t.name}"?`)) return;
    await fetch(`${API_URL}/api/media/themes/${t.id}`, { method: 'DELETE' });
    showToast('Excluído!'); fetch_();
  };

  const TYPE_LABELS: Record<string, string> = { seasonal: 'Sazonal', brand: 'Marca', custom: 'Personalizado' };

  return (
    <div className="space-y-6">
      {toast && <div className="fixed top-6 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold shadow-xl z-50 text-sm uppercase tracking-widest">{toast}</div>}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink uppercase tracking-wide">Temas Visuais</h2>
          <p className="text-ink-secondary text-sm mt-1">Personalize cores e visual do Telão por campanha ou período.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-primary/90 active:scale-95 transition-all">
          <Icon name="add" className="text-lg" /> Novo Tema
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center gap-3 text-ink-secondary text-sm font-bold uppercase tracking-widest">
          <Icon name="refresh" className="animate-spin" /> Carregando...
        </div>
      ) : themes.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4 text-ink-secondary/40">
          <Icon name="palette" className="text-6xl" />
          <p className="font-bold uppercase tracking-widest text-sm">Nenhum tema cadastrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {themes.map(t => (
            <div key={t.id} className={`rounded-2xl border overflow-hidden transition-all ${t.is_active ? 'border-primary/40 shadow-md' : 'border-outline-variant/30 opacity-70'}`}>
              {/* Color preview strip */}
              <div className="h-3 w-full" style={{ background: `linear-gradient(90deg, ${t.primary_color || '#2563eb'}, ${t.secondary_color || '#16a34a'})` }} />
              <div className="p-4 bg-surface">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink">{t.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-variant text-ink-secondary font-bold">{TYPE_LABELS[t.type] || t.type}</span>
                      {t.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">Ativo</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="w-5 h-5 rounded-full border border-white shadow-sm" style={{ background: t.primary_color || '#2563eb' }} title="Cor primária" />
                      <div className="w-5 h-5 rounded-full border border-white shadow-sm" style={{ background: t.secondary_color || '#16a34a' }} title="Cor secundária" />
                      <span className="text-xs text-ink-secondary font-mono">{t.primary_color}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggle(t)} className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-all ${t.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${t.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-xl hover:bg-primary/10 text-ink-secondary hover:text-primary transition-colors"><Icon name="edit" className="text-base" /></button>
                    <button onClick={() => del(t)} className="p-1.5 rounded-xl hover:bg-error/10 text-ink-secondary hover:text-error transition-colors"><Icon name="delete" className="text-base" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal tema */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div 
            className="bg-surface rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
              <h3 className="text-xl font-bold text-ink uppercase tracking-wide">{editing ? 'Editar Tema' : 'Novo Tema'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-surface-variant rounded-xl transition-colors"><Icon name="close" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Nome *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface"
                  placeholder="Ex: Natal 2025" />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Tipo</label>
                <div className="flex gap-2">
                  {(['seasonal', 'brand', 'custom'] as const).map(tp => (
                    <button key={tp} onClick={() => setForm(f => ({ ...f, type: tp }))}
                      className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${form.type === tp ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-ink-secondary hover:border-primary/30'}`}>
                      {TYPE_LABELS[tp]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Cor Primária</label>
                  <div className="flex items-center gap-3 border border-outline-variant/50 rounded-xl px-3 py-2 bg-surface">
                    <input type="color" value={form.primary_color || '#2563eb'} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" />
                    <span className="font-mono text-sm text-ink-secondary">{form.primary_color}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Cor Secundária</label>
                  <div className="flex items-center gap-3 border border-outline-variant/50 rounded-xl px-3 py-2 bg-surface">
                    <input type="color" value={form.secondary_color || '#16a34a'} onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" />
                    <span className="font-mono text-sm text-ink-secondary">{form.secondary_color}</span>
                  </div>
                </div>
              </div>
              {/* Preview strip */}
              <div className="h-4 rounded-full w-full" style={{ background: `linear-gradient(90deg, ${form.primary_color || '#2563eb'}, ${form.secondary_color || '#16a34a'})` }} />

              <div>
                <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Imagem de Fundo (URL ou caminho)</label>
                <input value={form.background_image || ''} onChange={e => setForm(f => ({ ...f, background_image: e.target.value }))}
                  className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:border-primary bg-surface"
                  placeholder="/uploads/fundo-natal.jpg" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Início</label>
                  <input type="datetime-local" value={form.starts_at || ''} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1.5">Término</label>
                  <input type="datetime-local" value={form.ends_at || ''} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                    className="w-full border border-outline-variant/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary bg-surface" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl">
                <span className="font-bold text-sm text-ink">Tema Ativo</span>
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-all ${form.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/30 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-ink-secondary hover:bg-surface-variant transition-all">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                {saving && <Icon name="refresh" className="animate-spin text-base" />}
                {editing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
type TabId = 'config' | 'items' | 'campaigns' | 'themes';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'config',    label: 'Configurações', icon: 'tune' },
  { id: 'items',     label: 'Conteúdo',      icon: 'photo_library' },
  { id: 'campaigns', label: 'Campanhas',     icon: 'campaign' },
  { id: 'themes',    label: 'Temas',         icon: 'palette' },
];

export default function MediaIndoorAdmin() {
  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const API_URL = getApiUrl();

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-8 font-sans">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-[36px] font-bold text-ink leading-tight uppercase tracking-widest">
            Mídia Indoor Inteligente
          </h1>
          <p className="text-ink-secondary text-base font-semibold">
            Gerencie vídeos, imagens, YouTube, clima e campanhas de exibição no Telão.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-outline-variant/30 pb-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:bg-surface-variant'
              }`}
            >
              <Icon name={tab.icon} className="text-base" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-surface p-8 rounded-3xl border border-outline-variant/50 shadow-sm min-h-[400px]">
          {activeTab === 'config' && <TabConfig API_URL={API_URL} />}
          {activeTab === 'items' && <TabItems API_URL={API_URL} campaigns={campaigns} />}
          {activeTab === 'campaigns' && <TabCampaigns API_URL={API_URL} themes={themes} onCampaignsChange={setCampaigns} />}
          {activeTab === 'themes' && <TabThemes API_URL={API_URL} onThemesChange={setThemes} />}
        </div>
      </div>
    </AdminLayout>
  );
}
