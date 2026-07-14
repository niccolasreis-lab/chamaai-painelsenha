import { type ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getApiUrl } from '../shared/apiConfig';
import {
  ArrowLeft,
  LayoutDashboard,
  ListTodo,
  User,
  Smartphone,
  Tv,
  Scale,
  Package,
  Layers,
  Activity,
  Shield,
  Settings,
  Store,
  Bell,
  Plus,
  Search
} from 'lucide-react';
import { Button } from '../shared/components/Button';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [showQueue, setShowQueue] = useState(false);
  const API_URL = getApiUrl();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        if (res.ok) {
          const data = await res.json();
          setShowQueue(data.habilitar_filas_avancadas === '1');
        }
      } catch (err) {
        console.error('Erro ao buscar configurações no layout:', err);
      }
    };
    fetchConfig();
  }, [API_URL]);

  const navLinks = [
    { name: 'Voltar ao Menu', path: '/', icon: <ArrowLeft className="h-5 w-5" /> },
    { name: 'Dashboard', path: '/admin', icon: <LayoutDashboard className="h-5 w-5" /> },
    ...(showQueue ? [{ name: 'Queue', path: '/admin/queue', icon: <ListTodo className="h-5 w-5" /> }] : []),
    { name: 'Operators', path: '/admin/operators', icon: <User className="h-5 w-5" /> },
    { name: 'Devices', path: '/admin/devices', icon: <Smartphone className="h-5 w-5" /> },
    { name: 'Mídia Indoor', path: '/admin/media-indoor', icon: <Tv className="h-5 w-5" /> },
    { name: 'Toledo / Encarte', path: '/admin/toledo', icon: <Scale className="h-5 w-5" /> },
    { name: 'Catálogo', path: '/admin/catalogo', icon: <Package className="h-5 w-5" /> },
    { name: 'Avançado Encarte', path: '/admin/encarte', icon: <Layers className="h-5 w-5" /> },
    { name: 'Relatórios', path: '/admin/relatorios', icon: <Activity className="h-5 w-5" /> },
    { name: 'Segurança', path: '/admin/seguranca', icon: <Shield className="h-5 w-5" /> },
    { name: 'Settings', path: '/admin/settings', icon: <Settings className="h-5 w-5" /> },
  ];

  return (
    <div className="bg-background text-ink min-h-screen flex font-sans">
      {/* SideNavBar */}
      <nav className="h-screen w-72 bg-surface border-r border-outline-variant flex flex-col py-8 shadow-sm flex-shrink-0 z-sticky sticky top-0">
        <div className="px-6 mb-8 flex items-center space-x-3">
          <Store className="h-8 w-8 text-primary" />
          <div className="text-xl font-bold font-display text-ink">ChamaAí</div>
        </div>
        
        <div className="px-6 mb-8">
          <div className="flex items-center space-x-3 bg-surface-container-low p-3 rounded-md border border-outline-variant">
            <div className="w-10 h-10 rounded-full border-2 border-surface shadow-sm bg-primary text-white flex items-center justify-center font-bold font-sans">
              AD
            </div>
            <div>
              <p className="text-ink font-bold text-sm">Administrador</p>
              <p className="text-ink-variant text-xs">Painel de Controle</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path || 
              (link.path !== '/' && link.path !== '/admin' && location.pathname.startsWith(link.path)) ||
              (link.path === '/admin' && (location.pathname === '/admin' || location.pathname === '/admin/'));
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`flex items-center space-x-3 px-4 py-2.5 rounded-md transition-all font-semibold outline-none text-sm ${
                  isActive 
                    ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                    : 'text-ink-variant hover:bg-surface-container-low hover:text-ink'
                }`}
              >
                <span className="flex items-center justify-center shrink-0">{link.icon}</span>
                <span className="text-sm">{link.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="px-6 mt-4">
          <Button
            variant="primary"
            className="w-full"
            icon={<Plus className="h-4 w-4" />}
          >
            Novo operador
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* TopAppBar */}
        <header className="flex justify-between items-center w-full px-8 py-4 bg-surface border-b border-outline-variant z-sticky sticky top-0 shadow-sm">
          <div className="flex items-center">
            <h1 className="font-display text-xl font-bold text-ink">Painel Administrativo</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center bg-surface-container-low rounded-full px-4 py-1.5 border border-outline-variant focus-within:border-primary transition-colors">
              <Search className="h-4 w-4 text-ink-variant mr-2" />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="bg-transparent border-none focus:ring-0 text-sm w-48 text-ink placeholder-outline outline-none font-medium" 
              />
            </div>
            <button className="text-ink-variant hover:text-primary hover:bg-primary/10 p-2 rounded-full transition-colors outline-none">
              <Bell className="h-5 w-5" />
            </button>
            <button className="text-ink-variant hover:text-primary hover:bg-primary/10 p-2 rounded-full transition-colors outline-none">
              <User className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Canvas */}
        <div className="flex-1 overflow-y-auto p-8 bg-background">
          {children}
        </div>
      </main>
    </div>
  );
}
