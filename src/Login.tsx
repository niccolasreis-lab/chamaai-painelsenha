import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getApiUrl } from './shared/apiConfig';
import Logo from './shared/Logo';
import { User, Lock, Loader2, ArrowRight, Network, KeyRound } from 'lucide-react';
import { Input, Button, Dialog } from './shared/components';

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

  // Se já tiver token válido em localStorage, tenta ir direto pro painel
  useEffect(() => {
    const checkLogged = async () => {
      const isElectron = !!(window as any).api;
      const isLocalAppNoLogin = isElectron && ((window as any).api?.LOCAL_APP_NO_LOGIN || import.meta.env.VITE_LOCAL_APP_NO_LOGIN === 'true');

      if (isLocalAppNoLogin) {
        if (!localStorage.getItem('user_token')) {
          localStorage.setItem('user_token', 'LOCAL_ELECTRON_SESSION');
          localStorage.setItem('user_perfil', 'admin');
          localStorage.setItem('user_session', JSON.stringify({ token: 'LOCAL_ELECTRON_SESSION' }));
        }
        redirecionarUsuario('admin');
        return;
      }

      const token = localStorage.getItem('user_token');
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
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_perfil');
        }
      } catch (err) {
        console.error('Falha ao validar login existente:', err);
        // Em caso de erro de rede, assume o perfil salvo e tenta ir para a tela operacional
        const savedPerfil = localStorage.getItem('user_perfil') || 'operador';
        redirecionarUsuario(savedPerfil);
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
        navigate(isMobile ? '/mobile' : '/operador'); // Rota operacional padrão
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
        localStorage.setItem('user_token', data.token);
        localStorage.setItem('user_perfil', data.perfil);
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
      localStorage.setItem('user_token', tempToken);
      localStorage.setItem('user_perfil', tempPerfil);
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center font-sans relative overflow-hidden p-4">
      {/* Background Decorativo - usando variáveis do design system e menos blur agressivo */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-secondary/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-surface border border-outline-variant rounded-2xl p-10 shadow-lg relative z-10">
        <div className="flex flex-col items-center mb-8">
          <Logo variant="vertical" darkMode={false} size={80} />
          <p className="text-ink-variant font-bold uppercase tracking-[0.2em] text-[10px] mt-4 text-center">Controle de Acesso</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          {error && (
            <div className="bg-error-container text-error text-xs font-bold p-3 rounded-md text-center uppercase tracking-wider leading-relaxed">
              {error}
            </div>
          )}

          <Input
            label="Usuário"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Digite seu usuário"
            leadingIcon={<User className="h-5 w-5" />}
            required
            autoFocus
          />

          <Input
            label="Senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite sua senha"
            leadingIcon={<Lock className="h-5 w-5" />}
            required
          />

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-4 text-sm tracking-widest font-bold uppercase flex justify-center items-center h-12"
          >
            {loading ? (
              <Loader2 className="animate-spin h-5 w-5" />
            ) : (
              <>
                Entrar
                <ArrowRight className="h-5 w-5 ml-2" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="w-full h-px bg-outline-variant/50"></div>
          
          <Button 
            variant="secondary"
            onClick={() => setShowSettingsModal(true)}
            className="w-full text-xs tracking-widest uppercase font-bold"
          >
            <Network className="h-4 w-4 mr-2" />
            Configurar IP do Servidor
          </Button>
          
          <div className="text-center text-[10px] font-bold uppercase tracking-widest leading-relaxed">
            <span className="text-ink-variant">Status: </span>
            <span className={localStorage.getItem('server_ip_override') ? 'text-success' : 'text-primary'}>
              {localStorage.getItem('server_ip_override') 
                ? `Servidor: ${localStorage.getItem('server_ip_override')}` 
                : 'Localhost (Servidor Principal)'}
            </span>
          </div>
        </div>

        <Button 
          variant="ghost"
          onClick={() => navigate('/')}
          className="w-full mt-6 text-xs uppercase tracking-widest font-bold text-ink-variant hover:text-ink"
        >
          Voltar para Home
        </Button>
      </div>

      {/* Modal de Forçar Troca de Senha no Primeiro Acesso */}
      <Dialog
        open={showChangePassword}
        onClose={() => {
          // Bloqueia fechamento não intencional
        }}
        title="Primeiro Acesso"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="text-warning h-8 w-8 animate-pulse" />
            </div>
            <p className="text-sm font-sans text-ink-variant font-medium">
              Por questões de segurança, é necessário alterar sua senha temporária antes de continuar.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            {changeError && (
              <div className="bg-error-container text-error text-xs font-bold p-3 rounded-md text-center uppercase tracking-wider">
                {changeError}
              </div>
            )}

            <Input
              label="Nova Senha"
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              autoFocus
            />

            <Input
              label="Confirmar Nova Senha"
              type="password"
              value={confirmaNovaSenha}
              onChange={(e) => setConfirmaNovaSenha(e.target.value)}
              placeholder="Repita a nova senha"
              required
            />

            <Button
              type="submit"
              disabled={changeLoading}
              className="w-full mt-2 h-12 text-sm tracking-widest uppercase font-bold"
              style={{ backgroundColor: 'var(--color-warning)', color: '#fff' }}
            >
              {changeLoading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                'Alterar Senha e Entrar'
              )}
            </Button>
          </form>
        </div>
      </Dialog>

      {/* Modal de Configurar IP do Servidor */}
      <Dialog
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="Configurar Servidor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowSettingsModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConnection}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-variant">
            Digite o IP do Computador Principal (Telão) para que este terminal cliente se conecte a ele.
          </p>
          
          <Input
            label="IP do Servidor (Telão)"
            type="text"
            value={tempIp}
            onChange={(e) => setTempIp(e.target.value)}
            placeholder="Ex: 192.168.1.100"
            helper="Deixe em branco para rodar localmente neste dispositivo (Localhost)."
            autoFocus
          />
        </div>
      </Dialog>
    </div>
  );
}
