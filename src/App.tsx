import { HashRouter, Routes, Route, Link } from 'react-router-dom';
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
import MobileOperador from './operador/MobileOperador';

function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    // Se for mobile/tablet (tamanho de tela ou user agent), redireciona para o painel mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth < 1024;
    
    if (isMobile || isSmallScreen) {
      navigate('/mobile');
    }
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-background text-ink font-rajdhani">
      <div className="mb-12 flex flex-col items-center">
        <h1 className="font-oswald text-[64px] font-bold text-primary tracking-widest uppercase">ChamaAí</h1>
        <p className="text-ink-secondary font-bold uppercase tracking-widest">Sistema de Gestão de Atendimento</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl w-full">
        {/* Totem */}
        <Link to="/totem" className="group p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[40px]">confirmation_number</span>
          </div>
          <h2 className="font-oswald text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Totem</h2>
          <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Emissão de senhas para clientes.</p>
        </Link>
        
        {/* Telão */}
        <Link to="/telao" className="group p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-success/10 text-success flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[40px]">desktop_windows</span>
          </div>
          <h2 className="font-oswald text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Telão</h2>
          <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Mídia indoor e chamadas.</p>
        </Link>
        
        {/* Operador */}
        <div className="flex flex-col gap-4">
          <Link to="/operador" className="group flex-1 p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-ink/5 text-ink flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[40px]">person</span>
            </div>
            <h2 className="font-oswald text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Operador</h2>
            <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Painel Padrão (Vertical)</p>
          </Link>
          <Link to="/operador-touch" className="group p-4 bg-surface rounded-[24px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-primary">tablet_landscape</span>
            <span className="font-oswald text-sm font-bold text-ink uppercase tracking-wider">Painel Touch (TV)</span>
          </Link>
          <Link to="/mobile" className="group p-4 bg-blue-600 rounded-[24px] shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all flex items-center justify-center gap-3 text-white">
            <span className="material-symbols-outlined">smartphone</span>
            <span className="font-oswald text-sm font-bold uppercase tracking-wider">Acesso Mobile (APK)</span>
          </Link>
        </div>
        
        {/* Admin */}
        <Link to="/admin" className="group p-10 bg-surface rounded-[32px] shadow-sm border border-outline-variant/50 hover:border-primary transition-all flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[40px]">admin_panel_settings</span>
          </div>
          <h2 className="font-oswald text-2xl font-bold text-ink mb-2 uppercase tracking-wide">Admin</h2>
          <p className="text-sm text-ink-secondary font-semibold uppercase tracking-widest">Gestão e configurações.</p>
        </Link>
      </div>

      <div className="mt-16 flex flex-col items-center gap-4 w-full max-w-lg">
        <div className="w-full h-[1px] bg-outline-variant/30"></div>
        <button 
          onClick={() => {
            const currentIp = localStorage.getItem('server_ip_override') || '';
            const ip = prompt('⚙️ CONFIGURAÇÃO DE REDE\n\nDigite o IP do Servidor (PC do Telão) para que este computador se conecte a ele.\n\nExemplo: 192.168.1.100\n\nDeixe VAZIO para usar este PC como servidor principal.', currentIp);
            if (ip !== null) {
              if (ip.trim() === '') {
                localStorage.removeItem('server_ip_override');
              } else {
                localStorage.setItem('server_ip_override', ip.trim());
              }
              window.location.reload();
            }
          }}
          className="group relative flex flex-col items-center gap-2 p-6 rounded-[24px] border border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5 transition-all w-full"
        >
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined font-bold">hub</span>
            <span className="font-oswald text-sm font-bold uppercase tracking-[0.2em]">Configuração de Conexão</span>
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

    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        
        <Route path="/totem" element={<Emissao />} />
        <Route path="/totem/confirmacao" element={<Confirmacao />} />
        
        <Route path="/telao" element={<MediaIndoor />} />
        <Route path="/telao/chamada" element={<SenhaChamada />} />
        
        <Route path="/operador" element={<Controle />} />
        <Route path="/operador-touch" element={<ControleTouch />} />
        <Route path="/mobile" element={<MobileOperador />} />
        
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/settings" element={<Configuracoes />} />
        <Route path="/admin/midias" element={<GerenciarMidias />} />
        <Route path="/admin/devices" element={<Devices />} />
        <Route path="/admin/queue" element={<Queue />} />
        <Route path="/admin/operators" element={<Operators />} />
        <Route path="/admin/relatorios" element={<Relatorios />} />
      </Routes>
    </HashRouter>
  );
}
