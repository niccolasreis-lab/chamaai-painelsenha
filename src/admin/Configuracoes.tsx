import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { SOUND_OPTIONS, playNotificationSound } from '../shared/sounds';
import { AlertTriangle } from 'lucide-react';

export default function Configuracoes() {
  const [activeTab, setActiveTab] = useState<'geral' | 'telao' | 'totem' | 'sistema' | 'seguranca'>('geral');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printers, setPrinters] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [isMasterServer, setIsMasterServer] = useState(true);
  const [hasMasterPassword, setHasMasterPassword] = useState(false);
  const [showMasterLogin, setShowMasterLogin] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [masterLoginError, setMasterLoginError] = useState('');
  const [masterLoginLoading, setMasterLoginLoading] = useState(false);
  const [isMasterRemote, setIsMasterRemote] = useState(false);
  const [newMasterPwd, setNewMasterPwd] = useState('');
  const [masterPwdMsg, setMasterPwdMsg] = useState('');
  const [restoredBackupName, setRestoredBackupName] = useState<string | null>(null);
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
    telao_arte_espera: '',
    nome_estabelecimento: 'ChamaAí - Atendimento',
    portal_voz_alerta: 'Feminina',
    portal_som_sua_vez: '',
    portal_som_prestes_chamar: '',
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
    update_path: '',
    habilitar_filas_avancadas: '0',
    acesso_local_exige_auth: '0',
    cor_primaria: '#2563eb',
    totem_screensaver_ativo: '0',
    totem_screensaver_timeout: '120',
    totem_screensaver_intervalo: '10',
    totem_screensaver_modo: 'ambos',
    totem_solicita_nome: '0',
    telao_agendamento_ativo: '0',
    telao_agendamento_regras: '[]',
    telao_tts_ativo: '0',
    telao_tts_voz: 'Feminina',
    telao_tts_template: 'Senha {senha}, dirija-se ao {guiche}.',
    telao_tts_template_nome: 'Senha {senha}, {nome}, dirija-se ao {guiche}.',
    telao_tts_velocidade: '0.95',
    telao_tts_tom: '1.0',
    painel_habilitar_repetir: '1',
    painel_habilitar_devolver: '1',
    painel_habilitar_nao_compareceu: '1',
    painel_habilitar_concluir: '1',
  });

  const [agendamentoRegras, setAgendamentoRegras] = useState<{ hora: string; layout: string }[]>([]);

  useEffect(() => {
    const restored = localStorage.getItem('restored_backup_name');
    if (restored) {
      setRestoredBackupName(restored);
      localStorage.removeItem('restored_backup_name');
    }
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
        setHasMasterPassword(data.hasMasterPassword || false);
        setIsMasterRemote(data.isMasterRemote || false);
      }
    } catch (err) {
      console.error('Erro ao verificar status de admin:', err);
    }
  };

  const handleMasterLogin = async () => {
    setMasterLoginLoading(true);
    setMasterLoginError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/auth-master`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: masterPassword }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('master_remote_token', data.token);
        window.location.reload();
      } else {
        setMasterLoginError(data.error || 'Erro ao autenticar.');
      }
    } catch (err) {
      setMasterLoginError('Erro de conexão com o servidor.');
    } finally {
      setMasterLoginLoading(false);
    }
  };

  const handleMasterLogout = async () => {
    try {
      const token = localStorage.getItem('master_remote_token');
      if (token) {
        await fetch(`${API_URL}/api/admin/logout-master`, {
          method: 'POST',
          headers: { 'X-Master-Token': token },
        });
      }
    } catch (err) {}
    localStorage.removeItem('master_remote_token');
    window.location.reload();
  };

  const handleSetMasterPassword = async () => {
    if (!newMasterPwd || newMasterPwd.length < 6) {
      setMasterPwdMsg('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/set-master-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: newMasterPwd }),
      });
      if (res.ok) {
        setMasterPwdMsg('✅ Senha de acesso remoto definida com sucesso!');
        setNewMasterPwd('');
        setHasMasterPassword(true);
      } else {
        const data = await res.json();
        setMasterPwdMsg(`❌ ${data.error}`);
      }
    } catch (err) {
      setMasterPwdMsg('❌ Erro de conexão.');
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

        // Parse de agendamentoRegras
        try {
          if (mergedData.telao_agendamento_regras) {
            setAgendamentoRegras(JSON.parse(mergedData.telao_agendamento_regras));
          }
        } catch (e) {
          console.error('Erro ao ler regras de agendamento:', e);
        }
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
    if (config.cor_primaria && !/^#[0-9A-Fa-f]{6}$/.test(config.cor_primaria)) {
      alert('A cor primária da marca deve ser um código hexadecimal válido (ex: #2563eb).');
      return;
    }
    // Serializa as regras para salvar
    config.telao_agendamento_regras = JSON.stringify(agendamentoRegras);
    
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

  const handleArteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('arte', file);
    try {
      const res = await fetch(`${API_URL}/api/configuracoes/telao-arte`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({ ...prev, telao_arte_espera: data.artePath }));
        alert('Arte do Telão atualizada com sucesso!');
      }
    } catch (err) {
      alert('Erro ao enviar arte.');
    }
  };

  const handleAudioUpload = (key: 'portal_som_sua_vez' | 'portal_som_prestes_chamar') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 250 * 1024) {
      alert('⚠️ O arquivo de áudio é muito grande! Escolha um áudio com menos de 250 KB (ex: MP3 compacto de poucos segundos).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setConfig(prev => ({ ...prev, [key]: base64 }));
      alert('Áudio carregado! Clique em "Salvar Alterações" no final da página para salvar e enviar ao portal de clientes.');
    };
    reader.onerror = () => {
      alert('Erro ao processar arquivo de áudio.');
    };
    reader.readAsDataURL(file);
  };

  const handleTestAudioPortal = (tipo: 'sua_vez' | 'prestes_chamar') => {
    const portalBase = (config.portal_cliente_url && config.portal_cliente_url.trim() !== '') 
      ? config.portal_cliente_url.trim() 
      : 'http://localhost:3000/#/cliente';
    
    let targetUrl: string;
    if (portalBase.includes('#')) {
      targetUrl = portalBase.includes('?') 
        ? `${portalBase}&testAudio=${tipo}` 
        : `${portalBase}?testAudio=${tipo}`;
    } else {
      const endsWithSlash = portalBase.endsWith('/');
      targetUrl = endsWithSlash 
        ? `${portalBase}#/?testAudio=${tipo}` 
        : `${portalBase}/#/?testAudio=${tipo}`;
    }
    
    window.open(targetUrl, '_blank');
  };

  const handleTestSound = () => {
    const customUrl = config.som_personalizado ? `${API_URL}${config.som_personalizado}` : undefined;
    playNotificationSound(config.tipo_som as any || 'bell', parseInt(config.volume_audio || '80'), customUrl);
  };

  const handleTestTts = () => {
    if (!window.speechSynthesis) {
      alert('Sintetizador de voz não suportado pelo seu navegador.');
      return;
    }
    window.speechSynthesis.cancel();

    const template = config.totem_solicita_nome === '1'
      ? config.telao_tts_template_nome 
      : config.telao_tts_template;
      
    const formatMock = template
      .replace('{senha}', 'A-001')
      .replace('{nome}', 'Niccolas')
      .replace('{guiche}', 'Guichê 3')
      .replace('{balcao}', 'Balcão Geral')
      .replace('{local}', config.rotulo_local || 'Guichê');

    const utterance = new SpeechSynthesisUtterance(formatMock);
    
    utterance.rate = parseFloat(config.telao_tts_velocidade || '0.95');
    utterance.pitch = parseFloat(config.telao_tts_tom || '1.0');

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    
    const ptVoices = voices.filter(v => v.lang.startsWith('pt'));
    if (config.telao_tts_voz === 'Masculina') {
      selectedVoice = ptVoices.find(v => v.name.toLowerCase().includes('masculino') || v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('daniel') || v.name.toLowerCase().includes('google de'));
    } else {
      selectedVoice = ptVoices.find(v => v.name.toLowerCase().includes('feminina') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('maria') || v.name.toLowerCase().includes('luciana'));
    }
    if (!selectedVoice && ptVoices.length > 0) {
      selectedVoice = ptVoices[0];
    }
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    window.speechSynthesis.speak(utterance);
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
        localStorage.setItem('restored_backup_name', file.name);
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
        localStorage.setItem('restored_backup_name', filename);
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
      <div className="max-w-6xl mx-auto font-sans space-y-8 animate-fade-in">
        {restoredBackupName && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-2xl shadow-sm flex items-start justify-between gap-4 animate-fade-in">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
                <span className="material-symbols-outlined text-2xl">settings_backup_restore</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-800 tracking-widest leading-none">Backup restaurado</h3>
                <p className="text-xs text-emerald-600 font-semibold mt-2 leading-relaxed">
                  O backup do arquivo <strong className="font-mono text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded break-all">{restoredBackupName}</strong> foi restaurado com sucesso!
                </p>
              </div>
            </div>
            <button 
              onClick={() => setRestoredBackupName(null)}
              className="text-emerald-700 hover:bg-emerald-500/10 p-1 rounded-lg transition-colors shrink-0 flex items-center"
            >
              <span className="material-symbols-outlined text-lg leading-none">close</span>
            </button>
          </div>
        )}

        {/* Master Server Banner */}
        {!isMasterServer && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-bold text-red-800 tracking-wider">Acesso restrito: modo leitura</h3>
                <div className="mt-1 text-sm text-red-700">
                  <p>Você está acessando as configurações a partir de um dispositivo cliente. Alterações administrativas só podem ser realizadas no <b>Servidor Master</b> da loja para garantir a integridade dos dados e evitar conflitos de sincronização.</p>
                </div>
                {hasMasterPassword && !showMasterLogin ? (
                  <button
                    onClick={() => setShowMasterLogin(true)}
                    className="mt-3 px-4 py-2 bg-red-100 border border-red-300 rounded-xl text-red-800 font-bold text-xs uppercase tracking-widest hover:bg-red-200 transition-all"
                  >
                    🔓 Desbloquear Acesso Remoto
                  </button>
                ) : hasMasterPassword && showMasterLogin ? (
                  <div className="mt-3 flex flex-col gap-2 max-w-sm">
                    <input
                      type="password"
                      placeholder="Senha Master Remoto"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleMasterLogin()}
                      className="w-full bg-white border border-red-300 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 text-ink font-semibold"
                      autoFocus
                    />
                    {masterLoginError && <p className="text-red-600 text-xs font-bold">{masterLoginError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleMasterLogin}
                        disabled={masterLoginLoading || !masterPassword}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-50"
                      >
                        {masterLoginLoading ? 'Verificando...' : 'Entrar'}
                      </button>
                      <button
                        onClick={() => { setShowMasterLogin(false); setMasterLoginError(''); setMasterPassword(''); }}
                        className="px-4 py-2 bg-red-100 border border-red-300 rounded-xl text-red-800 font-bold text-xs uppercase tracking-widest hover:bg-red-200 transition-all"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Remote Session Active Banner */}
        {isMasterRemote && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mb-6 rounded-r-xl shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-600">verified_user</span>
                <div>
                  <h3 className="text-sm font-bold text-emerald-800 tracking-wider">Sessão master remota ativa</h3>
                  <p className="text-xs text-emerald-600">Você tem permissão de administrador via acesso remoto.</p>
                </div>
              </div>
              <button
                onClick={handleMasterLogout}
                className="px-4 py-2 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-800 font-bold text-xs uppercase tracking-widest hover:bg-emerald-200 transition-all"
              >
                Encerrar Sessão
              </button>
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
              type="button"
              onClick={handleSave}
              disabled={saving || !isMasterServer}
              className={`px-8 py-4 bg-primary text-on-primary rounded-xl font-bold shadow-xl transition-all outline-none uppercase tracking-widest text-sm ${saving || !isMasterServer ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-hover active:scale-95'}`}
            >
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>

          {/* Tabs Navigation */}
          <div className="flex space-x-2 border-b border-outline-variant/30">
            <button
              type="button"
              onClick={() => setActiveTab('geral')}
              className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
                activeTab === 'geral'
                  ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
              }`}
            >
              Geral
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('telao')}
              className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
                activeTab === 'telao'
                  ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
              }`}
            >
              Telão & Interface
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('totem')}
              className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
                activeTab === 'totem'
                  ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
              }`}
            >
              Totem & Impressora
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sistema')}
              className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
                activeTab === 'sistema'
                  ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
              }`}
            >
              Sistema
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('seguranca')}
              className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
                activeTab === 'seguranca'
                  ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
              }`}
            >
              Segurança
            </button>
          </div>

          {/* Tab Content: Geral */}
          {activeTab === 'geral' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
              <div className="space-y-8">
                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">storefront</span>
                Estabelecimento
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Nome do estabelecimento</label>
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
                    <span className="font-bold text-ink text-sm">Atendimento geral</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="fila_normal_ativa" checked={config.fila_normal_ativa === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <span className="font-bold text-ink text-sm">Prioritário</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="fila_preferencial_ativa" checked={config.fila_preferencial_ativa === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
                
            <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">sensors</span>
                Painel do Operador
              </h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink text-sm">Botão repetir</span>
                      <span className="text-[10px] text-ink-secondary/60 font-medium mt-1">Exibir botão para repetir chamada da senha atual.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="painel_habilitar_repetir" 
                        checked={config.painel_habilitar_repetir !== '0'} 
                        onChange={handleChange} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink text-sm">Botão devolver</span>
                      <span className="text-[10px] text-ink-secondary/60 font-medium mt-1">Exibir botão para devolver a senha de volta para a fila.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="painel_habilitar_devolver" 
                        checked={config.painel_habilitar_devolver !== '0'} 
                        onChange={handleChange} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink text-sm">Botão não compareceu</span>
                      <span className="text-[10px] text-ink-secondary/60 font-medium mt-1">Exibir botão para cancelar a senha por ausência do cliente.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="painel_habilitar_nao_compareceu" 
                        checked={config.painel_habilitar_nao_compareceu !== '0'} 
                        onChange={handleChange} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink text-sm">Botão concluir</span>
                      <span className="text-[10px] text-ink-secondary/60 font-medium mt-1">Exibir botão para finalizar o atendimento da senha atual.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="painel_habilitar_concluir" 
                        checked={config.painel_habilitar_concluir !== '0'} 
                        onChange={handleChange} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>

                </div>
              </div>
            </div>
  
              </div>
              <div className="space-y-8">
                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">palette</span>
                Identidade Visual & Cores
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Cor primária da marca</label>
                  <div className="flex gap-4 items-center">
                    <div className="relative w-16 h-12 rounded-xl overflow-hidden border border-outline-variant/50 cursor-pointer shrink-0">
                      <input
                        type="color"
                        name="cor_primaria"
                        value={config.cor_primaria || '#2563eb'}
                        onChange={handleChange}
                        className="absolute inset-0 w-full h-full scale-150 cursor-pointer border-none p-0"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        name="cor_primaria"
                        value={config.cor_primaria || '#2563eb'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfig(prev => ({ ...prev, cor_primaria: val }));
                        }}
                        placeholder="#2563eb"
                        className={`w-full bg-surface-variant border rounded-xl px-4 py-3 focus:outline-none text-ink font-semibold font-mono ${
                          /^#[0-9A-Fa-f]{6}$/.test(config.cor_primaria || '') 
                            ? 'border-outline-variant/50 focus:border-primary' 
                            : 'border-error focus:border-error'
                        }`}
                        type="text"
                        maxLength={7}
                      />
                      {!/^#[0-9A-Fa-f]{6}$/.test(config.cor_primaria || '') && (
                        <p className="text-error text-[10px] font-bold mt-1 tracking-wider">Formato de cor inválido. use o formato hexadecimal (ex: #2563eb).</p>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-ink-secondary/60 mt-2 font-medium">
                    A cor primária define a identidade visual do Totem, Telão, Operador e Portal do Cliente.
                  </p>
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
                <label htmlFor="logo-input" className="text-primary font-bold text-sm tracking-widest cursor-pointer hover:underline">Trocar logo</label>
              </div>
            </div>
              </div>
            </div>
          )}

          {/* Tab Content: Telão & Interface */}
          {activeTab === 'telao' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">tv</span>
                Telão & Interface
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="col-span-2 md:col-span-1">
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Texto do rodapé (telão)</label>
                  <input
                    name="texto_rodape"
                    value={config.texto_rodape || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                </div>
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Rótulo do local (ex: guichê, sala)</label>
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
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Rótulo atend. geral</label>
                  <input
                    name="rotulo_atendimento_geral"
                    value={config.rotulo_atendimento_geral || ''}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    type="text"
                  />
                </div>
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Rótulo atend. prioritário</label>
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
                    <span className="font-bold text-ink text-sm">Mostrar rodapé no telão</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="mostrar_rodape" checked={config.mostrar_rodape !== '0'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30 flex-1">
                    <span className="font-bold text-ink text-sm">Ocultar tipo no ticket</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="ocultar_tipo_senha" checked={config.ocultar_tipo_senha === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                </div>

                {/* Seção TTS de Chamada */}
                <div className="col-span-2 border-t border-outline-variant/30 pt-6 mt-2 space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink text-sm">Chamada por voz por TTS (sintetizador)</span>
                      <span className="text-[10px] text-ink-secondary/60 font-medium mt-1">Falará a senha e o local nos telões no momento da chamada.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" name="telao_tts_ativo" checked={config.telao_tts_ativo === '1'} onChange={handleChange} className="sr-only peer" />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>

                  {config.telao_tts_ativo === '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-surface-variant/30 border border-outline-variant/30 rounded-2xl animate-fade-in">
                      <div>
                        <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Gênero da voz</label>
                        <select
                          name="telao_tts_voz"
                          value={config.telao_tts_voz || 'Feminina'}
                          onChange={handleChange}
                          className="w-full bg-white border border-outline-variant/50 rounded-xl px-4 py-3 text-ink font-bold focus:border-primary"
                        >
                          <option value="Feminina">Feminina</option>
                          <option value="Masculina">Masculina</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">Velocidade ({config.telao_tts_velocidade || '0.95'}x)</label>
                          <input
                            type="range"
                            name="telao_tts_velocidade"
                            min="0.5"
                            max="2.0"
                            step="0.05"
                            value={config.telao_tts_velocidade || '0.95'}
                            onChange={handleChange}
                            className="w-full h-2 bg-outline-variant rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                        <div>
                          <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">Tom ({config.telao_tts_tom || '1.0'})</label>
                          <input
                            type="range"
                            name="telao_tts_tom"
                            min="0.5"
                            max="2.0"
                            step="0.05"
                            value={config.telao_tts_tom || '1.0'}
                            onChange={handleChange}
                            className="w-full h-2 bg-outline-variant rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>

                      <div className="col-span-2">
                        <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Template de chamada (sem nome)</label>
                        <input
                          name="telao_tts_template"
                          value={config.telao_tts_template || ''}
                          onChange={handleChange}
                          placeholder="Senha {senha}, dirija-se ao {guiche}."
                          className="w-full bg-white border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                          type="text"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Template de chamada (com nome do cliente)</label>
                        <input
                          name="telao_tts_template_nome"
                          value={config.telao_tts_template_nome || ''}
                          onChange={handleChange}
                          placeholder="Senha {senha}, {nome}, dirija-se ao {guiche}."
                          className="w-full bg-white border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                          type="text"
                        />
                        <p className="text-[10px] text-ink-secondary/60 mt-2 font-medium">
                          Placeholders aceitos: <code className="bg-primary/10 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{senha}'}</code>, <code className="bg-primary/10 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{nome}'}</code>, <code className="bg-primary/10 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{guiche}'}</code>, <code className="bg-primary/10 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{balcao}'}</code>, <code className="bg-primary/10 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{local}'}</code>
                        </p>
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleTestTts}
                          className="px-6 py-3 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all active:scale-95"
                        >
                          <span className="material-symbols-outlined text-sm">volume_up</span>
                          Testar Voz e Template
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-2 border-t border-outline-variant/30 pt-6 mt-2">
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Arte de espera do telão (pré-vínculo)</label>
                  <div className="flex items-center gap-4">
                    {config.telao_arte_espera && (
                      <div className="w-32 h-20 bg-black rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-outline-variant/50">
                        <img src={`${API_URL}${config.telao_arte_espera}`} alt="Arte de Espera" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input 
                        type="file" 
                        id="arte-espera-input"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        onChange={handleArteUpload}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('arte-espera-input')?.click()}
                        className="px-6 py-3 bg-surface-variant border border-outline-variant/50 hover:border-primary transition-all rounded-xl font-bold uppercase tracking-widest text-xs text-ink flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined">upload</span>
                        {config.telao_arte_espera ? 'Alterar Arte' : 'Fazer Upload (Rec: 1920x1080)'}
                      </button>
                      <p className="text-[10px] text-ink-secondary/60 mt-2 font-medium">Exibida nos telões enquanto aguardam a vinculação por código.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
              </div>

            </div>
          )}

          {/* Tab Content: Totem & Impressora */}
          {activeTab === 'totem' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">touch_app</span>
                Totem & Autoatendimento
              </h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30 col-span-2">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink text-sm">Ativar modo descanso (screensaver)</span>
                      <span className="text-[10px] text-ink-secondary/60 font-medium mt-1">Exibe mídia ou relógio quando o totem fica ocioso.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="totem_screensaver_ativo" 
                        checked={config.totem_screensaver_ativo === '1'} 
                        onChange={handleChange} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>

                  {config.totem_screensaver_ativo === '1' && (
                    <>
                      <div>
                        <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Tempo de inatividade (segundos)</label>
                        <input
                          name="totem_screensaver_timeout"
                          value={config.totem_screensaver_timeout || '120'}
                          onChange={handleChange}
                          className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                          type="number"
                          min="10"
                        />
                      </div>
                      <div>
                        <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Intervalo das mídias (segundos)</label>
                        <input
                          name="totem_screensaver_intervalo"
                          value={config.totem_screensaver_intervalo || '10'}
                          onChange={handleChange}
                          className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                          type="number"
                          min="3"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Modo de exibição do screensaver</label>
                        <select
                          name="totem_screensaver_modo"
                          value={config.totem_screensaver_modo || 'ambos'}
                          onChange={handleChange}
                          className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 text-ink font-bold focus:border-primary"
                        >
                          <option value="midia">Apenas Mídias (Imagens/Vídeos)</option>
                          <option value="relogio">Apenas Relógio Digital Grande com Data</option>
                          <option value="ambos">Mídias em loop com Relógio em Overlay</option>
                        </select>
                      </div>
                    </>
                  )}
                  
                  <div className="flex items-center justify-between p-5 bg-surface-variant rounded-xl border border-outline-variant/30 col-span-2">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink text-sm">Solicitar nome do cliente</span>
                      <span className="text-[10px] text-ink-secondary/60 font-medium mt-1">Exibe teclado virtual no totem para o cliente digitar o nome.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="totem_solicita_nome" 
                        checked={config.totem_solicita_nome === '1'} 
                        onChange={handleChange} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[24px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">print</span>
                Impressora Térmica
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Selecionar impressora</label>
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
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Voz de alerta do celular</label>
                  <select
                    name="portal_voz_alerta"
                    value={config.portal_voz_alerta || 'Feminina'}
                    onChange={handleChange}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                  >
                    <option value="Feminina">Voz Feminina (Padrão)</option>
                    <option value="Masculina">Voz Masculina</option>
                    <option value="Apenas Beep">Apenas Som (Beep)</option>
                    <option value="AudioGravado">Áudio Gravado (.mp3)</option>
                  </select>
                </div>

                {config.portal_voz_alerta === 'AudioGravado' && (
                  <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 bg-primary/5 p-6 rounded-2xl border border-primary/10">
                    <div className="flex flex-col gap-2">
                      <label className="block font-bold tracking-widest text-ink-secondary text-[10px]">Áudio "sua vez chegou"</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          id="audio-suavez-input"
                          className="hidden"
                          accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
                          onChange={handleAudioUpload('portal_som_sua_vez')}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('audio-suavez-input')?.click()}
                          className="px-4 py-2 bg-white border border-outline-variant rounded-xl text-xs font-bold uppercase tracking-wider text-ink hover:border-primary transition-all"
                        >
                          {config.portal_som_sua_vez ? 'Alterar Áudio' : 'Escolher Áudio'}
                        </button>
                        {config.portal_som_sua_vez && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const audio = new Audio(config.portal_som_sua_vez);
                                audio.play();
                              }}
                              className="p-2 bg-primary/10 text-primary rounded-lg flex items-center justify-center active:scale-95 transition-all"
                              title="Testar Áudio"
                            >
                              <span className="material-symbols-outlined text-sm leading-none">play_arrow</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTestAudioPortal('sua_vez')}
                              className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                              title="Testar no Portal do Cliente (Celular)"
                            >
                              <span className="material-symbols-outlined text-xs leading-none">open_in_new</span>
                              <span>Testar no Portal</span>
                            </button>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] text-ink-secondary/60">
                        {config.portal_som_sua_vez ? '✅ Áudio configurado' : '⚠️ Nenhum áudio enviado (usa TTS como fallback)'}
                      </span>
                    </div>
 
                    <div className="flex flex-col gap-2">
                      <label className="block font-bold tracking-widest text-ink-secondary text-[10px]">Áudio "senha próxima"</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          id="audio-prestes-input"
                          className="hidden"
                          accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
                          onChange={handleAudioUpload('portal_som_prestes_chamar')}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('audio-prestes-input')?.click()}
                          className="px-4 py-2 bg-white border border-outline-variant rounded-xl text-xs font-bold uppercase tracking-wider text-ink hover:border-primary transition-all"
                        >
                          {config.portal_som_prestes_chamar ? 'Alterar Áudio' : 'Escolher Áudio'}
                        </button>
                        {config.portal_som_prestes_chamar && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const audio = new Audio(config.portal_som_prestes_chamar);
                                audio.play();
                              }}
                              className="p-2 bg-primary/10 text-primary rounded-lg flex items-center justify-center active:scale-95 transition-all"
                              title="Testar Áudio"
                            >
                              <span className="material-symbols-outlined text-sm leading-none">play_arrow</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTestAudioPortal('prestes_chamar')}
                              className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                              title="Testar no Portal do Cliente (Celular)"
                            >
                              <span className="material-symbols-outlined text-xs leading-none">open_in_new</span>
                              <span>Testar no Portal</span>
                            </button>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] text-ink-secondary/60">
                        {config.portal_som_prestes_chamar ? '✅ Áudio configurado' : '⚠️ Nenhum áudio enviado (usa TTS como fallback)'}
                      </span>
                    </div>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Url do portal do cliente (QR Code)</label>
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
                    <label className="block font-bold tracking-widest text-ink-secondary mb-4 text-xs">Layout do ticket impresso</label>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30">
                        <span className="font-bold text-ink text-sm">Exibir logotipo</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="print_logo" checked={config.print_logo !== '0'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30">
                        <span className="font-bold text-ink text-sm">Exibir nome do estabelecimento</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="print_escrita" checked={config.print_escrita !== '0'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-surface-variant rounded-xl border border-outline-variant/30">
                        <span className="font-bold text-ink text-sm">Exibir QR Code</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="print_qrcode" checked={config.print_qrcode !== '0'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Preview Visual do Ticket */}
                  <div className="w-full xl:w-[280px] shrink-0 bg-surface-variant/30 border-2 border-dashed border-outline-variant/50 rounded-2xl p-4 flex flex-col items-center overflow-hidden relative">
                    <label className="block font-bold tracking-widest text-ink-secondary mb-4 text-xs text-center">Preview (simulação)</label>
                    
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

            </div>
          )}

          {/* Tab Content: Sistema */}
          {activeTab === 'sistema' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">cloud_sync</span>
                Backup & Dados
              </h2>
              <div className="space-y-6">
                {/* Escopo do Backup */}
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary mb-3 text-xs">O que incluir no backup</label>
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
                      <span className="font-bold text-ink text-sm block">Agendamento automático</span>
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
                    <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Frequência</label>
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
                    <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Destino dos backups</label>
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
                      <span className="font-bold text-ink text-xs tracking-widest">Fazer backup agora</span>
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
                        <span className="font-bold text-ink text-xs tracking-widest">Restaurar de arquivo manual</span>
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
              </div>
              <div className="space-y-8">
                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">settings_applications</span>
                Sistema
              </h2>
              <div className="space-y-6">
                <div className="p-5 bg-surface-variant rounded-xl border border-outline-variant/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-ink text-sm">Iniciar com Windows</span>
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
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Tempo de destaque da senha (segundos)</label>
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
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Som do chamado</label>
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
                <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">update</span>
                Atualização do Sistema
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div className="mb-2">
                  <label className="block font-bold tracking-widest text-ink-secondary mb-2 text-xs">Pasta de atualizações locais (offline)</label>
                  <input
                    name="update_path"
                    value={config.update_path || ''}
                    onChange={handleChange}
                    placeholder="C:\ChamaAi_Atualizacoes (padrão)"
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold font-mono text-sm"
                    type="text"
                  />
                  <p className="text-[10px] text-ink-secondary/60 mt-1 font-medium">
                    Se for informado, o sistema buscará atualizações localmente nesta pasta em vez de baixar do GitHub.
                  </p>
                </div>
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
                    <span className="font-bold text-ink text-xs tracking-widest">Buscar atualizações</span>
                  </div>
                  <span className="material-symbols-outlined text-ink-secondary opacity-20 group-hover:opacity-100 transition-opacity">chevron_right</span>
                </button>

                <button 
                  onClick={async (e) => {
                    if (!confirm('O sistema aplicará a atualização agora. Ele vai preparar o ambiente, baixar a nova versão e reiniciar automaticamente. Deseja continuar?')) return;
                    
                    const btn = e.currentTarget;
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = `
                      <div class="flex items-center gap-3 text-left">
                        <span class="material-symbols-outlined animate-spin text-primary group-hover:text-white">autorenew</span>
                        <div>
                          <span class="font-bold text-xs uppercase tracking-widest block text-primary group-hover:text-white">Preparando Instalação...</span>
                          <span class="text-[10px] opacity-70 block font-normal normal-case mt-0.5 text-primary group-hover:text-white">Aguarde, a interface do instalador será aberta em instantes.</span>
                        </div>
                      </div>
                    `;
                    btn.setAttribute('disabled', 'true');
                    btn.style.opacity = '0.7';

                    try {
                      const api = (window as any).api;
                      
                      if (api?.installUpdate) {
                        const res = await api.installUpdate();
                        if (!res.success) alert(res.message);
                      } else {
                        alert('⚠️ Use o App Desktop (.exe) para instalar atualizações.');
                      }
                    } catch (err) {
                      alert('Erro ao processar atualização: ' + (err instanceof Error ? err.message : String(err)));
                    } finally {
                      btn.innerHTML = originalHTML;
                      btn.removeAttribute('disabled');
                      btn.style.opacity = '';
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 bg-primary/10 rounded-xl border border-primary/20 hover:bg-primary hover:text-white transition-all group cursor-pointer text-primary active:scale-[0.98] outline-none"
                >
                  <div className="flex items-center gap-3 text-left">
                    <span className="material-symbols-outlined">install_desktop</span>
                    <div>
                      <span className="font-bold text-xs tracking-widest block">Instalar atualização agora</span>
                      <span className="text-[10px] opacity-70 block font-normal normal-case mt-0.5">Executa o instalador da nova versão e reinicia o aplicativo automaticamente.</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined opacity-50 group-hover:opacity-100 transition-opacity">system_update_alt</span>
                </button>
              </div>
            </div>
              </div>
            </div>
          )}

          {/* Tab Content: Segurança */}
          {activeTab === 'seguranca' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
              {isMasterServer && (
                <div className="space-y-8">
                  <div className="bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/50">
              <h2 className="font-sans text-[22px] font-bold text-ink mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-4 uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary">admin_panel_settings</span>
                Acesso Remoto Master
              </h2>
              <div className="space-y-4">
                <p className="text-sm text-ink-secondary font-medium">
                  Defina uma senha para permitir que outros dispositivos na rede acessem o painel administrativo como Master.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={hasMasterPassword ? 'Nova senha (min. 6 caracteres)' : 'Criar senha (min. 6 caracteres)'}
                    value={newMasterPwd}
                    onChange={(e) => setNewMasterPwd(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSetMasterPassword()}
                    className="flex-1 bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                  />
                  <button
                    onClick={handleSetMasterPassword}
                    className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary-hover transition-all"
                  >
                    {hasMasterPassword ? 'Alterar' : 'Definir'}
                  </button>
                </div>
                {masterPwdMsg && (
                  <p className={`text-xs font-bold ${masterPwdMsg.startsWith('✅') ? 'text-success' : 'text-error'}`}>{masterPwdMsg}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`w-2 h-2 rounded-full ${hasMasterPassword ? 'bg-success' : 'bg-outline-variant'}`}></span>
                  <span className="text-xs text-ink-secondary font-bold uppercase tracking-wider">
                    {hasMasterPassword ? 'Senha de acesso remoto configurada' : 'Nenhuma senha definida — acesso remoto desabilitado'}
                  </span>
                </div>
              </div>
            </div>
                </div>
              )}
            </div>
          )}
        </fieldset>
      </div>
    </AdminLayout>
  );
}
