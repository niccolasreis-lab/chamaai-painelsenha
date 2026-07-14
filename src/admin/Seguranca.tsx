import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import {
  UserPlus,
  Key,
  ShieldCheck,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';

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
  const token = localStorage.getItem('user_token') || '';

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
        <StatusBadge variant="loading" message="Carregando módulo de segurança..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-12 font-sans select-none">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink leading-tight">Segurança e acesso</h2>
            <p className="text-sm text-ink-variant mt-1">Gerencie usuários remotos e políticas de controle de acesso.</p>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            icon={<UserPlus className="h-4 w-4" />}
          >
            Adicionar Operador
          </Button>
        </div>

        {/* Alertas */}
        {error && (
          <div className="bg-error-container border border-error/20 text-error-ink text-sm font-semibold p-4 rounded-md">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-success-container border border-success/20 text-success-ink text-sm font-semibold p-4 rounded-md animate-fade-in">
            {successMsg}
          </div>
        )}

        {/* Alerta de Senha Temporária Redefinida */}
        {tempPasswordGenerated && (
          <div className="bg-warning-container border border-warning/20 rounded-md p-6 flex flex-col items-center text-center gap-4 animate-fade-in max-w-xl mx-auto w-full">
            <Key className="text-warning h-10 w-10 animate-bounce" />
            <div>
              <h4 className="font-display text-base font-bold text-warning-ink uppercase tracking-wider">Nova Senha Gerada!</h4>
              <p className="text-xs text-ink-variant mt-1.5 leading-relaxed">
                Anote a senha temporária gerada para o usuário <b>{tempPasswordUser}</b>. Ela será exigida no primeiro acesso dele.
              </p>
            </div>
            <div className="bg-ink text-white font-mono text-2xl font-bold px-6 py-3 rounded-md select-all tracking-widest shadow-inner">
              {tempPasswordGenerated}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTempPasswordGenerated('');
                setTempPasswordUser('');
              }}
            >
              Entendido / Copiar
            </Button>
          </div>
        )}

        {/* Políticas de Acesso */}
        <div className="bg-surface border border-outline-variant rounded-md p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-3">
            <ShieldCheck className="text-primary h-5 w-5" />
            <h3 className="font-display text-base font-bold text-ink">Políticas de segurança</h3>
          </div>

          <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-md border border-outline-variant">
            <div className="flex flex-col gap-1 max-w-xl">
              <span className="text-sm font-bold text-ink">Exigir autenticação mesmo em acesso local</span>
              <span className="text-xs text-ink-variant leading-relaxed">
                Por padrão, o acesso rodando localmente (127.0.0.1 ou mesma máquina) não exige login. Ative esta opção para forçar autenticação mesmo localmente.
              </span>
            </div>
            
            <button
              onClick={handleToggleAuthLocal}
              className={`w-14 h-8 rounded-full transition-colors relative outline-none border border-black/10 shadow-inner ${
                authLocalObrigatorio ? 'bg-primary' : 'bg-outline-variant'
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
        <div className="bg-surface border border-outline-variant rounded-md p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-3 mb-4">
            <Users className="text-primary h-5 w-5" />
            <h3 className="font-display text-base font-bold text-ink">Usuários remotos cadastrados</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans select-text border-collapse">
              <thead>
                <tr className="border-b border-outline-variant text-ink-variant font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Login</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Criado em</th>
                  <th className="py-3 px-4">Configuração</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {usuarios.map(user => {
                  const isCurrent = currentUser && currentUser.login === user.login;
                  return (
                    <tr key={user.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-3.5 px-4 font-bold text-ink flex items-center gap-2">
                        {user.login}
                        {isCurrent && (
                          <span className="bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase px-2 py-0.5 rounded-full select-none">
                            Logado
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          user.perfil === 'admin' 
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-600' 
                            : 'bg-blue-500/10 border-blue-500/20 text-blue-600'
                        }`}>
                          {user.perfil}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-ink-variant">
                        {user.criado_em ? new Date(user.criado_em).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        {user.primeiro_acesso === 1 ? (
                          <span className="text-warning-ink font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" />
                            Senha Temp. ativa
                          </span>
                        ) : (
                          <span className="text-success-ink font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Senha cadastrada
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs font-semibold px-3 uppercase tracking-wide flex items-center gap-1.5"
                            onClick={() => handleRedefinirSenha(user)}
                            icon={<RefreshCw className="h-3.5 w-3.5 text-warning-ink" />}
                          >
                            <span className="text-warning-ink">Redefinir</span>
                          </Button>
                          
                          <Button
                            variant="danger"
                            size="sm"
                            className="h-8 text-xs font-semibold px-3 uppercase tracking-wide flex items-center gap-1.5"
                            disabled={isCurrent}
                            onClick={() => handleRemoveUser(user)}
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                          >
                            Excluir
                          </Button>
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
      <Dialog 
        open={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        title="Criar operador"
      >
        <p className="text-xs text-ink-variant mb-4">Cadastre um login e perfil para acesso remoto do painel de chamadas.</p>
        <form onSubmit={handleAddUser} className="flex flex-col gap-4">
          {addError && (
            <div className="bg-error-container border border-error/20 text-error-ink text-xs font-bold p-3 rounded-md text-center">
              {addError}
            </div>
          )}

          <Input 
            type="text" 
            label="Login"
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
            placeholder="Nome de usuário (sem espaços)"
            required
            autoFocus
          />

          <Input 
            type="password" 
            label="Senha inicial"
            value={newSenha}
            onChange={(e) => setNewSenha(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink">Perfil</label>
            <select
              value={newPerfil}
              onChange={(e) => setNewPerfil(e.target.value)}
              className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-sp-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="operador">Operador (Visualiza/chama filas)</option>
              <option value="admin">Administrador (Acesso total)</option>
            </select>
          </div>

          <div className="flex gap-3 mt-4">
            <Button 
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => setShowAddModal(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit"
              loading={addLoading}
              className="flex-1"
            >
              Criar Operador
            </Button>
          </div>
        </form>
      </Dialog>
    </AdminLayout>
  );
}
