import { useState, useEffect } from 'react';
import { getApiUrl } from './shared/apiConfig';
import { HashRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import Emissao from './totem/Emissao';
import Confirmacao from './totem/Confirmacao';
import Controle from './operador/Controle';
import ControleTouch from './operador/ControleTouch';
import MediaIndoor from './telao/MediaIndoor';
import SenhaChamada from './telao/SenhaChamada';
import Dashboard from './admin/Dashboard';
import Configuracoes from './admin/Configuracoes';
import GerenciarMidias from './admin/GerenciarMidias';
import MediaIndoorAdmin from './admin/MediaIndoorAdmin';
import Devices from './admin/Devices';
import Queue from './admin/Queue';
import Operators from './admin/Operators';
import Relatorios from './admin/Relatorios';
import ToledoConfig from './admin/ToledoConfig';
import AdminEncarte from './admin/AdminEncarte';
import Seguranca from './admin/Seguranca';
import MobileOperador from './operador/MobileOperador';
import Bridge from './operador/Bridge';
import Login from './Login';
import ClientePortal from './cliente/ClientePortal';
import LicenseGate from './shared/LicenseGate';
import GlobalUpdateNotification from './shared/GlobalUpdateNotification';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const location = useLocation();
  const API_URL = getApiUrl();

  useEffect(() => {
    const verifyToken = async () => {
      const isElectron = !!(window as any).api;
      const isLocalAppNoLogin = isElectron && ((window as any).api?.LOCAL_APP_NO_LOGIN || import.meta.env.VITE_LOCAL_APP_NO_LOGIN === 'true');

      if (isLocalAppNoLogin) {
        if (!localStorage.getItem('user_token')) {
          localStorage.setItem('user_token', 'LOCAL_ELECTRON_SESSION');
          localStorage.setItem('user_perfil', 'admin');
          localStorage.setItem('user_session', JSON.stringify({ token: 'LOCAL_ELECTRON_SESSION' }));
        }
      }

      const token = localStorage.getItem('user_token');
      if (!token) {
        setAuthorized(false);
        setChecking(false);
        return;
      }

      try {
        const headers: Record<string, string> = {};
        headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch(`${API_URL}/api/auth/me`, { headers });
        if (res.ok) {
          const profile = await res.json();
          setUserProfile(profile);
          
          if (requireAdmin && profile.perfil !== 'admin') {
            setAuthorized(false);
          } else {
            setAuthorized(true);
          }
        } else {
          if (isLocalAppNoLogin) {
            setUserProfile({ login: 'local_admin', perfil: 'admin', primeiro_acesso: 0 });
            setAuthorized(true);
          } else {
            localStorage.removeItem('user_token');
            localStorage.removeItem('user_perfil');
            setAuthorized(false);
          }
        }
      } catch (err) {
        console.error('Erro de rede ao validar autenticação:', err);
        if (isLocalAppNoLogin) {
          setUserProfile({ login: 'local_admin', perfil: 'admin', primeiro_acesso: 0 });
          setAuthorized(true);
        } else {
          // Em erro de rede (PC acordando/Wi-Fi oscilando), mantém autorizado temporariamente
          setAuthorized(true);
        }
      } finally {
        setChecking(false);
      }
    };

    verifyToken();
  }, [API_URL, requireAdmin]);

  if (checking) {
    return (
      <div className="h-screen w-full flex flex-col gap-4 items-center justify-center font-sans text-slate-400 bg-slate-950 font-bold uppercase tracking-widest text-xs">
        <span className="material-symbols-outlined animate-spin text-4xl text-blue-500">refresh</span>
        Verificando credenciais...
      </div>
    );
  }

  if (!authorized) {
    if (userProfile && requireAdmin && userProfile.perfil !== 'admin') {
      return <Navigate to="/operador" replace />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function ProtectedRouteQueue({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const API_URL = getApiUrl();

  useEffect(() => {
    const checkQueueStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        if (res.ok) {
          const data = await res.json();
          setEnabled(data.habilitar_filas_avancadas === '1');
        }
      } catch (err) {
        console.error('Falha ao verificar permissões de fila:', err);
      }
      setChecking(false);
    };
    checkQueueStatus();
  }, [API_URL]);

  if (checking) {
    return <div className="h-screen w-full flex items-center justify-center font-sans text-ink-secondary bg-background font-bold uppercase tracking-widest text-xs">Verificando módulo...</div>;
  }

  if (!enabled) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

function Home() {
  // Só redireciona automaticamente dentro do Electron (app empacotado).
  // No navegador web (localhost), sempre mostra o menu de seleção.
  const isElectron = !!(window as any).api;
  const appMode = localStorage.getItem('app_mode');
  if (isElectron && appMode === 'touch') {
    return <Navigate to="/operador-touch" replace />;
  }
  if (isElectron && appMode === 'tv') {
    return <Navigate to="/telao" replace />;
  }

  const [showModal, setShowModal] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');

  const handleSaveConnection = () => {
    if (tempIp.trim() === '') {
      localStorage.removeItem('server_ip_override');
    } else {
      localStorage.setItem('server_ip_override', tempIp.trim());
    }
    setShowModal(false);
    window.location.reload();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-background text-ink font-sans">
      <div className="mb-12 flex flex-col items-center">
        <h1 className="font-sans text-[64px] font-bold text-primary tracking-widest uppercase">ChamaAí</h1>
        <p className="text-ink-secondary font-bold uppercase tracking-widest">Sistema de Gestão de Atendimento</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl w-full">
        {/* Totem */}
        <Link to="/totem" className="group p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[40px]">confirmation_number</span>
          </div>
          <h2 className="font-sans text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Totem</h2>
          <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Emissão de senhas para clientes.</p>
        </Link>
        
        {/* Telão */}
        <Link to="/telao" className="group p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-success/10 text-success flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[40px]">desktop_windows</span>
          </div>
          <h2 className="font-sans text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Telão</h2>
          <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Mídia indoor e chamadas.</p>
        </Link>
        
        {/* Operador */}
        <div className="flex flex-col gap-4">
          <Link to="/operador" className="group flex-1 p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-ink/5 text-ink flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[40px]">person</span>
            </div>
            <h2 className="font-sans text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Operador</h2>
            <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Painel Padrão (Vertical)</p>
          </Link>
          <Link 
            to="/operador-touch" 
            onClick={() => localStorage.setItem('app_mode', 'touch')}
            className="group p-4 bg-surface rounded-[24px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-primary">tablet_landscape</span>
            <span className="font-sans text-sm font-bold text-ink uppercase tracking-wider">Painel Touch (TV)</span>
          </Link>
          <Link to="/bridge" className="group p-4 bg-blue-600 rounded-[24px] shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all flex items-center justify-center gap-3 text-white">
            <span className="material-symbols-outlined">smartphone</span>
            <span className="font-sans text-sm font-bold uppercase tracking-wider">Conectar Celular (PWA)</span>
          </Link>
        </div>
        
        {/* Admin */}
        <Link to="/admin" className="group p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[40px]">admin_panel_settings</span>
          </div>
          <h2 className="font-sans text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Admin</h2>
          <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Gestão e configurações.</p>
        </Link>
      </div>

      <div className="mt-16 flex flex-col items-center gap-4 w-full max-w-lg">
        <div className="w-full h-[1px] bg-outline-variant/30"></div>
        <button 
          onClick={() => setShowModal(true)}
          className="group relative flex flex-col items-center gap-2 p-6 rounded-[24px] border border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5 transition-all w-full"
        >
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined font-bold">hub</span>
            <span className="font-sans text-sm font-bold uppercase tracking-[0.2em]">Configuração de Conexão</span>
          </div>
          
          <div className="text-center">
            <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest mb-1">Status Atual:</p>
            <span className={`text-xs font-black uppercase tracking-widest ${localStorage.getItem('server_ip_override') ? 'text-success' : 'text-primary'}`}>
              {localStorage.getItem('server_ip_override') 
                ? `Conectado ao Servidor: ${localStorage.getItem('server_ip_override')}` 
                : 'Este PC é o SERVIDOR PRINCIPAL (Localhost)'}
            </span>
          </div>

          <span className="absolute top-2 right-4 text-[10px] font-bold text-ink-secondary/20 group-hover:text-primary/40 transition-colors uppercase tracking-tighter">Clique para alterar</span>
        </button>
        
        <p className="text-[10px] text-ink-secondary/50 font-bold uppercase tracking-[0.2em] text-center leading-relaxed">
          Para terminais clientes (Totem/Operador), aponte para o IP do Telão.<br/>
          O IP deve ser fixo no roteador para evitar desconexões.
        </p>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-8 max-w-md w-full shadow-2xl border border-outline-variant/30 flex flex-col gap-6">
            <div>
              <h3 className="font-sans text-2xl font-bold text-ink uppercase mb-2">Configuração de Rede</h3>
              <p className="text-sm font-sans text-ink-secondary font-medium">
                Digite o IP ou Nome do Computador Principal (Telão) para que este terminal se conecte a ele.
              </p>
            </div>
            <div>
              <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">IP DO SERVIDOR</label>
              <input 
                type="text" 
                value={tempIp}
                onChange={(e) => setTempIp(e.target.value)}
                placeholder="Ex: 192.168.1.100 (Deixe em branco para este PC ser o Servidor)"
                className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold text-lg"
                autoFocus
              />
              <p className="text-[10px] text-ink-secondary/60 mt-2 font-semibold uppercase tracking-wider">
                Deixe o campo vazio para que este computador atue como o Servidor Principal (Localhost).
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowModal(false)}
                className="flex-1 py-4 bg-surface-variant text-ink rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-outline-variant/50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveConnection}
                className="flex-1 py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-primary-hover active:scale-95 transition-all"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 text-ink-secondary text-xs opacity-50 font-bold uppercase tracking-widest">
        ChamaAí v1.0.115
      </div>
    </div>
  );
}
function hexToHsl(hex: string): [number, number, number] {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) / 255;
  let g = ((num >> 8) & 0xff) / 255;
  let b = (num & 0xff) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function getContrastColor(hexColor: string): string {
  const cleanHex = hexColor.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return '#ffffff';
  }
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#0f172a' : '#ffffff';
}

function hexToRgb(hexColor: string): [number, number, number] {
  const cleanHex = hexColor.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [isNaN(r) ? 37 : r, isNaN(g) ? 99 : g, isNaN(b) ? 235 : b];
}

export default function App() {
  useEffect(() => {
    console.log('[RENDERER] renderer-ready tentando enviar');

    if ((window as any).api && (window as any).api.rendererReady) {
      (window as any).api.rendererReady();
    }
    if ((window as any).electronAPI && (window as any).electronAPI.rendererReady) {
      (window as any).electronAPI.rendererReady();
    }

    console.log('[RENDERER] renderer-ready chamado');

    const applyPrimaryColor = async () => {
      try {
        const API_URL = getApiUrl();
        const res = await fetch(`${API_URL}/api/configuracoes`);
        if (res.ok) {
          const config = await res.json();
          const corOriginal = config.cor_primaria || '#2563eb';
          const [h, s, l] = hexToHsl(corOriginal);
          const hoverColor = hslToHex(h, s, Math.max(0, l - 12));
          const [r_val, g_val, b_val] = hexToRgb(corOriginal);
          document.documentElement.style.setProperty('--color-primary', corOriginal);
          document.documentElement.style.setProperty('--color-primary-hover', hoverColor);
          document.documentElement.style.setProperty('--color-on-primary', getContrastColor(corOriginal));
          document.documentElement.style.setProperty('--color-primary-rgb', `${r_val}, ${g_val}, ${b_val}`);
        }
      } catch (err) {
        console.error('Failed to load primary color config:', err);
      }
    };
    applyPrimaryColor();

    const handleConfigUpdated = (e: any) => {
      if (e.detail?.cor_primaria) {
        const corOriginal = e.detail.cor_primaria;
        const [h, s, l] = hexToHsl(corOriginal);
        const hoverColor = hslToHex(h, s, Math.max(0, l - 12));
        const [r_val, g_val, b_val] = hexToRgb(corOriginal);
        document.documentElement.style.setProperty('--color-primary', corOriginal);
        document.documentElement.style.setProperty('--color-primary-hover', hoverColor);
        document.documentElement.style.setProperty('--color-on-primary', getContrastColor(corOriginal));
        document.documentElement.style.setProperty('--color-primary-rgb', `${r_val}, ${g_val}, ${b_val}`);
      }
    };
    window.addEventListener('CONFIG_ATUALIZADA', handleConfigUpdated);
    return () => window.removeEventListener('CONFIG_ATUALIZADA', handleConfigUpdated);
  }, []);

  return (
    <LicenseGate>
      <HashRouter>
        <GlobalUpdateNotification />
        <Routes>
          <Route path="/" element={<Home />} />
          
          <Route path="/totem" element={<Emissao />} />
          <Route path="/totem/confirmacao" element={<Confirmacao />} />
          
          <Route path="/telao" element={<MediaIndoor />} />
          <Route path="/telao/chamada" element={<SenhaChamada />} />
          
          <Route path="/cliente" element={<ClientePortal />} />
          
          <Route path="/login" element={<Login />} />
          
          <Route path="/operador" element={<ProtectedRoute><Controle /></ProtectedRoute>} />
          <Route path="/operador-touch" element={<ProtectedRoute><ControleTouch /></ProtectedRoute>} />
          <Route path="/mobile" element={<ProtectedRoute><MobileOperador /></ProtectedRoute>} />
          <Route path="/bridge" element={<Bridge />} />
          
          <Route path="/admin" element={<ProtectedRoute requireAdmin><Dashboard /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><Configuracoes /></ProtectedRoute>} />
          <Route path="/admin/seguranca" element={<ProtectedRoute requireAdmin><Seguranca /></ProtectedRoute>} />
          <Route path="/admin/midias" element={<ProtectedRoute requireAdmin><GerenciarMidias /></ProtectedRoute>} />
          <Route path="/admin/media-indoor" element={<ProtectedRoute requireAdmin><MediaIndoorAdmin /></ProtectedRoute>} />
          <Route path="/admin/devices" element={<ProtectedRoute requireAdmin><Devices /></ProtectedRoute>} />
          <Route path="/admin/queue" element={<ProtectedRoute requireAdmin><ProtectedRouteQueue><Queue /></ProtectedRouteQueue></ProtectedRoute>} />
          <Route path="/admin/operators" element={<ProtectedRoute requireAdmin><Operators /></ProtectedRoute>} />
          <Route path="/admin/relatorios" element={<ProtectedRoute requireAdmin><Relatorios /></ProtectedRoute>} />
          <Route path="/admin/toledo" element={<ProtectedRoute requireAdmin><ToledoConfig /></ProtectedRoute>} />
          <Route path="/admin/encarte" element={<ProtectedRoute requireAdmin><AdminEncarte /></ProtectedRoute>} />
        </Routes>
      </HashRouter>
    </LicenseGate>
  );
}
