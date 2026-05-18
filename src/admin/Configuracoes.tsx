import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { SOUND_OPTIONS, playNotificationSound } from '../shared/sounds';

export default function Configuracoes() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printers, setPrinters] = useState<any[]>([]);
  const API_URL = getApiUrl();
  const [config, setConfig] = useState<Record<string, string>>({
    tempo_destaque_senha: '5',
    volume_audio: '80',
    intervalo_midia_seg: '10',
    reset_diario_automatico: '1',
    fila_normal_ativa: '1',
    fila_preferencial_ativa: '1',
    prefixo_preferencial: 'P',
    logo_cliente: '',
    nome_estabelecimento: 'ChamaAí - Atendimento',
    portal_voz_alerta: 'Feminina',
    som_personalizado: '',
    ocultar_tipo_senha: '0',
    texto_rodape: 'ChamaAí - Atendimento de Segunda a Sexta, 8h às 18h',
    mostrar_rodape: '1',
    rotulo_local: '',
    rotulo_atendimento_geral: 'Atendimento Geral',
    rotulo_atendimento_prioritario: 'Atendimento Prioritário',
    auto_launch: '0',
    impressora_interface: '',
    impressora_type: 'EPSON',
    impressora_width: '48',
    portal_cliente_url: '',
  });

  useEffect(() => {
    fetchConfig();
    if ((window as any).api?.getPrinters) {
      (window as any).api.getPrinters().then((list: any[]) => {
        setPrinters(list);
      });
    }
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`);
      const data = await res.json();
      if (Object.keys(data).length > 0) {
        setConfig(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Erro ao buscar configurações', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setConfig(prev => ({ ...prev, [name]: checked ? '1' : '0' }));
    } else {
      setConfig(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        alert('Configurações salvas com sucesso!');
        if ((window as any).api?.updatePrinterConfig) {
          await (window as any).api.updatePrinterConfig({
            interface: config.impressora_interface,
            type: config.impressora_type,
            width: config.impressora_width
          });
        }
      }
    } catch (err: any) {
      alert(`Erro de conexão: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const res = await fetch(`${API_URL}/api/configuracoes/logo`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({ ...prev, logo_cliente: data.logoPath }));
        alert('Logo atualizado com sucesso!');
      }
    } catch (err) {
      alert('Erro ao enviar logo.');
    }
  };

  const handleTestSound = () => {
    const customUrl = config.som_personalizado ? `${API_URL}${config.som_personalizado}` : undefined;
    playNotificationSound(config.tipo_som as any || 'bell', parseInt(config.volume_audio || '80'), customUrl);
  };

  const handleBackup = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/backup`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_chamaai_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
    } catch (err) {
      alert('Erro ao gerar backup.');
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Deseja restaurar este backup? Isso substituirá as configurações atuais.')) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const res = await fetch(`${API_URL}/api/admin/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          alert('Sistema restaurado com sucesso! Recarregando...');
          window.location.reload();
        }
      } catch (err) {
        alert('Erro ao restaurar backup.');
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8 font-sans font-bold text-xl uppercase tracking-widest text-ink-secondary">
          Carregando...
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto font-sans space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-sans text-[48px] font-bold text-ink leading-tight uppercase tracking-widest">Configurações</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold uppercase tracking-wider">Gestão do Sistema ChamaAí</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-8 py-4 bg-primary text-white rounded-xl font-bold shadow-xl transition-all outline-none uppercase tracking-widest text-sm ${saving ? 'opacity-50' : 'hover:bg-primary-hover active:scale-95'}`}
          >
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Esquerda: Estabelecimento */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">storefront</span>
                Estabelecimento
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">NOME DO ESTABELECIMENTO</label>
                  <input
                    name="nome_estabelecimento"
                    value={config.nome_estabelecimento || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <span className="font-bold text-ink text-sm uppercase">Atendimento Geral</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="fila_normal_ativa" checked={config.fila_normal_ativa === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <span className="font-bold text-ink text-sm uppercase">Prioritário</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="fila_preferencial_ativa" checked={config.fila_preferencial_ativa === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            {/* Telão & Personalização */}
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">tv</span>
                Telão & Interface
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">NOME DO ESTABELECIMENTO</label>
                  <input
                    name="nome_estabelecimento"
                    value={config.nome_estabelecimento || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                  <p className="text-[10px] text-ink-secondary/60 mt-1 font-medium">Aparece no portal do cliente e no telão.</p>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">TEXTO DO RODAPÉ (TELÃO)</label>
                  <input
                    name="texto_rodape"
                    value={config.texto_rodape || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                </div>
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">RÓTULO DO LOCAL (Ex: GUICHÊ, SALA)</label>
                  <input
                    name="rotulo_local"
                    value={config.rotulo_local || ''}
                    onChange={handleChange}
                    placeholder="Deixe em branco para usar o padrão"
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                </div>
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">RÓTULO ATEND. GERAL</label>
                  <input
                    name="rotulo_atendimento_geral"
                    value={config.rotulo_atendimento_geral || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                </div>
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">RÓTULO ATEND. PRIORITÁRIO</label>
                  <input
                    name="rotulo_atendimento_prioritario"
                    value={config.rotulo_atendimento_prioritario || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                </div>
                <div className="col-span-2 flex gap-4">
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30 flex-1">
                    <span className="font-bold text-ink text-sm uppercase">Mostrar Rodapé no Telão</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="mostrar_rodape" checked={config.mostrar_rodape !== '0'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30 flex-1">
                    <span className="font-bold text-ink text-sm uppercase">Ocultar Tipo no Ticket</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="ocultar_tipo_senha" checked={config.ocultar_tipo_senha === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            {/* Impressora */}
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">print</span>
                Impressora Térmica
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">SELECIONAR IMPRESSORA</label>
                  <select
                    name="impressora_interface"
                    value={config.impressora_interface || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                  >
                    <option value="">-- Simulação --</option>
                    {printers.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">VOZ DE ALERTA DO CELULAR</label>
                  <select
                    name="portal_voz_alerta"
                    value={config.portal_voz_alerta || 'Feminina'}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                  >
                    <option value="Feminina">Voz Feminina (Padrão)</option>
                    <option value="Masculina">Voz Masculina</option>
                    <option value="Apenas Beep">Apenas Som (Beep)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">URL DO PORTAL DO CLIENTE (QR CODE)</label>
                  <input
                    name="portal_cliente_url"
                    value={config.portal_cliente_url || ''}
                    onChange={handleChange}
                    placeholder="Ex: https://chamacliente.vercel.app"
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                  <p className="text-[10px] text-ink-secondary/60 mt-1 font-medium">URL do deploy na Vercel. Se vazio, o QR Code aponta para a rede local (Wi-Fi).</p>
                </div>
                <button
                  onClick={async () => {
                    const api = (window as any).api;
                    if (api?.testPrinter) {
                      try {
                        // Sincroniza a configuração atual da tela antes de testar
                        // assim o usuário não precisa salvar para testar.
                        if (api?.updatePrinterConfig) {
                          await api.updatePrinterConfig({
                            interface: config.impressora_interface,
                            type: config.impressora_type,
                            width: config.impressora_width
                          });
                        }
                        
                        const success = await api.testPrinter();
                        if (success) alert('✅ Comando enviado para a impressora!');
                        else alert('❌ Falha ao enviar comando para a impressora.');
                      } catch (err: any) {
                        alert(`❌ Erro: ${err.message}`);
                      }
                    } else {
                      alert('⚠️ Use o App Desktop (.exe) para testar a impressora.');
                    }
                  }}
                  className="w-full py-4 bg-success text-white rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-success/90 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">print</span>
                  Imprimir Ticket de Teste
                </button>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Sistema e Backup */}
          <div className="space-y-8">
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">settings_applications</span>
                Sistema
              </h2>
              <div className="space-y-6">
                <div className="p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-ink text-sm uppercase">Iniciar com Windows</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="auto_launch" 
                        checked={config.auto_launch === '1'} 
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          const route = window.location.hash.replace('#/', '') || '';
                          const api = (window as any).api;
                          if (api?.setAutoLaunch) {
                            await api.setAutoLaunch(checked, route);
                            setConfig(prev => ({ ...prev, auto_launch: checked ? '1' : '0' }));
                            handleSave();
                          }
                        }} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={async () => {
                      if ((window as any).api?.createShortcut) {
                        const res = await (window as any).api.createShortcut('totem', 'ChamaAí Totem');
                        if (res?.success) alert('Atalho do Totem criado na Área de Trabalho!');
                      }
                    }}
                    className="p-3 bg-surface-variant rounded-xl border border-outline-variant/30 font-bold text-ink text-xs uppercase hover:bg-primary/10 hover:text-primary transition-all flex flex-col items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-2xl">touch_app</span>
                    Atalho Totem
                  </button>
                  <button 
                    onClick={async () => {
                      if ((window as any).api?.createShortcut) {
                        const res = await (window as any).api.createShortcut('telao', 'ChamaAí Telão');
                        if (res?.success) alert('Atalho do Telão criado na Área de Trabalho!');
                      }
                    }}
                    className="p-3 bg-surface-variant rounded-xl border border-outline-variant/30 font-bold text-ink text-xs uppercase hover:bg-primary/10 hover:text-primary transition-all flex flex-col items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-2xl">tv</span>
                    Atalho Telão
                  </button>
                </div>

                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">TEMPO DE DESTAQUE DA SENHA (SEGUNDOS)</label>
                  <input
                    name="tempo_destaque_senha"
                    value={config.tempo_destaque_senha || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="number"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">SOM DO CHAMADO</label>
                  <div className="flex gap-2">
                    <select
                      name="tipo_som"
                      value={config.tipo_som || 'bell'}
                      onChange={handleChange}
                      className="flex-1 bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 text-ink font-semibold"
                    >
                      {SOUND_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                    </select>
                    <button onClick={handleTestSound} className="p-3 bg-primary/10 text-primary rounded-xl">
                      <span className="material-symbols-outlined">volume_up</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Atualização de Sistema */}
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">update</span>
                Atualização do Sistema
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={async () => {
                    const api = (window as any).api;
                    if (api?.checkForUpdates) {
                      const res = await api.checkForUpdates();
                      alert(res.message);
                    } else {
                      alert('⚠️ Use o App Desktop (.exe) para buscar atualizações.');
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30 hover:border-primary/50 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">search</span>
                    <span className="font-bold text-ink text-xs uppercase tracking-widest">Buscar Atualizações</span>
                  </div>
                  <span className="material-symbols-outlined text-ink-secondary opacity-20 group-hover:opacity-100 transition-opacity">chevron_right</span>
                </button>

                <button 
                  onClick={async () => {
                    if (!confirm('O sistema será fechado imediatamente para aplicar a atualização. Deseja continuar?')) return;
                    const api = (window as any).api;
                    if (api?.installUpdate) {
                      const res = await api.installUpdate();
                      if (!res.success) alert(res.message);
                    } else {
                      alert('⚠️ Use o App Desktop (.exe) para instalar atualizações.');
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 bg-primary/10 rounded-xl border border-primary/20 hover:bg-primary hover:text-white transition-all group cursor-pointer text-primary"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined">install_desktop</span>
                    <span className="font-bold text-xs uppercase tracking-widest">Instalar Atualização Agora</span>
                  </div>
                  <span className="material-symbols-outlined opacity-50 group-hover:opacity-100 transition-opacity">system_update_alt</span>
                </button>
              </div>
            </div>

            {/* Backup & Restore */}
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">cloud_sync</span>
                Backup & Dados
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={handleBackup}
                  className="w-full flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30 hover:border-primary/50 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">download</span>
                    <span className="font-bold text-ink text-xs uppercase tracking-widest">Exportar Backup</span>
                  </div>
                  <span className="material-symbols-outlined text-ink-secondary opacity-20 group-hover:opacity-100 transition-opacity">chevron_right</span>
                </button>

                <div className="relative">
                  <input type="file" id="restore-input" className="hidden" accept=".json" onChange={handleRestore} />
                  <label 
                    htmlFor="restore-input"
                    className="w-full flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30 hover:border-success/50 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-success">upload</span>
                      <span className="font-bold text-ink text-xs uppercase tracking-widest">Restaurar Backup</span>
                    </div>
                    <span className="material-symbols-outlined text-ink-secondary opacity-20 group-hover:opacity-100 transition-opacity">chevron_right</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">image</span>
                Logo
              </h2>
              <div className="flex flex-col items-center p-6 border-2 border-dashed border-outline-variant/50 rounded-2xl bg-surface-variant/30">
                {config.logo_cliente && <img src={`${API_URL}${config.logo_cliente}`} className="h-16 object-contain mb-4" />}
                <input type="file" id="logo-input" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                <label htmlFor="logo-input" className="text-primary font-bold text-sm uppercase tracking-widest cursor-pointer hover:underline">Trocar Logo</label>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AdminLayout>
  );
}
