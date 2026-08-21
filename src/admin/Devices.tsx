import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import {
  Link2,
  Tv,
  Edit,
  Trash2,
  CheckSquare,
  Square
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';

export default function Devices() {
  const [teloes, setTeloes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    code: '',
    nome: '',
    modulo_painel: true,
    modulo_encarte: false,
    modulo_midia: false,
    encarte_categorias: ''
  });

  const API_URL = getApiUrl();

  const fetchAvailableCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/api/toledo/categorias`);
      if (res.ok) {
        const data = await res.json();
        const uniqueCategories = Array.from(new Set(Object.values(data)))
          .map(c => String(c).trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        setAvailableCategories(uniqueCategories);
      }
    } catch (err) {
      console.error('Erro ao buscar categorias do Toledo:', err);
    }
  };

  useEffect(() => {
    fetchTeloes();
    fetchAvailableCategories();
    const interval = setInterval(fetchTeloes, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchTeloes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/telao/list`);
      if (res.ok) {
        const data = await res.json();
        setTeloes(data);
      }
    } catch (err) {
      console.error('Erro ao buscar telões', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async (code: string) => {
    if (!confirm(`Deseja enviar comando de reinicialização para o dispositivo ${code}?`)) return;
    try {
      await fetch(`${API_URL}/api/telao/${code}/reiniciar`, { method: 'POST' });
      alert(`Comando enviado para ${code}.`);
    } catch (e) {
      alert('Erro ao reiniciar dispositivo.');
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(`Deseja desvincular e remover o dispositivo ${code}?`)) return;
    try {
      await fetch(`${API_URL}/api/telao/${code}`, { method: 'DELETE' });
      fetchTeloes();
    } catch (e) {
      alert('Erro ao remover dispositivo.');
    }
  };

  const openVincular = () => {
    setEditingCode(null);
    setFormData({
      code: '',
      nome: '',
      modulo_painel: true,
      modulo_encarte: false,
      modulo_midia: false,
      encarte_categorias: ''
    });
    setIsModalOpen(true);
  };

  const openEdit = (telao: any) => {
    setEditingCode(telao.code);
    setFormData({
      code: telao.code,
      nome: telao.nome || '',
      modulo_painel: !!telao.modulo_painel,
      modulo_encarte: !!telao.modulo_encarte,
      modulo_midia: !!telao.modulo_midia,
      encarte_categorias: telao.encarte_categorias || ''
    });
    setIsModalOpen(true);
  };

  const saveTelao = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCode) {
        // PUT
        const res = await fetch(`${API_URL}/api/telao/${editingCode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchTeloes();
        } else {
          const err = await res.json();
          alert(`Erro: ${err.error}`);
        }
      } else {
        // POST Vincular
        const res = await fetch(`${API_URL}/api/telao/vincular`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchTeloes();
        } else {
          const err = await res.json();
          alert(`Erro: ${err.error}`);
        }
      }
    } catch (err) {
      alert('Erro de conexão ao salvar telão.');
    }
  };

  const vinculados = teloes.filter(t => t.status === 'vinculado');
  const pendentes = teloes.filter(t => t.status === 'pendente');

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6 font-sans">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">Dispositivos</h1>
            <p className="text-ink-variant mt-1 text-sm">Gerencie os telões vinculados a esta loja.</p>
          </div>
          <Button 
            onClick={openVincular}
            icon={<Link2 className="h-4 w-4" />}
          >
            Vincular Novo Telão
          </Button>
        </div>

        {pendentes.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-ink mb-3 uppercase tracking-wider">Aguardando Vinculação ({pendentes.length})</h2>
            <div className="flex gap-4 flex-wrap">
              {pendentes.map(p => (
                <div key={p.code} className="bg-surface-container-low border border-outline-variant rounded-md p-4 flex items-center gap-4">
                  <div className="text-lg font-bold text-ink tracking-wider">{p.code}</div>
                  <Button size="sm" onClick={() => { openVincular(); setFormData(prev => ({...prev, code: p.code})) }}>Vincular</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="text-sm font-bold text-ink mb-3 uppercase tracking-wider border-b border-outline-variant/30 pb-2">Telões vinculados</h2>
        {loading ? (
          <StatusBadge variant="loading" />
        ) : vinculados.length === 0 ? (
          <StatusBadge variant="empty" message="Nenhum telão vinculado." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vinculados.map((device) => (
              <div key={device.code} className="bg-surface rounded-md p-6 border border-outline-variant shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-primary/10 text-primary">
                    <Tv className="h-5 w-5" />
                  </div>
                  <div className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-success/10 text-success border-success/20">
                    Ativo
                  </div>
                </div>

                <h3 className="font-sans text-lg font-bold text-ink">{device.nome || 'Sem Nome'}</h3>
                <p className="text-ink-variant font-bold text-xs uppercase tracking-wider mb-3">Código: {device.code}</p>

                <div className="space-y-2 border-t border-outline-variant/30 pt-4 flex-1">
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {device.modulo_painel ? <span className="bg-surface-container text-ink px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">Painel</span> : null}
                    {device.modulo_encarte ? <span className="bg-surface-container text-ink px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">Encarte</span> : null}
                    {device.modulo_midia ? <span className="bg-surface-container text-ink px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">Mídia</span> : null}
                  </div>
                  {device.modulo_encarte && device.encarte_categorias && (
                    <div className="mt-2 text-xs text-ink-variant font-semibold">
                      Categorias: {device.encarte_categorias}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex gap-2">
                  <Button 
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleRestart(device.code)}
                  >
                    Reiniciar
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="px-2 shrink-0" 
                    onClick={() => openEdit(device)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="danger" 
                    size="sm"
                    className="px-2 shrink-0"
                    onClick={() => handleDelete(device.code)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <Dialog 
          open={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          title={editingCode ? 'Editar Telão' : 'Vincular Telão'}
        >
          <form onSubmit={saveTelao} className="space-y-4">
            {!editingCode && (
              <Input 
                label="Código exibido no telão"
                required 
                value={formData.code}
                onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                maxLength={6}
                placeholder="Ex: ABC123"
              />
            )}
            <Input 
              label="Nome de identificação (ex: tv refeitório)"
              required 
              value={formData.nome}
              onChange={e => setFormData({...formData, nome: e.target.value})}
              placeholder="Nome do Telão"
            />
            <div className="space-y-3 pt-4 border-t border-outline-variant/30">
              <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase">Módulos ativos</label>
              
              <label className="flex items-center gap-3 p-3 bg-surface-container-low rounded-md cursor-pointer hover:border-primary border border-transparent transition-all">
                <input type="checkbox" checked={formData.modulo_painel} onChange={e => setFormData({...formData, modulo_painel: e.target.checked})} className="w-5 h-5 rounded text-primary" />
                <span className="font-semibold text-ink text-sm">Painel de Senhas</span>
              </label>
              
              <label className="flex items-center gap-3 p-3 bg-surface-container-low rounded-md cursor-pointer hover:border-primary border border-transparent transition-all">
                <input type="checkbox" checked={formData.modulo_encarte} onChange={e => setFormData({...formData, modulo_encarte: e.target.checked})} className="w-5 h-5 rounded text-primary" />
                <span className="font-semibold text-ink text-sm">Encarte digital (preços)</span>
              </label>
              
              <label className="flex items-center gap-3 p-3 bg-surface-container-low rounded-md cursor-pointer hover:border-primary border border-transparent transition-all">
                <input type="checkbox" checked={formData.modulo_midia} onChange={e => setFormData({...formData, modulo_midia: e.target.checked})} className="w-5 h-5 rounded text-primary" />
                <span className="font-semibold text-ink text-sm">Mídia indoor (vídeos)</span>
              </label>
            </div>

            {formData.modulo_encarte && (
              <div className="pt-4 border-t border-outline-variant/30 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase">Selecionar categorias a exibir</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, encarte_categorias: availableCategories.join(';')})}
                      className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider bg-transparent border-none outline-none cursor-pointer"
                    >
                      Selecionar Todas
                    </button>
                    <span className="text-[10px] text-outline-variant">|</span>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, encarte_categorias: ''})}
                      className="text-[10px] font-bold text-ink-variant hover:underline uppercase tracking-wider bg-transparent border-none outline-none cursor-pointer"
                    >
                      Limpar Seleção
                    </button>
                  </div>
                </div>
                
                {availableCategories.length === 0 ? (
                  <p className="text-xs text-ink-variant italic tracking-wider">Nenhuma categoria encontrada no sistema.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-surface-container-low border border-outline-variant/30 rounded-md">
                    {availableCategories.map((cat) => {
                      const selectedList = formData.encarte_categorias
                        ? formData.encarte_categorias.split(';').map(s => s.trim())
                        : [];
                      const isSelected = selectedList.includes(cat);
                      
                      const toggleCategory = () => {
                        let newList;
                        if (isSelected) {
                          newList = selectedList.filter(s => s !== cat);
                        } else {
                          newList = [...selectedList, cat];
                        }
                        setFormData({
                          ...formData,
                          encarte_categorias: newList.filter(Boolean).join(';')
                        });
                      };
                      
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={toggleCategory}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border font-semibold text-xs transition-all text-left outline-none ${
                            isSelected
                              ? 'bg-primary text-on-primary border-primary shadow-sm'
                              : 'bg-surface hover:bg-surface-container border-outline-variant text-ink'
                          }`}
                        >
                          {isSelected ? <CheckSquare className="h-4 w-4 shrink-0 text-white" /> : <Square className="h-4 w-4 shrink-0 text-ink-variant" />}
                          <span className="truncate">{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-ink-variant font-semibold tracking-wider leading-relaxed">* caso nenhuma categoria esteja selecionada, o telão exibirá todas as categorias do sistema automaticamente.</p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full mt-6"
            >
              Salvar Configuração
            </Button>
          </form>
        </Dialog>
      )}
    </AdminLayout>
  );
}
