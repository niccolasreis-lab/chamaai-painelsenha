import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import {
  Settings,
  Image as ImageIcon,
  Megaphone,
  Music2,
  Palette,
  Sidebar,
  Layout,
  Maximize,
  Plus,
  RefreshCw,
  Edit,
  Trash2,
  Upload,
  Play,
  PlayCircle,
  CloudSun,
  Globe
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';
import VignetteSchedulerAdmin from './VignetteSchedulerAdmin';

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
  metadata?: Record<string, unknown>;
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

// ─── Type badge colors ────────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  image:   { label: 'Imagem',      icon: <ImageIcon className="h-5 w-5" />,   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  video:   { label: 'Vídeo',       icon: <Play className="h-5 w-5" />,        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  youtube: { label: 'YouTube',     icon: <PlayCircle className="h-5 w-5" />,  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  weather: { label: 'Clima',       icon: <CloudSun className="h-5 w-5" />,    color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  url:     { label: 'URL / Web',   icon: <Globe className="h-5 w-5" />,       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
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
  }, [API_URL]);

  const save = async (next: typeof settings) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/media/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) { 
        setSettings(next); 
        setToast('Salvo!'); 
        setTimeout(() => setToast(''), 2000); 
      }
    } catch { 
      setToast('Erro ao salvar'); 
    } finally { 
      setSaving(false); 
    }
  };

  const LAYOUTS = [
    { id: 'lateral',     label: 'Lateral',     desc: 'Painel lateral direito', icon: <Sidebar className="h-6 w-6" /> },
    { id: 'rodape',      label: 'Rodapé',      desc: 'Barra inferior',         icon: <Layout className="h-6 w-6" /> },
    { id: 'background',  label: 'Background',  desc: 'Plano de fundo',         icon: <ImageIcon className="h-6 w-6" /> },
    { id: 'full',        label: 'Full Screen',  desc: 'Tela cheia',             icon: <Maximize className="h-6 w-6" /> },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-6 right-6 bg-emerald-600 text-white px-4 py-2.5 rounded-sm font-bold shadow-md z-50 text-xs uppercase tracking-wider">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-md border border-outline-variant">
        <div>
          <h3 className="font-bold text-base text-ink">Mídia Indoor Ativada</h3>
          <p className="text-xs text-ink-variant mt-0.5">Se desativado, o telão exibirá apenas o painel de senhas.</p>
        </div>
        <button
          disabled={saving}
          type="button"
          onClick={() => save({ ...settings, midia_indoor_ativa: !settings.midia_indoor_ativa })}
          className={`w-12 h-7 flex items-center rounded-full p-1 transition-all duration-200 ${settings.midia_indoor_ativa ? 'bg-primary' : 'bg-outline-variant'}`}
        >
          <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${settings.midia_indoor_ativa ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      <div className="p-4 bg-surface-container-low rounded-md border border-outline-variant">
        <h3 className="font-bold text-base text-ink mb-0.5">Layout de Exibição</h3>
        <p className="text-xs text-ink-variant mb-4">Escolha como a Mídia Indoor aparecerá na tela do Telão.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {LAYOUTS.map(l => (
            <button
              key={l.id}
              type="button"
              disabled={saving}
              onClick={() => save({ ...settings, midia_indoor_layout: l.id })}
              className={`flex flex-col items-center gap-2.5 p-4 rounded-md border transition-all ${
                settings.midia_indoor_layout === l.id
                  ? 'border-primary bg-primary/5 text-primary shadow-sm'
                  : 'border-outline-variant hover:border-primary/50 text-ink-variant hover:bg-surface-container-high'
              }`}
            >
              {l.icon}
              <div className="text-center">
                <div className="font-bold text-xs uppercase tracking-wider">{l.label}</div>
                <div className="text-[10px] opacity-75 mt-0.5">{l.desc}</div>
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

  const fetchItems = useCallback(() => {
    setLoading(true);
    fetch(API_URL + '/api/media/items')
      .then((response) => response.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [API_URL]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const openCreate = () => { setForm(BLANK_ITEM); setEditing(null); setUploadFile(null); setShowForm(true); };
  const openEdit = (item: MediaItem) => {
    setForm({ ...item }); setEditing(item); setUploadFile(null); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert('Informe um título.'); return; }
    setSaving(true);
    let submissionForm = { ...form };
    try {
      if (uploadFile && (form.type === 'image' || form.type === 'video')) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('nome', form.title);
        fd.append('duracao', String(form.duration_seconds));
        const up = await fetch(`${API_URL}/api/midias`, { method: 'POST', body: fd });
        if (!up.ok) throw new Error('Falha no upload');
        const upData = await up.json() as { caminho?: string; path?: string };
        submissionForm = {
          ...submissionForm,
          local_path: upData.caminho || upData.path || '',
          source_url: '',
        };
      }

      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API_URL}/api/media/items/${editing.id}` : `${API_URL}/api/media/items`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionForm),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      showToast(editing ? 'Item atualizado!' : 'Item criado!');
      setShowForm(false);
      fetchItems();
    } catch (error: unknown) {
      showToast('Erro: ' + (error instanceof Error ? error.message : 'desconhecido'));
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
    } catch (error) {
      console.error('[MÍDIA INDOOR] Falha ao alternar conteúdo:', error);
    }
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
        <div className="fixed top-6 right-6 bg-emerald-600 text-white px-4 py-2.5 rounded-sm font-bold shadow-md z-50 text-xs uppercase tracking-wider">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Conteúdos</h2>
          <p className="text-xs text-ink-variant mt-0.5">{items.length} item(s) cadastrado(s)</p>
        </div>
        <Button
          onClick={openCreate}
          icon={<Plus className="h-4 w-4" />}
        >
          Novo Conteúdo
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <StatusBadge variant="loading" />
      ) : items.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-ink-variant/50">
          <Play className="h-10 w-10 text-outline" />
          <p className="font-semibold text-sm">Nenhum conteúdo cadastrado</p>
          <button onClick={openCreate} className="text-primary font-bold text-xs underline">Adicionar primeiro conteúdo</button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const meta = TYPE_META[item.type] || TYPE_META.url;
            return (
              <div key={item.id} className={`flex items-center gap-4 p-3 rounded-md border transition-all ${item.is_active ? 'border-outline-variant bg-surface hover:border-primary/50' : 'border-outline-variant/40 bg-surface-container-low opacity-60'}`}>
                {/* Type icon */}
                <div className={`w-10 h-10 rounded-sm flex items-center justify-center shrink-0 ${meta.color}`}>
                  {meta.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-ink text-sm truncate">{item.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${meta.color}`}>{meta.label}</span>
                    {item.priority > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold dark:bg-amber-900/30 dark:text-amber-300">P{item.priority}</span>}
                    {item.campaign_id && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold dark:bg-violet-900/30 dark:text-violet-300">Campanha</span>}
                  </div>
                  <p className="text-xs text-ink-variant mt-0.5 truncate">
                    {item.source_url || item.local_path || '—'} · {item.duration_seconds}s
                  </p>
                </div>

                {/* Sort order */}
                <div className="hidden md:flex flex-col items-center shrink-0 px-2 border-r border-outline-variant/50">
                  <span className="text-[10px] text-ink-variant uppercase font-bold tracking-wider">Ordem</span>
                  <span className="font-bold text-ink text-sm">{item.sort_order}</span>
                </div>

                {/* Toggle */}
                <button type="button" onClick={() => toggleActive(item)} className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-all shrink-0 ${item.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${item.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="px-2" onClick={() => openEdit(item)} title="Editar">
                    <Edit className="h-4 w-4 text-primary" />
                  </Button>
                  <Button variant="ghost" size="sm" className="px-2" onClick={() => deleteItem(item)} title="Excluir">
                    <Trash2 className="h-4 w-4 text-error" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Formulário */}
      {showForm && (
        <Dialog 
          open={showForm} 
          onClose={() => setShowForm(false)} 
          title={editing ? 'Editar Conteúdo' : 'Novo Conteúdo'}
        >
          <div className="space-y-4">
            <Input 
              label="Título *"
              value={form.title} 
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Promoção de Natal" 
            />

            <div>
              <label className="block text-xs font-bold text-ink-variant uppercase tracking-wider mb-2">Tipo</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <button 
                    key={k} 
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: k as MediaItem['type'], source_url: '', local_path: '' }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-bold transition-all ${
                      form.type === k 
                        ? 'border-primary bg-primary/5 text-primary' 
                        : 'border-outline-variant text-ink-variant hover:bg-surface-container'
                    }`}
                  >
                    {v.icon}
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {needsUrl(form.type) && (
              <Input 
                label={form.type === 'youtube' ? 'URL do YouTube' : form.type === 'weather' ? 'Cidade (opcional)' : 'URL da Página'}
                value={form.source_url || ''} 
                onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                placeholder={form.type === 'youtube' ? 'https://youtube.com/watch?v=...' : form.type === 'weather' ? '-23.55,-46.63' : 'https://...'} 
              />
            )}

            {needsFile(form.type) && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-ink-variant uppercase tracking-wider mb-1">Arquivo (upload)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-outline-variant rounded-md p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <Upload className={`h-8 w-8 mx-auto mb-2 ${uploadFile ? 'text-emerald-500' : 'text-ink-variant/50'}`} />
                  <p className="text-xs font-bold text-ink-variant">
                    {uploadFile ? uploadFile.name : (form.local_path || 'Clique para selecionar')}
                  </p>
                  <p className="text-[10px] text-ink-variant/50 mt-1">
                    {form.type === 'video' ? 'MP4, WebM, MOV' : 'JPG, PNG, GIF, WebP'}
                  </p>
                  <input ref={fileRef} type="file" className="hidden"
                    accept={form.type === 'video' ? 'video/*' : 'image/*'}
                    onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
                </div>
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-outline-variant/30"></div>
                  <span className="flex-shrink mx-4 text-xs font-bold text-ink-variant uppercase tracking-wider">ou informe o caminho</span>
                  <div className="flex-grow border-t border-outline-variant/30"></div>
                </div>
                <Input 
                  label="Caminho Local do Arquivo"
                  value={form.local_path || ''} 
                  onChange={e => setForm(f => ({ ...f, local_path: e.target.value }))}
                  placeholder="/uploads/minha-imagem.jpg" 
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input 
                type="number"
                min={3} 
                max={300}
                label="Duração (s)"
                value={form.duration_seconds}
                onChange={e => setForm(f => ({ ...f, duration_seconds: Number(e.target.value) }))}
              />
              <Input 
                type="number"
                min={0} 
                max={99}
                label="Prioridade"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
              />
            </div>

            {campaigns.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="vincularCampanha" className="text-sm font-medium text-ink">Vincular à Campanha (opcional)</label>
                <select 
                  id="vincularCampanha"
                  value={form.campaign_id ?? ''} 
                  onChange={e => setForm(f => ({ ...f, campaign_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">— Padrão (sem campanha) —</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input 
                type="datetime-local"
                label="Início (opcional)"
                value={form.start_at || ''}
                onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))}
              />
              <Input 
                type="datetime-local"
                label="Término (opcional)"
                value={form.end_at || ''}
                onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-md border border-outline-variant">
              <span className="font-bold text-sm text-ink">Ativo na playlist</span>
              <button 
                type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-all ${form.is_active ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <Button 
              variant="ghost"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving}
              icon={saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : undefined}
            >
              {editing ? 'Salvar alterações' : 'Criar conteúdo'}
            </Button>
          </div>
        </Dialog>
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

  const fetch_ = useCallback(() => {
    setLoading(true);
    fetch(API_URL + '/api/media/campaigns')
      .then((response) => response.json())
      .then((data) => {
        const nextCampaigns = Array.isArray(data) ? data : [];
        setCampaigns(nextCampaigns);
        onCampaignsChange(nextCampaigns);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [API_URL, onCampaignsChange]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch_();
  }, [fetch_]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      {toast && <div className="fixed top-6 right-6 bg-emerald-600 text-white px-4 py-2.5 rounded-sm font-bold shadow-md z-50 text-xs uppercase tracking-wider">{toast}</div>}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Campanhas</h2>
          <p className="text-xs text-ink-variant mt-0.5">Organize conteúdos por evento ou período.</p>
        </div>
        <Button 
          onClick={openCreate}
          icon={<Plus className="h-4 w-4" />}
        >
          Nova Campanha
        </Button>
      </div>

      {loading ? (
        <StatusBadge variant="loading" />
      ) : campaigns.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-ink-variant/50">
          <Megaphone className="h-10 w-10 text-outline" />
          <p className="font-semibold text-sm">Nenhuma campanha cadastrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => (
            <div key={c.id} className={`flex items-center gap-4 p-3 rounded-md border transition-all ${c.is_active ? 'border-outline-variant bg-surface' : 'border-outline-variant/40 bg-surface-container-low opacity-60'}`}>
              <div className={`w-10 h-10 rounded-sm flex items-center justify-center shrink-0 ${c.is_active ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : 'bg-surface-container text-ink-variant'}`}>
                <Megaphone className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-ink text-sm">{c.name}</span>
                  {c.priority > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold dark:bg-amber-900/30 dark:text-amber-300">P{c.priority}</span>}
                  {c.replace_default_schedule && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold dark:bg-red-900/30 dark:text-red-300">Substitui padrão</span>}
                </div>
                {c.description && <p className="text-xs text-ink-variant mt-0.5 truncate">{c.description}</p>}
                {(c.starts_at || c.ends_at) && (
                  <p className="text-[10px] text-ink-variant mt-0.5">
                    {c.starts_at ? new Date(c.starts_at).toLocaleDateString('pt-BR') : '∞'} → {c.ends_at ? new Date(c.ends_at).toLocaleDateString('pt-BR') : '∞'}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => toggle(c)} className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-all shrink-0 ${c.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${c.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="px-2" onClick={() => openEdit(c)} title="Editar"><Edit className="h-4 w-4 text-primary" /></Button>
                <Button variant="ghost" size="sm" className="px-2" onClick={() => del(c)} title="Excluir"><Trash2 className="h-4 w-4 text-error" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal campanha */}
      {showForm && (
        <Dialog 
          open={showForm} 
          onClose={() => setShowForm(false)} 
          title={editing ? 'Editar Campanha' : 'Nova Campanha'}
        >
          <div className="space-y-4">
            <Input 
              label="Nome *"
              value={form.name} 
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Promoção de Inverno" 
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="campanhaDescricao" className="text-sm font-medium text-ink">Descrição</label>
              <textarea 
                id="campanhaDescricao"
                rows={2} 
                value={form.description || ''} 
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-surface-container border border-outline-variant/50 rounded-sm px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold h-20 resize-none text-sm" 
                placeholder="Descreva o objetivo desta campanha..." 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input 
                type="datetime-local"
                label="Início"
                value={form.starts_at || ''} 
                onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
              />
              <Input 
                type="datetime-local"
                label="Término"
                value={form.ends_at || ''} 
                onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
              />
            </div>
            <Input 
              type="number"
              min={0} 
              max={99}
              label="Prioridade (maior = exibido primeiro)"
              value={form.priority} 
              onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
            />
            {themes.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="campanhaTema" className="text-sm font-medium text-ink">Tema Visual (opcional)</label>
                <select 
                  id="campanhaTema"
                  value={form.theme_id ?? ''} 
                  onChange={e => setForm(f => ({ ...f, theme_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">— Sem tema específico —</option>
                  {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-md border border-outline-variant">
              <div>
                <span className="font-bold text-sm text-ink">Substituir programação padrão</span>
                <p className="text-[10px] text-ink-variant mt-0.5">Quando ativa, exibe APENAS conteúdos desta campanha.</p>
              </div>
              <button 
                type="button"
                onClick={() => setForm(f => ({ ...f, replace_default_schedule: !f.replace_default_schedule }))}
                className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-all ${form.replace_default_schedule ? 'bg-red-500' : 'bg-outline-variant'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.replace_default_schedule ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-md border border-outline-variant">
              <span className="font-bold text-sm text-ink">Campanha Ativa</span>
              <button 
                type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-all ${form.is_active ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <Button 
              variant="ghost"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving}
              icon={saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : undefined}
            >
              {editing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: TEMAS
// ═══════════════════════════════════════════════════════════════════════════════
const BLANK_THEME: Omit<Theme, 'id'> = {
  name: '', type: 'custom', primary_color: '#3525CD', secondary_color: '#059669',
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

  const fetch_ = useCallback(() => {
    setLoading(true);
    fetch(API_URL + '/api/media/themes')
      .then((response) => response.json())
      .then((data) => {
        const nextThemes = Array.isArray(data) ? data : [];
        setThemes(nextThemes);
        onThemesChange(nextThemes);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [API_URL, onThemesChange]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch_();
  }, [fetch_]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      {toast && <div className="fixed top-6 right-6 bg-emerald-600 text-white px-4 py-2.5 rounded-sm font-bold shadow-md z-50 text-xs uppercase tracking-wider">{toast}</div>}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Temas Visuais</h2>
          <p className="text-xs text-ink-variant mt-0.5">Personalize cores e visual do Telão por campanha ou período.</p>
        </div>
        <Button 
          onClick={openCreate}
          icon={<Plus className="h-4 w-4" />}
        >
          Novo Tema
        </Button>
      </div>

      {loading ? (
        <StatusBadge variant="loading" />
      ) : themes.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-ink-variant/50">
          <Palette className="h-10 w-10 text-outline" />
          <p className="font-semibold text-sm">Nenhum tema cadastrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {themes.map(t => (
            <div key={t.id} className={`rounded-md border overflow-hidden transition-all ${t.is_active ? 'border-primary/50 shadow-md bg-surface' : 'border-outline-variant bg-surface-container-low opacity-75'}`}>
              <div className="h-2.5 w-full" style={{ background: `linear-gradient(90deg, ${t.primary_color || '#3525CD'}, ${t.secondary_color || '#059669'})` }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-ink text-sm">{t.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container text-ink-variant font-bold">{TYPE_LABELS[t.type] || t.type}</span>
                      {t.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold dark:bg-emerald-900/30 dark:text-emerald-300">Ativo</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-4.5 h-4.5 rounded-full border border-white dark:border-black shadow-sm" style={{ background: t.primary_color || '#3525CD' }} title="Cor primária" />
                      <div className="w-4.5 h-4.5 rounded-full border border-white dark:border-black shadow-sm" style={{ background: t.secondary_color || '#059669' }} title="Cor secundária" />
                      <span className="text-[10px] text-ink-variant font-mono">{t.primary_color}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => toggle(t)} className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-all ${t.is_active ? 'bg-primary' : 'bg-outline-variant'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${t.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <Button variant="ghost" size="sm" className="px-2" onClick={() => openEdit(t)} title="Editar"><Edit className="h-4 w-4 text-primary" /></Button>
                    <Button variant="ghost" size="sm" className="px-2" onClick={() => del(t)} title="Excluir"><Trash2 className="h-4 w-4 text-error" /></Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal tema */}
      {showForm && (
        <Dialog 
          open={showForm} 
          onClose={() => setShowForm(false)} 
          title={editing ? 'Editar Tema' : 'Novo Tema'}
        >
          <div className="space-y-4">
            <Input 
              label="Nome *"
              value={form.name} 
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Natal 2025" 
            />
            <div>
              <label className="block text-xs font-bold text-ink-variant uppercase tracking-wider mb-2">Tipo</label>
              <div className="flex gap-2">
                {(['seasonal', 'brand', 'custom'] as const).map(tp => (
                  <button 
                    key={tp} 
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: tp }))}
                    className={`flex-1 py-2 rounded-md border text-xs font-bold transition-all ${
                      form.type === tp 
                        ? 'border-primary bg-primary/5 text-primary' 
                        : 'border-outline-variant text-ink-variant hover:bg-surface-container'
                    }`}
                  >
                    {TYPE_LABELS[tp]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-ink-variant uppercase tracking-wider mb-1.5">Cor Primária</label>
                <div className="flex items-center gap-2 border border-outline-variant rounded-md px-2.5 py-1.5 bg-surface">
                  <input type="color" value={form.primary_color || '#3525CD'} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                    className="w-8 h-8 rounded-sm cursor-pointer border-0 bg-transparent" />
                  <span className="font-mono text-xs text-ink-variant">{form.primary_color}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-variant uppercase tracking-wider mb-1.5">Cor Secundária</label>
                <div className="flex items-center gap-2 border border-outline-variant rounded-md px-2.5 py-1.5 bg-surface">
                  <input type="color" value={form.secondary_color || '#059669'} onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                    className="w-8 h-8 rounded-sm cursor-pointer border-0 bg-transparent" />
                  <span className="font-mono text-xs text-ink-variant">{form.secondary_color}</span>
                </div>
              </div>
            </div>
            {/* Preview strip */}
            <div className="h-3 rounded-full w-full shadow-inner" style={{ background: `linear-gradient(90deg, ${form.primary_color || '#3525CD'}, ${form.secondary_color || '#059669'})` }} />

            <Input 
              label="Imagem de Fundo (URL ou caminho)"
              value={form.background_image || ''} 
              onChange={e => setForm(f => ({ ...f, background_image: e.target.value }))}
              placeholder="/uploads/fundo-natal.jpg" 
            />
            <div className="grid grid-cols-2 gap-4">
              <Input 
                type="datetime-local"
                label="Início"
                value={form.starts_at || ''} 
                onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
              />
              <Input 
                type="datetime-local"
                label="Término"
                value={form.ends_at || ''} 
                onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-md border border-outline-variant">
              <span className="font-bold text-sm text-ink">Tema Ativo</span>
              <button 
                type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-all ${form.is_active ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <Button 
              variant="ghost"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving}
              icon={saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : undefined}
            >
              {editing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
type TabId = 'config' | 'items' | 'vignettes' | 'campaigns' | 'themes';

export default function MediaIndoorAdmin() {
  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const API_URL = getApiUrl();

  const TABS = [
    { id: 'config' as const,    label: 'Configurações', icon: <Settings className="h-4 w-4" /> },
    { id: 'items' as const,     label: 'Conteúdo',      icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'vignettes' as const, label: 'Vinhetas',       icon: <Music2 className="h-4 w-4" /> },
    { id: 'campaigns' as const, label: 'Campanhas',     icon: <Megaphone className="h-4 w-4" /> },
    { id: 'themes' as const,    label: 'Temas',         icon: <Palette className="h-4 w-4" /> },
  ];

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6 font-sans">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold text-ink leading-tight">
            Mídia Indoor Inteligente
          </h1>
          <p className="text-ink-variant text-sm">
            Gerencie vídeos, imagens, YouTube, clima e campanhas de exibição no Telão.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-11 items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all outline-none whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-ink-variant hover:text-ink hover:bg-surface-container-low'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-surface p-6 rounded-md border border-outline-variant shadow-sm min-h-[350px]">
          {activeTab === 'config' && <TabConfig API_URL={API_URL} />}
          {activeTab === 'items' && <TabItems API_URL={API_URL} campaigns={campaigns} />}
          {activeTab === 'vignettes' && <VignetteSchedulerAdmin API_URL={API_URL} />}
          {activeTab === 'campaigns' && <TabCampaigns API_URL={API_URL} themes={themes} onCampaignsChange={setCampaigns} />}
          {activeTab === 'themes' && <TabThemes API_URL={API_URL} onThemesChange={setThemes} />}
        </div>
      </div>
    </AdminLayout>
  );
}
