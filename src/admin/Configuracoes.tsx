import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { SOUND_OPTIONS, playNotificationSound } from '../shared/sounds';
import { AlertTriangle } from 'lucide-react';

export default function Configuracoes() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printers, setPrinters] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [isMasterServer, setIsMasterServer] = useState(true);
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
    print_logo: '1',
    print_escrita: '1',
    print_qrcode: '1',
    backup_incluir_config: '1',
    backup_incluir_operadores: '1',
    backup_incluir_balcoes: '1',
    backup_incluir_midias: '1',
    backup_agendado_ativo: '0',
    backup_frequencia: 'diario',
    backup_destino: '',
  });

  useEffect(() => {
    fetchAdminStatus();
    fetchConfig();
    fetchBackups();
    if ((window as any).api?.getPrinters) {
      (window as any).api.getPrinters().then((list: any[]) => {
        setPrinters(list);
      });
    }
  }, []);

  const fetchAdminStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/status`);
      if (res.ok) {
        const data = await res.json();
        setIsMasterServer(data.isMaster);
      }
    } catch (err) {
      console.error('Erro ao verificar status de admin:', err);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/backups?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (err) {
      console.error('Erro ao listar backups', err);
    }
  };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`);
      const data = await res.json();
      if (Object.keys(data).length > 0) {
        let mergedData = { ...data };
        
        // Se estiver rodando no Electron, carrega as configurações locais de impressora do banco local
        if ((window as any).api?.getPrinterConfig) {
          try {
            const localPrinter = await (window as any).api.getPrinterConfig();
            if (localPrinter) {
              mergedData.impressora_interface = localPrinter.interface || '';
              mergedData.impressora_type = localPrinter.type || 'EPSON';
              mergedData.impressora_width = String(localPrinter.width || '48');
            }
          } catch (err) {
            console.error('Erro ao carregar configurações de impressora local:', err);
          }
        }
        
        setConfig(prev => ({ ...prev, ...mergedData }));
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
      const params = new URLSearchParams({
        config: config.backup_incluir_config || '1',
        operadores: config.backup_incluir_operadores || '1',
        balcoes: config.backup_incluir_balcoes || '1',
        midias: config.backup_incluir_midias || '0',
      });
      const res = await fetch(`${API_URL}/api/admin/backup?${params.toString()}`);
      if (!res.ok) throw new Error('Erro ao gerar backup');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_chamaai_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Erro ao gerar backup.');
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Deseja restaurar este backup manual (.zip)? Isso substituirá as configurações atuais e o sistema será reiniciado.')) return;
    
    const formData = new FormData();
    formData.append('backupFile', file);
    
    try {
      const res = await fetch(`${API_URL}/api/admin/restore`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        alert('Sistema restaurado com sucesso! Recarregando...');
        window.location.reload();
      } else {
        const data = await res.json();
        alert(`Erro ao restaurar: ${data.error}`);
      }
    } catch (err) {
      alert('Erro de conexão ao restaurar backup.');
    }
  };

  const handleRestoreLocal = async (filename: string) => {
    if (!confirm(`Restaurar o backup "${filename}"? Todos os dados atuais serão sobrescritos.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/backups/${filename}/restore`, { method: 'POST' });
      if (res.ok) {
        alert('Backup restaurado com sucesso! Recarregando...');
        window.location.reload();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.error}`);
      }
    } catch (e) {
      alert('Erro de conexão ao restaurar.');
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Tem certeza que deseja excluir permanentemente o backup "${filename}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/backups/${filename}`, { method: 'DELETE' });
      if (res.ok) {
        fetchBackups();
      }
    } catch (e) {
      alert('Erro de conexão ao excluir.');
    }
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
        {/* Master Server Banner */}
        {!isMasterServer && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-bold text-red-800 uppercase tracking-wider">Acesso Restrito: Modo Leitura</h3>
                <div className="mt-1 text-sm text-red-700">
                  <p>Você está acessando as configurações a partir de um dispositivo cliente. Alterações administrativas só podem ser realizadas no <b>Servidor Master</b> da loja para garantir a integridade dos dados e evitar conflitos de sincronização.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <fieldset disabled={!isMasterServer} className="contents">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="font-sans text-[48px] font-bold text-ink leading-tight uppercase tracking-widest">Configurações</h1>
              <p className="text-ink-secondary mt-2 text-lg font-semibold uppercase tracking-wider">Gestão do Sistema ChamaAí</p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !isMasterServer}
              className={`px-8 py-4 bg-primary text-white rounded-xl font-bold shadow-xl transition-all outline-none uppercase tracking-widest text-sm ${saving || !isMasterServer ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-hover active:scale-95'}`}
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
                <div className="border-t border-outline-variant/30 pt-6 mt-2 flex flex-col xl:flex-row gap-6">
                  <div className="flex-1">
                    <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-4 text-xs">LAYOUT DO TICKET IMPRESSO</label>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30">
                        <span className="font-bold text-ink text-sm uppercase">Exibir Logotipo</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="print_logo" checked={config.print_logo !== '0'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30">
                        <span className="font-bold text-ink text-sm uppercase">Exibir Nome do Estabelecimento</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="print_escrita" checked={config.print_escrita !== '0'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30">
                        <span className="font-bold text-ink text-sm uppercase">Exibir QR Code</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="print_qrcode" checked={config.print_qrcode !== '0'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Preview Visual do Ticket */}
                  <div className="w-full xl:w-[280px] shrink-0 bg-surface-variant/30 border-2 border-dashed border-outline-variant/50 rounded-2xl p-4 flex flex-col items-center overflow-hidden relative">
                    <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-4 text-xs text-center">PREVIEW (SIMULAÇÃO)</label>
                    
                    {/* Boca da impressora */}
                    <div className="w-[90%] h-4 bg-ink/80 rounded-full mb-0 z-10 shadow-md relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-1 bg-black/50 rounded-full"></div>
                    </div>
                    
                    {/* Papel (Ticket) animado ao mudar qualquer config */}
                    <div 
                      key={`${config.print_logo}-${config.print_escrita}-${config.print_qrcode}-${config.nome_estabelecimento}`}
                      className="w-[80%] bg-white shadow-lg pt-4 pb-8 px-4 flex flex-col items-center gap-3 relative z-0 animate-print-slide"
                    >
                      {/* Logo */}
                      {config.print_logo !== '0' && config.logo_cliente && (
                        <img src={`${API_URL}${config.logo_cliente}`} className="h-8 object-contain grayscale opacity-80" alt="Logo Preview" />
                      )}
                      
                      {/* Nome */}
                      {config.print_escrita !== '0' && (
                        <div className="font-bold text-center text-[10px] text-black w-full break-words leading-tight">
                          {config.nome_estabelecimento || 'NOME DO ESTABELECIMENTO'}
                        </div>
                      )}
                      
                      <div className="w-full border-t-2 border-dashed border-gray-300 my-1"></div>
                      
                      {/* Senha (Mock) */}
                      <div className="text-center w-full">
                        <div className="text-[10px] text-black/70">Senha</div>
                        <div className="text-3xl font-black text-black">A001</div>
                      </div>
                      
                      <div className="w-full border-t-2 border-dashed border-gray-300 my-1"></div>

                      {/* QR Code */}
                      {config.print_qrcode !== '0' && (
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-16 h-16 bg-black p-1 flex flex-wrap gap-0.5">
                             <div className="w-full h-full bg-white grid grid-cols-4 gap-0.5 p-0.5">
                               {Array.from({ length: 16 }).map((_, i) => (
                                 <div key={i} className={`bg-black ${Math.random() > 0.4 ? 'opacity-100' : 'opacity-0'}`}></div>
                               ))}
                             </div>
                          </div>
                          <div className="text-[7px] text-black/60 text-center uppercase tracking-widest mt-1">Acompanhe pelo celular</div>
                        </div>
                      )}
                      
                      {/* Efeito serrilhado no final usando clip-path / radial-gradient */}
                      <div className="absolute -bottom-2 left-0 right-0 h-4 bg-[radial-gradient(circle,transparent_50%,#fff_50%)] bg-[length:8px_8px] bg-bottom bg-repeat-x rotate-180"></div>
                    </div>
                  </div>
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

                <button 
                  onClick={async (e) => {
                    if (!confirm('Esta ação encerrará todas as outras instâncias zumbis do ChamaAí e liberará portas de rede presas. Deseja continuar?')) return;
                    
                    const btn = e.currentTarget;
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = `
                      <div class="flex items-center gap-3 text-left">
                        <span class="material-symbols-outlined animate-spin text-error group-hover:text-white">autorenew</span>
                        <div>
                          <span class="font-bold text-xs uppercase tracking-widest block text-error group-hover:text-white">Limpando Atividades Zumbis...</span>
                          <span class="text-[10px] opacity-70 block font-normal normal-case mt-0.5 text-error group-hover:text-white">Aguarde enquanto os processos do Windows são finalizados de forma limpa.</span>
                        </div>
                      </div>
                    `;
                    btn.setAttribute('disabled', 'true');
                    btn.style.opacity = '0.7';

                    try {
                      const api = (window as any).api;
                      if (api?.killZombieProcesses) {
                        const res = await api.killZombieProcesses();
                        alert(res.message);
                      } else {
                        alert('⚠️ Esta função só está disponível no App Desktop (.exe).');
                      }
                    } catch (err) {
                      alert('Erro ao executar limpeza: ' + (err instanceof Error ? err.message : String(err)));
                    } finally {
                      btn.innerHTML = originalHTML;
                      btn.removeAttribute('disabled');
                      btn.style.opacity = '';
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 bg-error/10 rounded-xl border border-error/20 hover:bg-error hover:text-white transition-all group cursor-pointer text-error active:scale-[0.98] outline-none"
                >
                  <div className="flex items-center gap-3 text-left">
                    <span className="material-symbols-outlined">cleaning_services</span>
                    <div>
                      <span className="font-bold text-xs uppercase tracking-widest block">Matar Atividades & Destravar Instâncias</span>
                      <span className="text-[10px] opacity-70 block font-normal normal-case mt-0.5">Destrava arquivos e encerra outros processos zumbis rodando em segundo plano.</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined opacity-50 group-hover:opacity-100 transition-opacity">dangerous</span>
                </button>
              </div>
            </div>

            {/* Backup & Dados */}
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">cloud_sync</span>
                Backup & Dados
              </h2>
              <div className="space-y-6">
                {/* Escopo do Backup */}
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-3 text-xs">O QUE INCLUIR NO BACKUP</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'backup_incluir_config', label: 'Configurações', icon: 'settings' },
                      { key: 'backup_incluir_operadores', label: 'Operadores', icon: 'group' },
                      { key: 'backup_incluir_balcoes', label: 'Balcões', icon: 'point_of_sale' },
                      { key: 'backup_incluir_midias', label: 'Mídias e Imagens', icon: 'perm_media' },
                    ].map(item => (
                      <label key={item.key} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                        config[item.key] !== '0'
                          ? 'bg-primary/5 border-primary/30 text-ink'
                          : 'bg-surface-variant border-outline-variant/30 text-ink-secondary'
                      }`}>
                        <input
                          type="checkbox"
                          name={item.key}
                          checked={config[item.key] !== '0'}
                          onChange={handleChange}
                          className="w-4 h-4 rounded accent-primary shrink-0"
                        />
                        <span className="material-symbols-outlined text-lg shrink-0">{item.icon}</span>
                        <span className="font-bold text-[11px] uppercase tracking-wider">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Agendamento */}
                <div className={`border-t border-outline-variant/30 pt-6 space-y-4 transition-opacity ${
                  config.backup_incluir_config === '0' && config.backup_incluir_operadores === '0' && config.backup_incluir_balcoes === '0' && config.backup_incluir_midias === '0'
                    ? 'opacity-40 pointer-events-none' : ''
                }`}>
                  <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <div>
                      <span className="font-bold text-ink text-sm uppercase block">Agendamento Automático</span>
                      {config.backup_incluir_config === '0' && config.backup_incluir_operadores === '0' && config.backup_incluir_balcoes === '0' && config.backup_incluir_midias === '0' && (
                        <span className="text-[10px] text-error font-bold">Selecione ao menos um item acima</span>
                      )}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="backup_agendado_ativo" checked={config.backup_agendado_ativo === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                  <div>
                    <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">FREQUÊNCIA</label>
                    <select
                      name="backup_frequencia"
                      value={config.backup_frequencia || 'diario'}
                      onChange={handleChange}
                      className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                    >
                      <option value="diario">Diário</option>
                      <option value="semanal">Semanal (Domingos)</option>
                      <option value="mensal">Mensal (Dia 1º)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">DESTINO DOS BACKUPS</label>
                    <input
                      name="backup_destino"
                      value={config.backup_destino || ''}
                      onChange={handleChange}
                      placeholder="C:\ChamaAi\Backups (padrão)"
                      className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold font-mono text-sm"
                      type="text"
                    />
                  </div>
                </div>

                {/* Ações */}
                <div className="grid grid-cols-1 gap-3 pt-2">
                  <button
                    onClick={handleBackup}
                    className="w-full flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30 hover:border-primary/50 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">download</span>
                      <span className="font-bold text-ink text-xs uppercase tracking-widest">Fazer Backup Agora</span>
                    </div>
                    <span className="material-symbols-outlined text-ink-secondary opacity-20 group-hover:opacity-100 transition-opacity">chevron_right</span>
                  </button>

                  <div className="relative">
                    <input type="file" id="restore-input" className="hidden" accept=".json,.zip" onChange={handleRestore} />
                    <label
                      htmlFor="restore-input"
                      className="w-full flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30 hover:border-success/50 transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-success">upload</span>
                        <span className="font-bold text-ink text-xs uppercase tracking-widest">Restaurar de Arquivo Manual</span>
                      </div>
                      <span className="material-symbols-outlined text-ink-secondary opacity-20 group-hover:opacity-100 transition-opacity">chevron_right</span>
                    </label>
                  </div>
                </div>

                {/* Histórico de Backups */}
                {backups.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-outline-variant/30">
                    <h3 className="font-sans text-[14px] font-bold text-ink mb-4 flex items-center gap-2 uppercase tracking-wider">
                      <span className="material-symbols-outlined text-primary text-[20px]">history</span>
                      Histórico de Backups
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {backups.map((bkp, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-surface-variant/50 rounded-xl border border-outline-variant/30 hover:border-primary/30 transition-all group">
                          <div className="flex flex-col">
                            <span className="font-bold text-ink text-sm">{bkp.nome}</span>
                            <span className="text-ink-secondary text-[11px] uppercase tracking-widest">
                              {new Date(bkp.criado_em).toLocaleString()} • {bkp.tamanhoMB} MB
                            </span>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleRestoreLocal(bkp.nome)}
                              title="Restaurar"
                              className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined text-[18px]">restore</span>
                            </button>
                            <button
                              onClick={() => handleDeleteBackup(bkp.nome)}
                              title="Excluir"
                              className="p-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

        </fieldset>
      </div>
    </AdminLayout>
  );
}
