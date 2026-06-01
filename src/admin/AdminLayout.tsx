import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  const navLinks = [
    { name: 'Voltar ao Menu', path: '/', icon: 'arrow_back' },
    { name: 'Dashboard', path: '/admin', icon: 'dashboard' },
    { name: 'Queue', path: '/admin/queue', icon: 'list_alt' },
    { name: 'Operators', path: '/admin/operators', icon: 'badge' },
    { name: 'Devices', path: '/admin/devices', icon: 'settings_input_component' },
    { name: 'Gerenciar Mídias', path: '/admin/midias', icon: 'perm_media' },
    { name: 'Toledo / Encarte', path: '/admin/toledo', icon: 'scale' },
    { name: 'Avançado Encarte', path: '/admin/encarte', icon: 'style' },
    { name: 'Relatórios', path: '/admin/relatorios', icon: 'analytics' },
    { name: 'Settings', path: '/admin/settings', icon: 'settings' },
  ];

  return (
    <div className="bg-background text-ink min-h-screen flex font-sans">
      {/* SideNavBar */}
      <nav className="h-screen w-72 bg-surface border-r border-outline-variant/30 flex flex-col py-8 shadow-sm flex-shrink-0 z-10 sticky top-0">
        <div className="px-6 mb-8 flex items-center space-x-3">
          <span className="material-symbols-outlined text-4xl text-primary" data-weight="fill">storefront</span>
          <div className="text-2xl font-bold font-sans text-ink tracking-widest uppercase">ChamaAí</div>
        </div>
        
        <div className="px-6 mb-8">
          <div className="flex items-center space-x-3 bg-surface-variant p-3 rounded-xl border border-outline-variant/50">
            <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-primary text-white flex items-center justify-center font-bold font-sans">
              AD
            </div>
            <div>
              <p className="text-ink font-bold text-sm">Administrador</p>
              <p className="text-ink-secondary text-xs">Painel de Controle</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 space-y-2">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path || (link.path === '/admin' && location.pathname === '/admin/');
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-semibold outline-none ${
                  isActive 
                    ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                    : 'text-ink-secondary hover:bg-surface-variant hover:text-ink'
                }`}
              >
                <span className="material-symbols-outlined" data-weight={isActive ? "fill" : ""}>{link.icon}</span>
                <span className="text-base uppercase tracking-wider">{link.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="px-6 mt-auto">
          <button className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg hover:bg-primary-hover active:scale-95 transition-all flex items-center justify-center space-x-2 outline-none">
            <span className="material-symbols-outlined text-sm">add</span>
            <span className="uppercase tracking-widest text-sm">Novo Operador</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* TopAppBar */}
        <header className="flex justify-between items-center w-full px-8 py-5 bg-surface border-b border-outline-variant/30 z-20 sticky top-0 shadow-sm">
          <div className="flex items-center">
            <h1 className="font-sans text-2xl font-bold text-ink uppercase tracking-widest">Painel Administrativo</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center bg-surface-variant rounded-full px-4 py-2 border border-outline-variant/50 focus-within:border-primary/50 transition-colors">
              <span className="material-symbols-outlined text-ink-secondary mr-2">search</span>
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="bg-transparent border-none focus:ring-0 text-sm w-48 text-ink placeholder-text-secondary outline-none font-semibold" 
              />
            </div>
            <button className="text-ink-secondary hover:text-primary hover:bg-primary/10 p-2 rounded-full transition-colors outline-none">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="text-ink-secondary hover:text-primary hover:bg-primary/10 p-2 rounded-full transition-colors outline-none">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
          </div>
        </header>

        {/* Scrollable Canvas */}
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
