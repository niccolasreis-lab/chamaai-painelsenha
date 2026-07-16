import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { SOUND_OPTIONS, playNotificationSound } from '../shared/sounds';
import { 
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Store,
  Radio,
  Palette,
  Image as ImageIcon,
  Tv,
  Volume2,
  Upload,
  Pointer,
  Printer,
  CloudLightning,
  Settings,
  Users,
  CreditCard,
  History,
  Trash2,
  Wrench,
  Search,
  Download,
  Shield,
  Play,
  ExternalLink,
  Save,
  X,
  RefreshCcw
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

export default function Configuracoes() {
  const { playDynamicUrl } = useAudioPlayer();
  const [activeTab, setActiveTab] = useState<'geral' | 'telao' | 'totem' | 'sistema' | 'seguranca'>('geral');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printers, setPrinters] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [isMasterServer, setIsMasterServer] = useState(true);
  const [hasMasterPassword, setHasMasterPassword] = useState(false);
  const [showMasterLogin, setShowMasterLogin] = useState(false);
  const [showUpdateLogin, setShowUpdateLogin] = useState(false);
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
    atualizacao_automatica: '1',
    cor_primaria: '#2563eb',
    totem_screensaver_ativo: '0',
    totem_screensaver_timeout: '120',
    totem_screensaver_intervalo: '10',
    totem_screensaver_modo: 'ambos',
    totem_solicita_nome: '0',
    telao_agendamento_ativo: '0',
    telao_agendamento_regras: '[]',
    telao_tts_ativo: '0',
    telao_tts_modo: 'desativado',
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
  const [ttsStatus, setTtsStatus] = useState<Record<string, { count: number; range: string }>>({
    tipo1: { count: 0, range: '' },
    tipo2: { count: 0, range: '' },
    tipo3: { count: 0, range: '' }
  });
  const [ttsUploadLoading, setTtsUploadLoading] = useState(false);
  const [testPasswordNum, setTestPasswordNum] = useState('1');

  const fetchTtsStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tts/status`);
      if (res.ok) {
        const data = await res.json();
        setTtsStatus(data);
      }
    } catch (err) {
      console.error('Erro ao buscar status do TTS:', err);
    }
  };

  const handleTtsZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('⚠️ Por favor, selecione um arquivo no formato ZIP.');
      return;
    }

    setTtsUploadLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('master_remote_token');
      const headers: Record<string, string> = {};
      if (token) headers['X-Master-Token'] = token;

      const res = await fetch(`${API_URL}/api/tts/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        alert(`✅ Upload concluído! ${data.count} arquivos de áudio MP3 foram importados com sucesso.`);
        fetchTtsStatus();
      } else {
        const data = await res.json();
        alert(`❌ Erro no upload: ${data.error || 'Erro desconhecido'}`);
      }
    } catch (err) {
      alert('❌ Erro de conexão ao enviar o arquivo ZIP.');
    } finally {
      setTtsUploadLoading(false);
    }
  };

  const handleClearTts = async (tipo: string) => {
    const labels: Record<string, string> = {
      tipo1: 'Tipo 1 (1ª Chamada Normal)',
      tipo2: 'Tipo 2 (Rechamada Alarmante)',
      tipo3: 'Tipo 3 (Variação da 1ª Chamada)'
    };
    if (!window.confirm(`Tem certeza que deseja apagar TODOS os arquivos de áudio de ${labels[tipo]}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('master_remote_token');
      const headers: Record<string, string> = {};
      if (token) headers['X-Master-Token'] = token;

      const res = await fetch(`${API_URL}/api/tts/clear/${tipo}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        alert('✅ Áudios removidos com sucesso!');
        fetchTtsStatus();
      } else {
        const data = await res.json();
        alert(`❌ Erro ao limpar áudios: ${data.error || 'Erro desconhecido'}`);
      }
    } catch (err) {
      alert('❌ Erro de conexão.');
    }
  };

  const handleTestTtsAudioFile = (tipoPasta: 'tipo1' | 'tipo2' | 'tipo3') => {
    const num = parseInt(testPasswordNum, 10);
    if (isNaN(num) || num <= 0) {
      alert('Por favor, digite um número de senha válido para testar.');
      return;
    }

    const urls: string[] = [];
    if (tipoPasta === 'tipo1') {
      urls.push(`${API_URL}/tts/tipo1/Senha_${num}_1.mp3`);
    } else if (tipoPasta === 'tipo2') {
      urls.push(`${API_URL}/tts/tipo2/Senha_${num}_2_chamada.mp3`);
      urls.push(`${API_URL}/tts/tipo2/Senha_${num}_2.mp3`);
    } else if (tipoPasta === 'tipo3') {
      urls.push(`${API_URL}/tts/tipo3/Senha_${num}_3.mp3`);
    }

    let currentUrlIndex = 0;
    const tryPlay = () => {
      if (currentUrlIndex >= urls.length) {
        alert(`⚠️ Nenhum arquivo de áudio encontrado para a senha ${num} neste tipo.`);
        return;
      }
      const audioUrl = urls[currentUrlIndex];
      playDynamicUrl(audioUrl, (parseFloat(config.volume_audio || '80')) / 100)
        .catch((err) => {
          console.warn('[TEST TTS MP3] Falha ou interrupção ao testar URL:', audioUrl, err);
          currentUrlIndex++;
          tryPlay();
        });
    };

    tryPlay();
  };

  useEffect(() => {
    const restored = localStorage.getItem('restored_backup_name');
    if (restored) {
      setRestoredBackupName(restored);
      localStorage.removeItem('restored_backup_name');
    }
    fetchAdminStatus();
    fetchConfig();
    fetchBackups();
    fetchTtsStatus();
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

  const handleUpdateLogin = async () => {
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
        setShowUpdateLogin(false);
        setMasterPassword('');
        const api = (window as any).api;
        if (api?.checkForUpdates) {
          const updateRes = await api.checkForUpdates();
          alert(updateRes.message);
        } else {
          alert('⚠️ Use o App Desktop (.exe) para buscar atualizações.');
        }
      } else {
        setMasterLoginError(data.error || 'Senha incorreta.');
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
      : 'http://localhost:3001/#/cliente';
    
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

    const template = (config.totem_solicita_nome === '1'
      ? config.telao_tts_template_nome 
      : config.telao_tts_template) || 'Senha {senha}, dirija-se ao {guiche}.';
      
    const formatMock = template
      .replace(/\{senha\}/gi, 'A-001')
      .replace(/\{nome\}/gi, 'Niccolas')
      .replace(/\{guiche\}/gi, 'Guichê 3')
      .replace(/\{balcao\}/gi, 'Balcão Geral')
      .replace(/\{local\}/gi, config.rotulo_local || 'Guichê');

    const utterance = new SpeechSynthesisUtterance(formatMock);
    utterance.lang = 'pt-BR';
    utterance.rate = parseFloat(config.telao_tts_velocidade || '0.95');
    utterance.pitch = parseFloat(config.telao_tts_tom || '1.0');

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    
    if (voices.length > 0) {
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
    } else {
      console.warn('[TEST TTS] Nenhuma lista de vozes carregada previamente. Usando voz padrão do navegador.');
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
        <div className="flex items-center justify-center p-12">
          <StatusBadge variant="loading" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto font-sans space-y-6 animate-fade-in">
        {restoredBackupName && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-md shadow-sm flex items-start justify-between gap-4 animate-fade-in">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-sm bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-800 tracking-wider leading-none">Backup restaurado</h3>
                <p className="text-xs text-emerald-600 font-semibold mt-2 leading-relaxed">
                  O backup do arquivo <strong className="font-mono text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded break-all">{restoredBackupName}</strong> foi restaurado com sucesso!
                </p>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setRestoredBackupName(null)}
              className="text-emerald-700 hover:bg-emerald-500/10 p-1 rounded-sm transition-colors shrink-0 flex items-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Master Server Banner */}
        {!isMasterServer && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-bold text-red-800 tracking-wider">Acesso restrito: modo leitura</h3>
                <div className="mt-1 text-xs text-red-700 leading-relaxed">
                  <p>Você está acessando as configurações a partir de um dispositivo cliente. Alterações administrativas só podem ser realizadas no <b>Servidor Master</b> da loja para garantir a integridade dos dados e evitar conflitos de sincronização.</p>
                </div>
                {hasMasterPassword && !showMasterLogin ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setShowMasterLogin(true)}
                    className="mt-3 text-xs uppercase"
                  >
                    🔓 Desbloquear Acesso Remoto
                  </Button>
                ) : hasMasterPassword && showMasterLogin ? (
                  <div className="mt-3 flex flex-col gap-2 max-w-sm">
                    <Input
                      type="password"
                      label="Senha Master Remoto"
                      placeholder="Senha Master"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleMasterLogin()}
                      autoFocus
                    />
                    {masterLoginError && <p className="text-error text-xs font-bold">{masterLoginError}</p>}
                    <div className="flex gap-2 mt-1">
                      <Button
                        size="sm"
                        onClick={handleMasterLogin}
                        disabled={masterLoginLoading || !masterPassword}
                        className="text-xs uppercase"
                      >
                        {masterLoginLoading ? 'Verificando...' : 'Entrar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setShowMasterLogin(false); setMasterLoginError(''); setMasterPassword(''); }}
                        className="text-xs uppercase"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Remote Session Active Banner */}
        {isMasterRemote && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-md shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-emerald-800 tracking-wider">Sessão master remota ativa</h3>
                  <p className="text-xs text-emerald-600">Você tem permissão de administrador via acesso remoto.</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleMasterLogout}
                className="text-xs uppercase"
              >
                Encerrar Sessão
              </Button>
            </div>
          </div>
        )}

        <fieldset disabled={!isMasterServer} className="contents">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-outline-variant pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">Configurações</h1>
              <p className="text-ink-variant text-sm mt-0.5">Gestão do Sistema ChamaAí</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !isMasterServer}
              className="w-full sm:w-auto uppercase tracking-wider text-xs"
              icon={<Save className="h-4 w-4" />}
            >
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>

          {/* Tabs Navigation */}
          <div className="flex border-b border-outline-variant overflow-x-auto">
            {(['geral', 'telao', 'totem', 'sistema', 'seguranca'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 font-bold text-sm border-b-2 transition-all outline-none whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-ink-variant hover:text-ink hover:bg-surface-container-low'
                }`}
              >
                {tab === 'geral' && 'Geral'}
                {tab === 'telao' && 'Telão & Interface'}
                {tab === 'totem' && 'Totem & Impressora'}
                {tab === 'sistema' && 'Sistema'}
                {tab === 'seguranca' && 'Segurança'}
              </button>
            ))}
          </div>

          {/* Tab Content: Geral */}
          {activeTab === 'geral' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
              <div className="space-y-6">
                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <Store className="h-5 w-5 text-primary" />
                    Estabelecimento
                  </h2>
                  <div className="space-y-4">
                    <Input
                      name="nome_estabelecimento"
                      label="Nome do estabelecimento"
                      value={config.nome_estabelecimento || ''}
                      onChange={handleChange}
                      type="text"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                        <span className="font-bold text-ink text-sm">Atendimento geral</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="fila_normal_ativa" checked={config.fila_normal_ativa === '1'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                        <span className="font-bold text-ink text-sm">Prioritário</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="fila_preferencial_ativa" checked={config.fila_preferencial_ativa === '1'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <Radio className="h-5 w-5 text-primary" />
                    Painel do Operador
                  </h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                        <div className="flex flex-col pr-2">
                          <span className="font-bold text-ink text-sm">Botão repetir</span>
                          <span className="text-[10px] text-ink-variant mt-0.5">Repetir chamada da senha atual.</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox" 
                            name="painel_habilitar_repetir" 
                            checked={config.painel_habilitar_repetir !== '0'} 
                            onChange={handleChange} 
                            className="sr-only peer" 
                          />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                        <div className="flex flex-col pr-2">
                          <span className="font-bold text-ink text-sm">Botão devolver</span>
                          <span className="text-[10px] text-ink-variant mt-0.5">Devolver senha para a fila.</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox" 
                            name="painel_habilitar_devolver" 
                            checked={config.painel_habilitar_devolver !== '0'} 
                            onChange={handleChange} 
                            className="sr-only peer" 
                          />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                        <div className="flex flex-col pr-2">
                          <span className="font-bold text-ink text-sm">Botão não compareceu</span>
                          <span className="text-[10px] text-ink-variant mt-0.5">Cancelar senha por ausência.</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox" 
                            name="painel_habilitar_nao_compareceu" 
                            checked={config.painel_habilitar_nao_compareceu !== '0'} 
                            onChange={handleChange} 
                            className="sr-only peer" 
                          />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                        <div className="flex flex-col pr-2">
                          <span className="font-bold text-ink text-sm">Botão concluir</span>
                          <span className="text-[10px] text-ink-variant mt-0.5">Finalizar atendimento da senha.</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox" 
                            name="painel_habilitar_concluir" 
                            checked={config.painel_habilitar_concluir !== '0'} 
                            onChange={handleChange} 
                            className="sr-only peer" 
                          />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>

                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <Palette className="h-5 w-5 text-primary" />
                    Identidade Visual & Cores
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block font-medium text-sm text-ink mb-2">Cor primária da marca</label>
                      <div className="flex gap-3 items-center">
                        <div className="relative w-14 h-11 rounded-sm overflow-hidden border border-outline-variant cursor-pointer shrink-0">
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
                            className={`w-full bg-surface border rounded-sm px-3 h-11 text-ink font-semibold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                              /^#[0-9A-Fa-f]{6}$/.test(config.cor_primaria || '') 
                                ? 'border-outline-variant focus:ring-primary focus:border-primary' 
                                : 'border-error focus:ring-error'
                            }`}
                            type="text"
                            maxLength={7}
                          />
                          {!/^#[0-9A-Fa-f]{6}$/.test(config.cor_primaria || '') && (
                            <p className="text-error text-xs font-semibold mt-1">Formato de cor inválido. Use hexadecimal (ex: #2563eb).</p>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-ink-variant mt-2">
                        A cor primária define a identidade visual do Totem, Telão, Operador e Portal do Cliente.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    Logotipo
                  </h2>
                  <div className="flex flex-col items-center p-4 border border-dashed border-outline-variant rounded-md bg-surface-container-low">
                    {config.logo_cliente && (
                      <div className="p-2 bg-white rounded border border-outline-variant/40 mb-3">
                        <img src={`${API_URL}${config.logo_cliente}`} className="h-10 object-contain" alt="Logo Cliente" />
                      </div>
                    )}
                    <input type="file" id="logo-input" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                    <Button 
                      variant="secondary"
                      size="sm"
                      onClick={() => document.getElementById('logo-input')?.click()}
                    >
                      Trocar Logo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Telão & Interface */}
          {activeTab === 'telao' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <Tv className="h-5 w-5 text-primary" />
                    Telão & Interface
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <Input
                      name="texto_rodape"
                      label="Texto do rodapé (telão)"
                      value={config.texto_rodape || ''}
                      onChange={handleChange}
                      type="text"
                      className="col-span-2 md:col-span-1"
                    />
                    <Input
                      name="rotulo_local"
                      label="Rótulo do local (ex: guichê, sala)"
                      value={config.rotulo_local || ''}
                      onChange={handleChange}
                      placeholder="Deixe em branco para usar o padrão"
                      type="text"
                    />
                    <Input
                      name="rotulo_atendimento_geral"
                      label="Rótulo atend. geral"
                      value={config.rotulo_atendimento_geral || ''}
                      onChange={handleChange}
                      type="text"
                    />
                    <Input
                      name="rotulo_atendimento_prioritario"
                      label="Rótulo atend. prioritário"
                      value={config.rotulo_atendimento_prioritario || ''}
                      onChange={handleChange}
                      type="text"
                    />

                    <div className="col-span-2 flex flex-col sm:flex-row gap-3">
                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35 flex-1">
                        <span className="font-bold text-ink text-sm">Mostrar rodapé no telão</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="mostrar_rodape" checked={config.mostrar_rodape !== '0'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35 flex-1">
                        <span className="font-bold text-ink text-sm">Ocultar tipo no ticket</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="ocultar_tipo_senha" checked={config.ocultar_tipo_senha === '1'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>
                    </div>

                    {/* Seção TTS de Chamada */}
                    <div className="col-span-2 border-t border-outline-variant/30 pt-4 mt-2 space-y-4">
                      <div>
                        <label className="block font-medium text-sm text-ink mb-1.5 uppercase">Chamada por voz nos Telões</label>
                        <select
                          name="telao_tts_modo"
                          value={config.telao_tts_modo || 'desativado'}
                          onChange={handleChange}
                          className="w-full bg-surface border border-outline-variant rounded-sm px-3 h-11 text-ink font-bold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary focus:border-primary"
                        >
                          <option value="desativado">🔇 Chamada por voz Desativada (Apenas campainha)</option>
                          <option value="sintetizador">🗣️ Sintetizador de Voz (TTS Padrão do Navegador)</option>
                          <option value="mp3">🎵 Arquivos de Áudio MP3 Pré-gravados</option>
                          <option value="ambos">🔊 Ambos (Tenta MP3, usa Sintetizador como Fallback)</option>
                        </select>
                      </div>

                      {(config.telao_tts_modo === 'sintetizador' || config.telao_tts_modo === 'ambos') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-surface-container-low border border-outline-variant/50 rounded-sm animate-fade-in">
                          <div className="col-span-2 font-bold text-ink text-sm border-b border-outline-variant/30 pb-2">
                            Configurações do Sintetizador de Voz (TTS)
                          </div>
                          <div>
                            <label className="block font-medium text-xs text-ink mb-1.5">Gênero da voz</label>
                            <select
                              name="telao_tts_voz"
                              value={config.telao_tts_voz || 'Feminina'}
                              onChange={handleChange}
                              className="w-full bg-surface border border-outline-variant rounded-sm px-3 h-11 text-ink font-bold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary"
                            >
                              <option value="Feminina">Feminina</option>
                              <option value="Masculina">Masculina</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block font-medium text-xs text-ink mb-1">Velocidade ({config.telao_tts_velocidade || '0.95'}x)</label>
                              <input
                                type="range"
                                name="telao_tts_velocidade"
                                min="0.5"
                                max="2.0"
                                step="0.05"
                                value={config.telao_tts_velocidade || '0.95'}
                                onChange={handleChange}
                                className="w-full h-1.5 bg-outline-variant rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                            <div>
                              <label className="block font-medium text-xs text-ink mb-1">Tom ({config.telao_tts_tom || '1.0'})</label>
                              <input
                                type="range"
                                name="telao_tts_tom"
                                min="0.5"
                                max="2.0"
                                step="0.05"
                                value={config.telao_tts_tom || '1.0'}
                                onChange={handleChange}
                                className="w-full h-1.5 bg-outline-variant rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                          </div>

                          <Input
                            name="telao_tts_template"
                            label="Template de chamada (sem nome)"
                            value={config.telao_tts_template || ''}
                            onChange={handleChange}
                            placeholder="Senha {senha}, dirija-se ao {guiche}."
                            className="col-span-2"
                          />

                          <Input
                            name="telao_tts_template_nome"
                            label="Template de chamada (com nome do cliente)"
                            value={config.telao_tts_template_nome || ''}
                            onChange={handleChange}
                            placeholder="Senha {senha}, {nome}, dirija-se ao {guiche}."
                            className="col-span-2"
                          />
                          <p className="col-span-2 text-[10px] text-ink-variant -mt-2">
                            Placeholders aceitos: <code className="bg-primary/5 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{senha}'}</code>, <code className="bg-primary/5 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{nome}'}</code>, <code className="bg-primary/5 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{guiche}'}</code>, <code className="bg-primary/5 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{balcao}'}</code>, <code className="bg-primary/5 px-1 py-0.5 rounded text-primary font-mono font-bold">{'{local}'}</code>
                          </p>

                          <div className="col-span-2 flex justify-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleTestTts}
                              icon={<Volume2 className="h-4 w-4" />}
                            >
                              Testar Sintetizador
                            </Button>
                          </div>
                        </div>
                      )}

                      {(config.telao_tts_modo === 'mp3' || config.telao_tts_modo === 'ambos') && (
                        <div className="grid grid-cols-1 gap-4 p-4 bg-surface-container-low border border-outline-variant/50 rounded-sm animate-fade-in">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-outline-variant/30 pb-3 gap-3">
                            <div>
                              <div className="font-bold text-ink text-sm">Gerenciamento de MP3</div>
                              <p className="text-[10px] text-ink-variant mt-0.5">ZIP contendo arquivos nomeados <code className="font-bold bg-primary/5 px-1 rounded">Senha_X_1.mp3</code>.</p>
                            </div>
                            <div>
                              <input
                                type="file"
                                id="tts-zip-upload-input"
                                accept=".zip"
                                className="hidden"
                                onChange={handleTtsZipUpload}
                              />
                              <Button
                                size="sm"
                                disabled={ttsUploadLoading}
                                onClick={() => document.getElementById('tts-zip-upload-input')?.click()}
                                icon={<Upload className="h-3.5 w-3.5" />}
                              >
                                {ttsUploadLoading ? 'Importando...' : 'Enviar ZIP'}
                              </Button>
                            </div>
                          </div>

                          {/* Cards com contadores de tipos */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-3 bg-surface border border-outline-variant/40 rounded-sm flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] font-bold text-ink-variant uppercase tracking-wider block">Tipo 1 (1ª Chamada)</span>
                                <span className="text-xl font-black text-ink block mt-0.5">{ttsStatus.tipo1.count} áudios</span>
                                <span className="text-[9px] text-ink-variant block mt-0.5">
                                  {ttsStatus.tipo1.range ? `Faixa: ${ttsStatus.tipo1.range}` : 'Sem áudios'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClearTts('tipo1')}
                                disabled={ttsStatus.tipo1.count === 0}
                                className="mt-2 text-[10px] font-bold text-error hover:underline self-start disabled:opacity-40 disabled:no-underline"
                              >
                                Limpar
                              </button>
                            </div>

                            <div className="p-3 bg-surface border border-outline-variant/40 rounded-sm flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] font-bold text-ink-variant uppercase tracking-wider block">Tipo 2 (Rechamada)</span>
                                <span className="text-xl font-black text-ink block mt-0.5">{ttsStatus.tipo2.count} áudios</span>
                                <span className="text-[9px] text-ink-variant block mt-0.5">
                                  {ttsStatus.tipo2.range ? `Faixa: ${ttsStatus.tipo2.range}` : 'Sem áudios'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClearTts('tipo2')}
                                disabled={ttsStatus.tipo2.count === 0}
                                className="mt-2 text-[10px] font-bold text-error hover:underline self-start disabled:opacity-40 disabled:no-underline"
                              >
                                Limpar
                              </button>
                            </div>

                            <div className="p-3 bg-surface border border-outline-variant/40 rounded-sm flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] font-bold text-ink-variant uppercase tracking-wider block">Tipo 3 (Var. 1ª)</span>
                                <span className="text-xl font-black text-ink block mt-0.5">{ttsStatus.tipo3.count} áudios</span>
                                <span className="text-[9px] text-ink-variant block mt-0.5">
                                  {ttsStatus.tipo3.range ? `Faixa: ${ttsStatus.tipo3.range}` : 'Sem áudios'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClearTts('tipo3')}
                                disabled={ttsStatus.tipo3.count === 0}
                                className="mt-2 text-[10px] font-bold text-error hover:underline self-start disabled:opacity-40 disabled:no-underline"
                              >
                                Limpar
                              </button>
                            </div>
                          </div>

                          {/* Preview de Teste de Senha */}
                          <div className="flex flex-col sm:flex-row items-center gap-3 bg-surface/50 border border-outline-variant/30 rounded-sm p-3 mt-1 justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-ink-variant uppercase">Testar Senha:</span>
                              <input
                                type="number"
                                min="1"
                                value={testPasswordNum}
                                onChange={(e) => setTestPasswordNum(e.target.value)}
                                className="w-16 bg-surface border border-outline-variant rounded-sm h-8 text-ink font-bold text-center focus:outline-none focus:border-primary text-xs"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleTestTtsAudioFile('tipo1')}
                                disabled={ttsStatus.tipo1.count === 0}
                                className="text-[10px] h-8"
                              >
                                Tipo 1
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleTestTtsAudioFile('tipo2')}
                                disabled={ttsStatus.tipo2.count === 0}
                                className="text-[10px] h-8"
                              >
                                Tipo 2
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleTestTtsAudioFile('tipo3')}
                                disabled={ttsStatus.tipo3.count === 0}
                                className="text-[10px] h-8"
                              >
                                Tipo 3
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="col-span-2 border-t border-outline-variant/30 pt-4 mt-2">
                      <label className="block font-medium text-sm text-ink mb-2">Arte de espera do telão</label>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        {config.telao_arte_espera && (
                          <div className="w-32 h-18 bg-black rounded border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
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
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => document.getElementById('arte-espera-input')?.click()}
                            icon={<Upload className="h-4 w-4" />}
                          >
                            {config.telao_arte_espera ? 'Alterar Arte' : 'Upload Arte (Rec: 1920x1080)'}
                          </Button>
                          <p className="text-[10px] text-ink-variant mt-1.5">Exibida nos telões enquanto aguardam vinculação.</p>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <Pointer className="h-5 w-5 text-primary" />
                    Totem & Autoatendimento
                  </h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                      <div className="flex flex-col">
                        <span className="font-bold text-ink text-sm">Ativar modo descanso (screensaver)</span>
                        <span className="text-[10px] text-ink-variant mt-0.5">Exibe mídias ou relógio quando inativo.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          name="totem_screensaver_ativo" 
                          checked={config.totem_screensaver_ativo === '1'} 
                          onChange={handleChange} 
                          className="sr-only peer" 
                        />
                        <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                      </label>
                    </div>

                    {config.totem_screensaver_ativo === '1' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-container-low border border-outline-variant/50 rounded-sm animate-fade-in">
                        <Input
                          name="totem_screensaver_timeout"
                          label="Tempo de inatividade (segundos)"
                          value={config.totem_screensaver_timeout || '120'}
                          onChange={handleChange}
                          type="number"
                          min="10"
                        />
                        <Input
                          name="totem_screensaver_intervalo"
                          label="Intervalo das mídias (segundos)"
                          value={config.totem_screensaver_intervalo || '10'}
                          onChange={handleChange}
                          type="number"
                          min="3"
                        />
                        <div className="col-span-2">
                          <label className="block font-medium text-xs text-ink mb-1.5">Modo do screensaver</label>
                          <select
                            name="totem_screensaver_modo"
                            value={config.totem_screensaver_modo || 'ambos'}
                            onChange={handleChange}
                            className="w-full bg-surface border border-outline-variant rounded-sm px-3 h-11 text-ink font-bold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary focus:border-primary"
                          >
                            <option value="midia">Apenas Mídias (Imagens/Vídeos)</option>
                            <option value="relogio">Apenas Relógio Digital Grande</option>
                            <option value="ambos">Mídias em loop com Relógio em Overlay</option>
                          </select>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                      <div className="flex flex-col">
                        <span className="font-bold text-ink text-sm">Solicitar nome do cliente</span>
                        <span className="text-[10px] text-ink-variant mt-0.5">Exibe teclado virtual no totem para o nome.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          name="totem_solicita_nome" 
                          checked={config.totem_solicita_nome === '1'} 
                          onChange={handleChange} 
                          className="sr-only peer" 
                        />
                        <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <Printer className="h-5 w-5 text-primary" />
                    Impressora Térmica
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block font-medium text-sm text-ink mb-1.5">Selecionar impressora</label>
                      <select
                        name="impressora_interface"
                        value={config.impressora_interface || ''}
                        onChange={handleChange}
                        className="w-full bg-surface border border-outline-variant rounded-sm px-3 h-11 text-ink font-bold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary focus:border-primary"
                      >
                        <option value="">-- Simulação --</option>
                        {printers.map(p => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-sm text-ink mb-1.5">Voz de alerta do celular</label>
                      <select
                        name="portal_voz_alerta"
                        value={config.portal_voz_alerta || 'Feminina'}
                        onChange={handleChange}
                        className="w-full bg-surface border border-outline-variant rounded-sm px-3 h-11 text-ink font-bold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary focus:border-primary"
                      >
                        <option value="Feminina">Voz Feminina (Padrão)</option>
                        <option value="Masculina">Voz Masculina</option>
                        <option value="Apenas Beep">Apenas Som (Beep)</option>
                        <option value="AudioGravado">Áudio Gravado (.mp3)</option>
                      </select>
                    </div>

                    {config.portal_voz_alerta === 'AudioGravado' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-sm border border-primary/10 animate-fade-in">
                        <div className="flex flex-col gap-2">
                          <label className="block font-bold text-xs text-ink-variant">Áudio "sua vez chegou"</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              id="audio-suavez-input"
                              className="hidden"
                              accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
                              onChange={handleAudioUpload('portal_som_sua_vez')}
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => document.getElementById('audio-suavez-input')?.click()}
                            >
                              {config.portal_som_sua_vez ? 'Alterar' : 'Escolher'}
                            </Button>
                            {config.portal_som_sua_vez && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    const audio = new Audio(config.portal_som_sua_vez);
                                    audio.play();
                                  }}
                                  className="px-2"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleTestAudioPortal('sua_vez')}
                                  className="px-2 text-amber-600"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] text-ink-variant">
                            {config.portal_som_sua_vez ? '✅ Áudio configurado' : '⚠️ Usará fallback TTS'}
                          </span>
                        </div>
     
                        <div className="flex flex-col gap-2">
                          <label className="block font-bold text-xs text-ink-variant">Áudio "senha próxima"</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              id="audio-prestes-input"
                              className="hidden"
                              accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
                              onChange={handleAudioUpload('portal_som_prestes_chamar')}
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => document.getElementById('audio-prestes-input')?.click()}
                            >
                              {config.portal_som_prestes_chamar ? 'Alterar' : 'Escolher'}
                            </Button>
                            {config.portal_som_prestes_chamar && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    const audio = new Audio(config.portal_som_prestes_chamar);
                                    audio.play();
                                  }}
                                  className="px-2"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleTestAudioPortal('prestes_chamar')}
                                  className="px-2 text-amber-600"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] text-ink-variant">
                            {config.portal_som_prestes_chamar ? '✅ Áudio configurado' : '⚠️ Usará fallback TTS'}
                          </span>
                        </div>
                      </div>
                    )}

                    <Input
                      name="portal_cliente_url"
                      label="Url do portal do cliente (QR Code)"
                      value={config.portal_cliente_url || ''}
                      onChange={handleChange}
                      placeholder="Ex: https://chamacliente.vercel.app"
                      type="text"
                    />

                    <div className="border-t border-outline-variant/35 pt-4 mt-2 flex flex-col xl:flex-row gap-4">
                      <div className="flex-1">
                        <label className="block font-medium text-sm text-ink mb-3">Layout do ticket impresso</label>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-sm border border-outline-variant/35">
                            <span className="font-bold text-ink text-xs">Exibir logotipo</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" name="print_logo" checked={config.print_logo !== '0'} onChange={handleChange} className="sr-only peer" />
                              <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                            </label>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-sm border border-outline-variant/35">
                            <span className="font-bold text-ink text-xs">Exibir nome do estabelecimento</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" name="print_escrita" checked={config.print_escrita !== '0'} onChange={handleChange} className="sr-only peer" />
                              <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                            </label>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-sm border border-outline-variant/35">
                            <span className="font-bold text-ink text-xs">Exibir QR Code</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" name="print_qrcode" checked={config.print_qrcode !== '0'} onChange={handleChange} className="sr-only peer" />
                              <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Preview Visual do Ticket */}
                      <div className="w-full xl:w-[240px] shrink-0 bg-surface-container-low border border-outline-variant rounded-sm p-4 flex flex-col items-center overflow-hidden relative">
                        <label className="block font-bold text-[10px] text-ink-variant uppercase tracking-wider mb-2">Simulação do Ticket</label>
                        
                        {/* Boca da impressora */}
                        <div className="w-[90%] h-3 bg-ink rounded-full mb-0 z-10 shadow-sm relative">
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-0.5 bg-black/50 rounded-full"></div>
                        </div>
                        
                        <div 
                          key={`${config.print_logo}-${config.print_escrita}-${config.print_qrcode}-${config.nome_estabelecimento}`}
                          className="w-[85%] bg-white shadow-md pt-3 pb-6 px-3 flex flex-col items-center gap-2 relative z-0 animate-print-slide"
                        >
                          {config.print_logo !== '0' && config.logo_cliente && (
                            <img src={`${API_URL}${config.logo_cliente}`} className="h-6 object-contain grayscale opacity-80" alt="Logo Preview" />
                          )}
                          
                          {config.print_escrita !== '0' && (
                            <div className="font-bold text-center text-[9px] text-black w-full break-words leading-tight uppercase">
                              {config.nome_estabelecimento || 'CHAMAAÍ'}
                            </div>
                          )}
                          
                          <div className="w-full border-t border-dashed border-gray-300 my-0.5"></div>
                          
                          <div className="text-center w-full">
                            <div className="text-[8px] text-black/60 uppercase">Senha</div>
                            <div className="text-2xl font-black text-black">A001</div>
                          </div>
                          
                          <div className="w-full border-t border-dashed border-gray-300 my-0.5"></div>

                          {config.print_qrcode !== '0' && (
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="w-12 h-12 bg-black p-0.5">
                                 <div className="w-full h-full bg-white grid grid-cols-4 gap-0.5 p-0.5">
                                   {Array.from({ length: 16 }).map((_, i) => (
                                     <div key={i} className={`bg-black ${Math.random() > 0.4 ? 'opacity-100' : 'opacity-0'}`}></div>
                                   ))}
                                 </div>
                              </div>
                              <div className="text-[6px] text-black/60 text-center uppercase tracking-wider mt-0.5">Acompanhe pelo celular</div>
                            </div>
                          )}
                          
                          {/* Efeito serrilhado */}
                          <div className="absolute -bottom-1.5 left-0 right-0 h-3 bg-[radial-gradient(circle,transparent_50%,#fff_50%)] bg-[length:6px_6px] bg-bottom bg-repeat-x rotate-180"></div>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={async () => {
                        const api = (window as any).api;
                        if (api?.testPrinter) {
                          try {
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
                      className="w-full h-11 uppercase tracking-wider text-xs"
                      variant="secondary"
                      icon={<Printer className="h-4 w-4" />}
                    >
                      Imprimir Ticket de Teste
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Sistema */}
          {activeTab === 'sistema' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <CloudLightning className="h-5 w-5 text-primary" />
                    Backup & Dados
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block font-medium text-xs text-ink mb-2 uppercase">Incluir no backup</label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { key: 'backup_incluir_config', label: 'Configurações', icon: <Settings className="h-4 w-4" /> },
                          { key: 'backup_incluir_operadores', label: 'Operadores', icon: <Users className="h-4 w-4" /> },
                          { key: 'backup_incluir_balcoes', label: 'Balcões', icon: <CreditCard className="h-4 w-4" /> },
                          { key: 'backup_incluir_midias', label: 'Mídias e Imagens', icon: <ImageIcon className="h-4 w-4" /> },
                        ].map(item => (
                          <label key={item.key} className={`flex items-center gap-2 p-3 rounded-sm border cursor-pointer transition-all ${
                            config[item.key] !== '0'
                              ? 'bg-primary/5 border-primary/30 text-ink'
                              : 'bg-surface-container-low border-outline-variant/30 text-ink-variant'
                          }`}>
                            <input
                              type="checkbox"
                              name={item.key}
                              checked={config[item.key] !== '0'}
                              onChange={handleChange}
                              className="w-4 h-4 rounded accent-primary shrink-0"
                            />
                            {item.icon}
                            <span className="font-bold text-[10px] uppercase tracking-wider">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className={`border-t border-outline-variant/30 pt-4 space-y-4 transition-opacity ${
                      config.backup_incluir_config === '0' && config.backup_incluir_operadores === '0' && config.backup_incluir_balcoes === '0' && config.backup_incluir_midias === '0'
                        ? 'opacity-40 pointer-events-none' : ''
                    }`}>
                      <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                        <div>
                          <span className="font-bold text-ink text-sm block">Agendamento automático</span>
                          {config.backup_incluir_config === '0' && config.backup_incluir_operadores === '0' && config.backup_incluir_balcoes === '0' && config.backup_incluir_midias === '0' && (
                            <span className="text-[10px] text-error font-bold">Selecione ao menos um item acima</span>
                          )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="backup_agendado_ativo" checked={config.backup_agendado_ativo === '1'} onChange={handleChange} className="sr-only peer" />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-medium text-xs text-ink mb-1.5">Frequência</label>
                          <select
                            name="backup_frequencia"
                            value={config.backup_frequencia || 'diario'}
                            onChange={handleChange}
                            className="w-full bg-surface border border-outline-variant rounded-sm px-3 h-11 text-ink font-bold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary focus:border-primary"
                          >
                            <option value="diario">Diário</option>
                            <option value="semanal">Semanal (Domingos)</option>
                            <option value="mensal">Mensal (Dia 1º)</option>
                          </select>
                        </div>
                        <Input
                          name="backup_destino"
                          label="Destino dos backups"
                          value={config.backup_destino || ''}
                          onChange={handleChange}
                          placeholder="C:\ChamaAi\Backups (padrão)"
                          type="text"
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <Button
                        onClick={handleBackup}
                        variant="secondary"
                        className="w-full justify-between"
                        icon={<Download className="h-4 w-4" />}
                      >
                        Gerar Backup Agora
                      </Button>

                      <div className="relative">
                        <input type="file" id="restore-input" className="hidden" accept=".json,.zip" onChange={handleRestore} />
                        <Button
                          onClick={() => document.getElementById('restore-input')?.click()}
                          variant="secondary"
                          className="w-full justify-between"
                          icon={<Upload className="h-4 w-4" />}
                        >
                          Restaurar Backup Manual
                        </Button>
                      </div>
                    </div>

                    {backups.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-outline-variant/30">
                        <h3 className="font-bold text-xs text-ink mb-3 flex items-center gap-1.5 uppercase">
                          <History className="h-4 w-4 text-primary" />
                          Histórico de Backups
                        </h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {backups.map((bkp, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-surface-container-low rounded-sm border border-outline-variant/30 hover:border-primary/30 transition-all group">
                              <div className="flex flex-col">
                                <span className="font-bold text-ink text-xs">{bkp.nome}</span>
                                <span className="text-ink-variant text-[9px] uppercase mt-0.5">
                                  {new Date(bkp.criado_em).toLocaleString()} • {bkp.tamanhoMB} MB
                                </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="px-2"
                                  onClick={() => handleRestoreLocal(bkp.nome)}
                                  title="Restaurar"
                                >
                                  <RotateCcw className="h-3.5 w-3.5 text-success" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="px-2"
                                  onClick={() => handleDeleteBackup(bkp.nome)}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-error" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <Wrench className="h-5 w-5 text-primary" />
                    Sistema
                  </h2>
                  <div className="space-y-4">
                    <div className="p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                      <div className="flex items-center justify-between">
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
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          if ((window as any).api?.createShortcut) {
                            const res = await (window as any).api.createShortcut('totem', 'ChamaAí Totem');
                            if (res?.success) alert('Atalho do Totem criado na Área de Trabalho!');
                          }
                        }}
                        className="flex-col gap-1 py-3 text-xs uppercase"
                        icon={<Pointer className="h-4 w-4" />}
                      >
                        Atalho Totem
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          if ((window as any).api?.createShortcut) {
                            const res = await (window as any).api.createShortcut('telao', 'ChamaAí Telão');
                            if (res?.success) alert('Atalho do Telão criado na Área de Trabalho!');
                          }
                        }}
                        className="flex-col gap-1 py-3 text-xs uppercase"
                        icon={<Tv className="h-4 w-4" />}
                      >
                        Atalho Telão
                      </Button>
                    </div>

                    <Input
                      name="tempo_destaque_senha"
                      label="Tempo de destaque (segundos)"
                      value={config.tempo_destaque_senha || ''}
                      onChange={handleChange}
                      type="number"
                      min="1"
                    />

                    <div>
                      <label className="block font-medium text-xs text-ink mb-1.5 uppercase">Som do chamado</label>
                      <div className="flex gap-2">
                        <select
                          name="tipo_som"
                          value={config.tipo_som || 'bell'}
                          onChange={handleChange}
                          className="flex-grow bg-surface border border-outline-variant rounded-sm px-3 h-11 text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary focus:border-primary"
                        >
                          {SOUND_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                        <Button
                          variant="secondary"
                          onClick={handleTestSound}
                          className="px-3"
                          icon={<Volume2 className="h-4 w-4" />}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                  <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                    <RefreshCcw className="h-5 w-5 text-primary" />
                    Atualização do Sistema
                  </h2>
                  <div className="space-y-4">
                    <div className="p-4 bg-surface-container-low rounded-sm border border-outline-variant/35">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink text-sm">Atualização Automática</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            name="atualizacao_automatica" 
                            checked={config.atualizacao_automatica !== '0'} 
                            onChange={handleChange} 
                            className="sr-only peer" 
                          />
                          <div className="w-10 h-5 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-success transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4"></div>
                        </label>
                      </div>
                      <p className="text-[9px] text-ink-variant mt-2 leading-relaxed">
                        Se desativado, busque atualizações manualmente usando Senha Master.
                      </p>
                    </div>
                    
                    <Input
                      name="update_path"
                      label="Pasta de atualizações offline"
                      value={config.update_path || ''}
                      onChange={handleChange}
                      placeholder="C:\ChamaAi_Atualizacoes (padrão)"
                      type="text"
                      className="font-mono text-xs"
                    />

                    <div className="flex flex-col gap-2 pt-2">
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          if (config.atualizacao_automatica === '0') {
                            setShowUpdateLogin(true);
                            return;
                          }
                          const api = (window as any).api;
                          if (api?.checkForUpdates) {
                            const res = await api.checkForUpdates();
                            alert(res.message);
                          } else {
                            alert('⚠️ Use o App Desktop (.exe) para buscar atualizações.');
                          }
                        }}
                        className="w-full justify-between"
                        icon={<Search className="h-4 w-4" />}
                      >
                        Buscar Atualizações
                      </Button>

                      <Button
                        onClick={async (e) => {
                          if (!confirm('O sistema aplicará a atualização agora. Ele vai preparar o ambiente, baixar a nova versão e reiniciar automaticamente. Deseja continuar?')) return;
                          
                          const btn = e.currentTarget;
                          const originalText = btn.innerText;
                          btn.innerText = 'Preparando Instalação...';
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
                            btn.innerText = originalText;
                            btn.removeAttribute('disabled');
                            btn.style.opacity = '';
                          }
                        }}
                        className="w-full"
                        icon={<Download className="h-4 w-4" />}
                      >
                        Instalar Atualização Agora
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Segurança */}
          {activeTab === 'seguranca' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
              {isMasterServer && (
                <div className="space-y-6">
                  <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant">
                    <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2 border-b border-outline-variant/30 pb-3 uppercase tracking-wide">
                      <Shield className="h-5 w-5 text-primary" />
                      Acesso Remoto Master
                    </h2>
                    <div className="space-y-4">
                      <p className="text-xs text-ink-variant font-medium leading-relaxed">
                        Defina uma senha para permitir que outros dispositivos na rede acessem o painel administrativo como Master.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          label="Criar/Nova senha master (min. 6 carac.)"
                          placeholder={hasMasterPassword ? 'Nova senha' : 'Criar senha'}
                          value={newMasterPwd}
                          onChange={(e) => setNewMasterPwd(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSetMasterPassword()}
                          className="flex-grow"
                        />
                        <div className="flex items-end">
                          <Button
                            onClick={handleSetMasterPassword}
                            className="h-11"
                          >
                            {hasMasterPassword ? 'Alterar' : 'Definir'}
                          </Button>
                        </div>
                      </div>
                      {masterPwdMsg && (
                        <p className={`text-xs font-bold ${masterPwdMsg.startsWith('✅') ? 'text-success' : 'text-error'}`}>{masterPwdMsg}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`w-2 h-2 rounded-full ${hasMasterPassword ? 'bg-success' : 'bg-outline-variant'}`}></span>
                        <span className="text-[10px] text-ink-variant font-bold uppercase tracking-wider">
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

      {showUpdateLogin && (
        <Dialog
          open={showUpdateLogin}
          onClose={() => { setShowUpdateLogin(false); setMasterLoginError(''); setMasterPassword(''); }}
          title="Autenticação Necessária"
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-variant">
              Insira a Senha Master Remota para buscar atualizações do sistema.
            </p>
            <Input
              type="password"
              label="Senha Master"
              placeholder="Senha Master"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdateLogin()}
              autoFocus
            />
            {masterLoginError && <p className="text-error text-xs font-bold">{masterLoginError}</p>}
            <div className="flex justify-end gap-2 mt-4 pt-2">
              <Button
                variant="ghost"
                onClick={() => { setShowUpdateLogin(false); setMasterLoginError(''); setMasterPassword(''); }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateLogin}
                disabled={masterLoginLoading || !masterPassword}
              >
                {masterLoginLoading ? 'Verificando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </AdminLayout>
  );
}
