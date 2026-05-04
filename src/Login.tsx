import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getApiUrl } from './shared/apiConfig';

export default function Login() {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const API_URL = getApiUrl();
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, senha })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao fazer login');
      }

      // Salva a sessão
      localStorage.setItem('user_session', JSON.stringify(data));

      // Se havia uma página anterior tentando ser acessada, volta pra ela
      const state = location.state as any;
      if (state && state.from) {
        navigate(state.from.pathname);
      } else {
        // Redirecionamento padrão baseado no perfil
        if (data.user.perfil === 'admin') {
          navigate('/admin');
        } else {
          // Para mobile, podemos checar se a tela é pequena
          const isMobile = window.innerWidth < 1024;
          navigate(isMobile ? '/mobile' : '/operador');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-rajdhani relative overflow-hidden p-4">
      {/* Background Decorativo */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-10 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-blue-500 text-4xl">admin_panel_settings</span>
          </div>
          <h1 className="font-oswald text-4xl font-bold text-white uppercase tracking-widest text-center">ChamaAí</h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-xs mt-2 text-center">Controle de Acesso</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold p-4 rounded-xl text-center uppercase tracking-wider">
              {error}
            </div>
          )}

          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Usuário</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-500">person</span>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-white font-bold placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Digite seu usuário"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Senha</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-500">lock</span>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-white font-bold placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Digite sua senha"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-oswald text-xl font-bold uppercase tracking-widest py-4 rounded-xl mt-4 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin">refresh</span>
            ) : (
              <>
                Entrar
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        <button 
          onClick={() => navigate('/')}
          className="w-full mt-6 text-slate-500 hover:text-slate-300 text-xs font-bold uppercase tracking-widest transition-colors"
        >
          Voltar para Home
        </button>
      </div>
    </div>
  );
}
