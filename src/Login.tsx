import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getApiUrl } from './shared/apiConfig';

export default function Login() {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Modal para forçar troca de senha no primeiro acesso
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [tempPerfil, setTempPerfil] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaNovaSenha, setConfirmaNovaSenha] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');

  // Se já tiver token válido em sessionStorage, tenta ir direto pro painel
  useEffect(() => {
    const checkLogged = async () => {
      const token = sessionStorage.getItem('user_token');
      if (!token) return;

      try {
        const API_URL = getApiUrl();
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          redirecionarUsuario(data.perfil);
        } else {
          sessionStorage.clear();
        }
      } catch (err) {
        console.error('Falha ao validar login existente:', err);
      }
    };
    checkLogged();
  }, []);

  const handleSaveConnection = () => {
    if (tempIp.trim() === '') {
      localStorage.removeItem('server_ip_override');
    } else {
      localStorage.setItem('server_ip_override', tempIp.trim());
    }
    setShowSettingsModal(false);
    window.location.reload();
  };

  const redirecionarUsuario = (perfil: string) => {
    const state = location.state as any;
    if (state && state.from) {
      navigate(state.from.pathname);
    } else {
      if (perfil === 'admin') {
        navigate('/admin');
      } else {
        const isMobile = window.innerWidth < 1024;
        navigate(isMobile ? '/balcao' : '/balcao'); // Rota operacional padrão
      }
    }
  };

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
        throw new Error(data.error || data.erro || 'Erro ao efetuar login.');
      }

      if (data.primeiro_acesso === 1) {
        // Guarda credenciais temporárias para forçar a troca
        setTempToken(data.token);
        setTempPerfil(data.perfil);
        setShowChangePassword(true);
      } else {
        // Login direto
        sessionStorage.setItem('user_token', data.token);
        sessionStorage.setItem('user_perfil', data.perfil);
        localStorage.setItem('user_session', JSON.stringify({ token: data.token }));
        redirecionarUsuario(data.perfil);
      }
    } catch (err: any) {
      setError(err.message || 'Falha de conexão com o servidor principal.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError('');

    if (novaSenha.length < 6) {
      setChangeError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (novaSenha !== confirmaNovaSenha) {
      setChangeError('As senhas não coincidem.');
      return;
    }

    setChangeLoading(true);

    try {
      const API_URL = getApiUrl();
      const res = await fetch(`${API_URL}/api/auth/senha`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tempToken}`
        },
        body: JSON.stringify({ 
          senha_atual: senha, // A senha que ele acabou de usar para logar
          nova_senha: novaSenha 
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.erro || 'Erro ao trocar a senha.');
      }

      // Senha alterada com sucesso! Loga o usuário.
      sessionStorage.setItem('user_token', tempToken);
      sessionStorage.setItem('user_perfil', tempPerfil);
      localStorage.setItem('user_session', JSON.stringify({ token: tempToken }));
      setShowChangePassword(false);
      redirecionarUsuario(tempPerfil);
    } catch (err: any) {
      setChangeError(err.message || 'Falha ao alterar senha.');
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans relative overflow-hidden p-4">
      {/* Background Decorativo */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-10 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-blue-500 text-4xl">admin_panel_settings</span>
          </div>
          <h1 className="font-sans text-4xl font-bold text-white uppercase tracking-widest text-center">ChamaAí</h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-xs mt-2 text-center">Controle de Acesso</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold p-4 rounded-xl text-center uppercase tracking-wider leading-relaxed">
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
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-sans text-xl font-bold uppercase tracking-widest py-4 rounded-xl mt-4 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 flex justify-center items-center gap-2"
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

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="w-full h-[1px] bg-slate-800/60"></div>
          <button 
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="w-full py-3 bg-slate-950 hover:bg-slate-800 text-blue-400 border border-blue-900/30 rounded-xl font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm font-bold">hub</span>
            Configurar IP do Servidor
          </button>
          
          <div className="text-center text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
            Status: <span className={localStorage.getItem('server_ip_override') ? 'text-emerald-400' : 'text-slate-400'}>
              {localStorage.getItem('server_ip_override') 
                ? `Servidor: ${localStorage.getItem('server_ip_override')}` 
                : 'Localhost (Servidor Principal)'}
            </span>
          </div>
        </div>

        <button 
          onClick={() => navigate('/')}
          className="w-full mt-6 text-slate-600 hover:text-slate-400 text-xs font-bold uppercase tracking-widest transition-colors"
        >
          Voltar para Home
        </button>
      </div>

      {/* Modal de Forçar Troca de Senha no Primeiro Acesso */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[99] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 relative z-50">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber-500 text-3xl animate-pulse">lock_reset</span>
              </div>
              <h3 className="font-sans text-2xl font-bold text-white uppercase mb-2">Primeiro Acesso</h3>
              <p className="text-sm font-sans text-slate-400 font-medium">
                Por questões cruciais de segurança, é necessário alterar sua senha temporária antes de continuar.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              {changeError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold p-3 rounded-xl text-center uppercase tracking-wider">
                  {changeError}
                </div>
              )}

              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Nova Senha</label>
                <input 
                  type="password" 
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 text-white font-bold text-lg placeholder:text-slate-700"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Confirmar Nova Senha</label>
                <input 
                  type="password" 
                  value={confirmaNovaSenha}
                  onChange={(e) => setConfirmaNovaSenha(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 text-white font-bold text-lg placeholder:text-slate-700"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={changeLoading}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold uppercase tracking-widest text-sm rounded-xl transition-all shadow-lg shadow-amber-900/10 flex justify-center items-center gap-2"
              >
                {changeLoading ? (
                  <span className="material-symbols-outlined animate-spin">refresh</span>
                ) : (
                  'Alterar Senha e Entrar'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Configurar IP do Servidor */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 relative z-50">
            <div>
              <h3 className="font-sans text-2xl font-bold text-white uppercase mb-2">Configurar Servidor</h3>
              <p className="text-sm font-sans text-slate-400 font-medium">
                Digite o IP do Computador Principal (Telão) para que este terminal cliente se conecte a ele.
              </p>
            </div>
            <div>
              <label className="block font-bold tracking-widest text-slate-400 uppercase mb-2 text-xs">IP do Servidor (Telão)</label>
              <input 
                type="text" 
                value={tempIp}
                onChange={(e) => setTempIp(e.target.value)}
                placeholder="Ex: 192.168.1.100"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 text-white font-bold text-lg placeholder:text-slate-700"
                autoFocus
              />
              <p className="text-[10px] text-slate-500 mt-2 font-semibold uppercase tracking-wider">
                Deixe em branco para rodar localmente neste dispositivo (Localhost).
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 py-4 bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded-xl font-bold uppercase tracking-widest text-sm transition-all"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleSaveConnection}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl font-bold uppercase tracking-widest text-sm transition-all"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
