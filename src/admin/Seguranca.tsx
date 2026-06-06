import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

interface Usuario {
  id: number;
  login: string;
  perfil: string;
  primeiro_acesso: number;
  criado_em: string;
}

export default function Seguranca() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Config de segurança local
  const [authLocalObrigatorio, setAuthLocalObrigatorio] = useState(false);

  // Form de adição de operador
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLogin, setNewLogin] = useState('');
  const [newSenha, setNewSenha] = useState('');
  const [newPerfil, setNewPerfil] = useState('operador');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Redefinição de senha temporária
  const [tempPasswordGenerated, setTempPasswordGenerated] = useState('');
  const [tempPasswordUser, setTempPasswordUser] = useState('');

  const API_URL = getApiUrl();
  const token = sessionStorage.getItem('user_token') || '';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
      }
    } catch (e) {
      console.error('Erro ao obter usuário atual:', e);
    }
  };

  const fetchUsuarios = async () => {
    try {
      setError('');
      const res = await fetch(`${API_URL}/api/usuarios`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUsuarios(data);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao carregar usuários.');
      }
    } catch (err) {
      setError('Erro de conexão ao buscar usuários.');
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`);
      if (res.ok) {
        const data = await res.json();
        setAuthLocalObrigatorio(data.auth_local_obrigatorio === '1');
      }
    } catch (e) {
      console.error('Erro ao buscar configuração auth_local_obrigatorio:', e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchCurrentUser(), fetchUsuarios(), fetchConfig()]);
      setLoading(false);
    };
    init();
  }, [API_URL]);

  const handleToggleAuthLocal = async () => {
    const newValue = !authLocalObrigatorio;
    setAuthLocalObrigatorio(newValue);
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ auth_local_obrigatorio: newValue ? '1' : '0' })
      });
      if (!res.ok) {
        throw new Error('Falha ao salvar configuração.');
      }
      showSuccess('Configuração de segurança local atualizada com sucesso!');
    } catch (e) {
      setAuthLocalObrigatorio(!newValue);
      setError('Erro ao salvar alteração de segurança.');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    if (newSenha.length < 6) {
      setAddError('A senha deve ter no mínimo 6 caracteres.');
      setAddLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/usuarios`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ login: newLogin, senha: newSenha, perfil: newPerfil })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar usuário.');
      }
      
      // Limpa e fecha modal
      setNewLogin('');
      setNewSenha('');
      setNewPerfil('operador');
      setShowAddModal(false);
      showSuccess('Operador criado com sucesso!');
      fetchUsuarios();
    } catch (err: any) {
      setAddError(err.message || 'Erro ao salvar usuário.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRedefinirSenha = async (user: Usuario) => {
    if (!window.confirm(`Tem certeza que deseja redefinir a senha do usuário "${user.login}"?`)) return;

    try {
      setError('');
      const res = await fetch(`${API_URL}/api/usuarios/redefinir`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: user.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao redefinir.');
      }
      setTempPasswordUser(user.login);
      setTempPasswordGenerated(data.senha_temporaria);
      fetchUsuarios();
    } catch (err: any) {
      setError(err.message || 'Erro ao redefinir senha.');
    }
  };

  const handleRemoveUser = async (user: Usuario) => {
    if (currentUser && currentUser.login === user.login) {
      alert('Você não pode remover o próprio usuário logado.');
      return;
    }
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente o usuário "${user.login}"?`)) return;

    try {
      setError('');
      const res = await fetch(`${API_URL}/api/usuarios/${user.id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        showSuccess(`Usuário "${user.login}" removido com sucesso.`);
        fetchUsuarios();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao excluir usuário.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir usuário.');
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="h-96 w-full flex flex-col gap-4 items-center justify-center font-sans text-ink-secondary bg-background font-bold uppercase tracking-widest text-xs">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">refresh</span>
          Carregando módulo de segurança...
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-8 max-w-6xl mx-auto pb-12 font-sans select-none">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="font-sans text-3xl font-black text-ink uppercase tracking-wider mb-2">Segurança e Acesso</h2>
            <p className="text-sm font-sans text-ink-secondary font-medium">Gerencie usuários remotos e políticas de controle de acesso.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="py-4 px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-bold uppercase tracking-widest text-xs transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-lg">person_add</span>
            Adicionar Operador
          </button>
        </div>

        {/* Alertas */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-bold p-4 rounded-2xl uppercase tracking-wider">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm font-bold p-4 rounded-2xl uppercase tracking-wider animate-fade-in">
            {successMsg}
          </div>
        )}

        {/* Alerta de Senha Temporária Redefinida */}
        {tempPasswordGenerated && (
          <div className="bg-amber-500/10 border-2 border-amber-500/30 text-amber-900 dark:text-amber-300 rounded-[2rem] p-8 flex flex-col items-center text-center gap-4 animate-fade-in">
            <span className="material-symbols-outlined text-amber-500 text-5xl animate-bounce">key</span>
            <div>
              <h4 className="font-sans text-xl font-bold uppercase tracking-wide">Nova Senha Gerada!</h4>
              <p className="text-sm font-medium text-ink-secondary mt-1">
                Anote a senha temporária gerada para o usuário <b>{tempPasswordUser}</b>. Ela será exigida no primeiro acesso dele.
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 text-white font-mono text-3xl font-bold px-8 py-4 rounded-2xl select-all tracking-widest shadow-inner">
              {tempPasswordGenerated}
            </div>
            <button
              onClick={() => {
                setTempPasswordGenerated('');
                setTempPasswordUser('');
              }}
              className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold uppercase tracking-widest text-xs transition-all"
            >
              Entendido / Copiar
            </button>
          </div>
        )}

        {/* Políticas de Acesso */}
        <div className="bg-surface border border-outline-variant/30 rounded-[32px] p-8 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
            <span className="material-symbols-outlined text-primary text-3xl font-bold">policy</span>
            <h3 className="font-sans text-lg font-bold text-ink uppercase tracking-widest">Políticas de Segurança</h3>
          </div>

          <div className="flex items-center justify-between p-4 bg-surface-variant rounded-2xl border border-outline-variant/50">
            <div className="flex flex-col gap-1 max-w-xl">
              <span className="font-sans text-sm font-bold text-ink uppercase tracking-wide">Exigir autenticação mesmo em acesso local</span>
              <span className="text-xs text-ink-secondary leading-relaxed font-medium">
                Por padrão, o acesso rodando localmente (127.0.0.1 ou mesma máquina) não exige login. Ative esta opção para forçar autenticação mesmo localmente.
              </span>
            </div>
            
            <button
              onClick={handleToggleAuthLocal}
              className={`w-14 h-8 rounded-full transition-colors relative outline-none border border-black/10 shadow-inner ${
                authLocalObrigatorio ? 'bg-primary' : 'bg-outline-variant/60'
              }`}
            >
              <div 
                className={`w-6 h-6 bg-white rounded-full absolute top-[3px] shadow-md transition-transform ${
                  authLocalObrigatorio ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Tabela de Usuários */}
        <div className="bg-surface border border-outline-variant/30 rounded-[32px] p-8 shadow-sm">
          <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4 mb-6">
            <span className="material-symbols-outlined text-primary text-3xl font-bold">supervisor_account</span>
            <h3 className="font-sans text-lg font-bold text-ink uppercase tracking-widest">Usuários Remotos Cadastrados</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans select-text">
              <thead>
                <tr className="border-b border-outline-variant/30 text-ink-secondary/70 font-bold uppercase tracking-widest text-[10px]">
                  <th className="py-4 px-4">Login</th>
                  <th className="py-4 px-4">Perfil</th>
                  <th className="py-4 px-4">Criado em</th>
                  <th className="py-4 px-4">Configuração</th>
                  <th className="py-4 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {usuarios.map(user => {
                  const isCurrent = currentUser && currentUser.login === user.login;
                  return (
                    <tr key={user.id} className="hover:bg-surface-variant/20 transition-colors">
                      <td className="py-4 px-4 font-bold text-ink flex items-center gap-2">
                        {user.login}
                        {isCurrent && (
                          <span className="bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase px-2 py-0.5 rounded-full select-none">
                            Logado
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                          user.perfil === 'admin' 
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-600' 
                            : 'bg-blue-500/10 border-blue-500/20 text-blue-600'
                        }`}>
                          {user.perfil}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs font-semibold text-ink-secondary/80">
                        {user.criado_em ? new Date(user.criado_em).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="py-4 px-4">
                        {user.primeiro_acesso === 1 ? (
                          <span className="text-amber-500 font-bold text-xs uppercase tracking-wide flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm font-bold">warning</span>
                            Senha Temp. ativa
                          </span>
                        ) : (
                          <span className="text-emerald-500 font-bold text-xs uppercase tracking-wide flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm font-bold">check_circle</span>
                            Senha cadastrada
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleRedefinirSenha(user)}
                            className="p-2 hover:bg-amber-500/10 text-amber-600 rounded-lg hover:text-amber-700 transition-all font-semibold uppercase tracking-wider text-[10px] border border-amber-500/20 flex items-center gap-1 select-none"
                            title="Redefinir para senha temporária"
                          >
                            <span className="material-symbols-outlined text-sm">lock_reset</span>
                            Redefinir
                          </button>
                          
                          <button
                            onClick={() => handleRemoveUser(user)}
                            disabled={isCurrent}
                            className={`p-2 rounded-lg transition-all font-semibold uppercase tracking-wider text-[10px] border flex items-center gap-1 select-none ${
                              isCurrent
                                ? 'opacity-30 cursor-not-allowed border-slate-200 text-slate-400'
                                : 'hover:bg-rose-500/10 border-rose-500/20 text-rose-500 hover:text-rose-600'
                            }`}
                            title={isCurrent ? "Não é possível remover a si mesmo" : "Excluir operador"}
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Adicionar Usuário */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-outline-variant/30 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 relative z-50">
            <div>
              <h3 className="font-sans text-2xl font-bold text-ink uppercase mb-2">Criar Operador</h3>
              <p className="text-sm font-sans text-ink-secondary font-medium">Cadastre um login e perfil para acesso remoto do painel de chamadas.</p>
            </div>

            <form onSubmit={handleAddUser} className="flex flex-col gap-4">
              {addError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold p-3 rounded-xl text-center uppercase tracking-wider">
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-ink-secondary text-xs font-bold uppercase tracking-widest mb-2 ml-1">Login</label>
                <input 
                  type="text" 
                  value={newLogin}
                  onChange={(e) => setNewLogin(e.target.value)}
                  placeholder="Nome de usuário (sem espaços)"
                  className="w-full bg-surface-variant border border-outline-variant rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold text-lg"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-ink-secondary text-xs font-bold uppercase tracking-widest mb-2 ml-1">Senha Inicial</label>
                <input 
                  type="password" 
                  value={newSenha}
                  onChange={(e) => setNewSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-surface-variant border border-outline-variant rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold text-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-ink-secondary text-xs font-bold uppercase tracking-widest mb-2 ml-1">Perfil</label>
                <select
                  value={newPerfil}
                  onChange={(e) => setNewPerfil(e.target.value)}
                  className="w-full bg-surface-variant border border-outline-variant rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                >
                  <option value="operador">Operador (Visualiza/chama filas)</option>
                  <option value="admin">Administrador (Acesso total)</option>
                </select>
              </div>

              <div className="flex gap-4 mt-2">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-4 bg-surface-variant hover:bg-outline-variant/40 text-ink rounded-xl font-bold uppercase tracking-widest text-xs transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 py-4 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all"
                >
                  {addLoading ? 'Salvando...' : 'Criar Operador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
