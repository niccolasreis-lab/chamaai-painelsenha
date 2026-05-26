import { useState } from 'react';
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
import Devices from './admin/Devices';
import Queue from './admin/Queue';
import Operators from './admin/Operators';
import Relatorios from './admin/Relatorios';
import ToledoConfig from './admin/ToledoConfig';
import MobileOperador from './operador/MobileOperador';
import Bridge from './operador/Bridge';
import Login from './Login';
import ClientePortal from './cliente/ClientePortal';
import LicenseGate from './shared/LicenseGate';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const session = localStorage.getItem('user_session');
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  try {
    const data = JSON.parse(session);
    if (requireAdmin && data.user.perfil !== 'admin') {
      return <Navigate to="/operador" replace />;
    }
    return <>{children}</>;
  } catch (e) {
    localStorage.removeItem('user_session');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
}

function Home() {
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
          <Link to="/operador-touch" className="group p-4 bg-surface rounded-[24px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex items-center justify-center gap-3">
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
        ChamaAí v1.0.55
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LicenseGate>
      <HashRouter>
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
          <Route path="/admin/midias" element={<ProtectedRoute requireAdmin><GerenciarMidias /></ProtectedRoute>} />
          <Route path="/admin/devices" element={<ProtectedRoute requireAdmin><Devices /></ProtectedRoute>} />
          <Route path="/admin/queue" element={<ProtectedRoute requireAdmin><Queue /></ProtectedRoute>} />
          <Route path="/admin/operators" element={<ProtectedRoute requireAdmin><Operators /></ProtectedRoute>} />
          <Route path="/admin/relatorios" element={<ProtectedRoute requireAdmin><Relatorios /></ProtectedRoute>} />
          <Route path="/admin/toledo" element={<ProtectedRoute requireAdmin><ToledoConfig /></ProtectedRoute>} />
        </Routes>
      </HashRouter>
    </LicenseGate>
  );
}
