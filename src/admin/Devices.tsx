import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

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
    encarte_categorias: '',
    template_layout: 'classic'
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
      encarte_categorias: '',
      template_layout: 'classic'
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
      encarte_categorias: telao.encarte_categorias || '',
      template_layout: telao.template_layout || 'classic'
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
      <div className="max-w-7xl mx-auto space-y-8 font-sans">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">Dispositivos</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold tracking-wider">Gerencie os telões vinculados a esta loja.</p>
          </div>
          <button 
            onClick={openVincular}
            className="bg-primary text-on-primary px-8 py-4 rounded-xl font-bold shadow-lg transition-all hover:bg-primary-hover active:scale-95 flex items-center space-x-2 outline-none uppercase tracking-widest text-sm"
          >
            <span className="material-symbols-outlined">add_link</span>
            <span>Vincular Novo Telão</span>
          </button>
        </div>

        {pendentes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-ink mb-4 uppercase tracking-widest">Aguardando Vinculação ({pendentes.length})</h2>
            <div className="flex gap-4 flex-wrap">
              {pendentes.map(p => (
                <div key={p.code} className="bg-surface-variant border border-outline-variant rounded-xl p-4 flex items-center gap-4">
                  <div className="text-2xl font-black text-ink tracking-widest">{p.code}</div>
                  <button onClick={() => { openVincular(); setFormData(prev => ({...prev, code: p.code})) }} className="bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-xs uppercase hover:bg-primary-hover">Vincular</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="text-xl font-bold text-ink mb-4 tracking-widest border-b border-outline-variant/30 pb-2">Telões vinculados</h2>
        {loading ? (
          <div className="text-ink-secondary uppercase tracking-widest">Carregando dispositivos...</div>
        ) : vinculados.length === 0 ? (
          <div className="bg-surface rounded-2xl p-8 text-center text-ink-secondary font-bold uppercase tracking-widest border border-outline-variant/50">
            Nenhum telão vinculado.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {vinculados.map((device) => (
              <div key={device.code} className="bg-surface rounded-[24px] p-6 shadow-sm border border-outline-variant/50 hover:border-primary/50 transition-all group flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-3xl">tv</span>
                  </div>
                  <div className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border bg-success/10 text-success border-success/20">
                    Ativo
                  </div>
                </div>

                <h3 className="font-sans text-xl font-bold text-ink uppercase tracking-wide">{device.nome || 'Sem Nome'}</h3>
                <p className="text-ink-secondary font-bold text-sm uppercase tracking-widest mb-4">Código: {device.code}</p>

                <div className="space-y-2 border-t border-outline-variant/30 pt-4 flex-1">
                  <div className="flex flex-wrap gap-2 mt-2">
                    {device.modulo_painel ? <span className="bg-ink/5 text-ink px-2 py-1 rounded text-[10px] font-bold">Painel</span> : null}
                    {device.modulo_encarte ? <span className="bg-ink/5 text-ink px-2 py-1 rounded text-[10px] font-bold">Encarte</span> : null}
                    {device.modulo_midia ? <span className="bg-ink/5 text-ink px-2 py-1 rounded text-[10px] font-bold">Mídia</span> : null}
                  </div>
                  <div className="text-[10px] text-ink-secondary/70 font-bold uppercase tracking-wider mt-2">
                    Layout: {device.template_layout === 'sidebar' ? 'Mídia + Fila' : device.template_layout === 'l-shape' ? 'Modo L' : 'Clássico'}
                  </div>
                  {device.modulo_encarte && device.encarte_categorias && (
                    <div className="mt-2 text-xs text-ink-secondary font-semibold">
                      Categorias: {device.encarte_categorias}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex gap-2">
                  <button 
                    onClick={() => handleRestart(device.code)}
                    className="flex-1 py-2 bg-surface-variant text-ink font-bold rounded-lg text-xs uppercase tracking-widest hover:bg-outline-variant transition-colors outline-none"
                  >
                    Reiniciar
                  </button>
                  <button onClick={() => openEdit(device)} className="p-2 text-ink bg-surface-variant rounded-lg hover:text-primary hover:bg-primary/10 transition-colors outline-none">
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                  <button onClick={() => handleDelete(device.code)} className="p-2 text-error bg-error/10 rounded-lg hover:bg-error hover:text-white transition-colors outline-none">
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans backdrop-blur-sm">
          <div className="bg-surface rounded-[32px] p-8 max-w-lg w-full shadow-2xl relative border border-outline-variant/50">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-ink-secondary hover:text-ink"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-2xl font-bold text-ink mb-6 uppercase tracking-widest">{editingCode ? 'Editar Telão' : 'Vincular Telão'}</h2>
            
            <form onSubmit={saveTelao} className="space-y-6">
              {!editingCode && (
                <div>
                  <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-2">Código exibido no telão</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.code}
                    onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 text-ink font-black tracking-widest text-xl focus:border-primary outline-none uppercase"
                    placeholder="Ex: ABC123"
                    maxLength={6}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-2">Nome de identificação (ex: tv refeitório)</label>
                <input 
                  type="text" 
                  required 
                  value={formData.nome}
                  onChange={e => setFormData({...formData, nome: e.target.value})}
                  className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 text-ink font-bold focus:border-primary outline-none"
                  placeholder="Nome do Telão"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-2">Layout do telão</label>
                <select
                  value={formData.template_layout || 'classic'}
                  onChange={e => setFormData({...formData, template_layout: e.target.value})}
                  className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 text-ink font-bold focus:border-primary outline-none"
                >
                  <option value="classic">Clássico ( classic )</option>
                  <option value="sidebar">Mídia + Fila Lateral ( sidebar )</option>
                  <option value="l-shape">Modo L ( l-shape )</option>
                </select>
              </div>

              <div className="space-y-3 pt-4 border-t border-outline-variant/30">
                <label className="block text-xs font-bold text-ink-secondary tracking-widest">Módulos ativos</label>
                
                <label className="flex items-center gap-3 p-3 bg-surface-variant rounded-xl cursor-pointer hover:border-primary border border-transparent transition-all">
                  <input type="checkbox" checked={formData.modulo_painel} onChange={e => setFormData({...formData, modulo_painel: e.target.checked})} className="w-5 h-5 rounded text-primary" />
                  <span className="font-bold text-ink uppercase tracking-wide text-sm">Painel de Senhas</span>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-surface-variant rounded-xl cursor-pointer hover:border-primary border border-transparent transition-all">
                  <input type="checkbox" checked={formData.modulo_encarte} onChange={e => setFormData({...formData, modulo_encarte: e.target.checked})} className="w-5 h-5 rounded text-primary" />
                  <span className="font-bold text-ink tracking-wide text-sm">Encarte digital (preços)</span>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-surface-variant rounded-xl cursor-pointer hover:border-primary border border-transparent transition-all">
                  <input type="checkbox" checked={formData.modulo_midia} onChange={e => setFormData({...formData, modulo_midia: e.target.checked})} className="w-5 h-5 rounded text-primary" />
                  <span className="font-bold text-ink tracking-wide text-sm">Mídia indoor (vídeos)</span>
                </label>
              </div>

              {formData.modulo_encarte && (
                <div className="pt-4 border-t border-outline-variant/30 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest">Selecionar categorias a exibir</label>
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
                        className="text-[10px] font-bold text-ink-secondary hover:underline uppercase tracking-wider bg-transparent border-none outline-none cursor-pointer"
                      >
                        Limpar Seleção
                      </button>
                    </div>
                  </div>
                  
                  {availableCategories.length === 0 ? (
                    <p className="text-xs text-ink-secondary/60 italic tracking-wider">Nenhuma categoria encontrada no sistema.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-surface-variant/50 border border-outline-variant/30 rounded-xl">
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
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border font-bold text-xs uppercase tracking-wide transition-all text-left outline-none ${
                              isSelected
                                ? 'bg-primary text-on-primary border-primary shadow-sm'
                                : 'bg-surface hover:bg-surface-variant border-outline-variant/40 text-ink'
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm shrink-0">
                              {isSelected ? 'check_box' : 'check_box_outline_blank'}
                            </span>
                            <span className="truncate">{cat}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-ink-secondary/70 font-semibold tracking-wider leading-relaxed">* caso nenhuma categoria esteja selecionada, o telão exibirá todas as categorias do sistema automaticamente.</p>
                </div>
              )}

              <button 
                type="submit" 
                className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-primary-hover active:scale-95 transition-all outline-none mt-8"
              >
                Salvar Configuração
              </button>
            </form>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}

