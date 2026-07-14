import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import {
  UserPlus,
  Shield,
  User,
  Trash2
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';

interface Operador {
  id: number;
  nome: string;
  login: string;
  perfil: 'admin' | 'operador';
  ativo: number;
}

export default function Operators() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newOp, setNewOp] = useState({ nome: '', login: '', senha: '', perfil: 'operador' });
  const API_URL = getApiUrl();

  const fetchOperadores = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/operadores`);
      const data = await res.json();
      setOperadores(data);
    } catch (err) {
      console.error('Erro ao buscar operadores', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperadores();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/operadores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOp)
      });
      if (res.ok) {
        setShowModal(false);
        setNewOp({ nome: '', login: '', senha: '', perfil: 'operador' });
        fetchOperadores();
      } else {
        alert('Erro ao adicionar operador. Verifique se o login já existe.');
      }
    } catch (err) {
      alert('Erro de conexão.');
    }
  };

  const handleDelete = async (id: number) => {
    if (id === 1) return alert('O administrador padrão não pode ser removido.');
    if (!confirm('Tem certeza que deseja remover este operador?')) return;
    try {
      await fetch(`${API_URL}/api/operadores/${id}`, { method: 'DELETE' });
      fetchOperadores();
    } catch (err) {
      alert('Erro ao remover.');
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 font-sans">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">Operadores</h1>
            <p className="text-ink-variant mt-1 text-sm">Gestão de acesso e perfis do sistema</p>
          </div>
          <Button 
            onClick={() => setShowModal(true)}
            icon={<UserPlus className="h-4 w-4" />}
          >
            Novo Operador
          </Button>
        </div>

        {loading ? (
          <StatusBadge variant="loading" />
        ) : operadores.length === 0 ? (
          <StatusBadge variant="empty" message="Nenhum operador cadastrado." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {operadores.map(op => (
              <div key={op.id} className="bg-surface rounded-md p-6 border border-outline-variant shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${op.perfil === 'admin' ? 'bg-primary' : 'bg-success'}`}></div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-sm bg-surface-container flex items-center justify-center text-ink-variant">
                    {op.perfil === 'admin' ? <Shield className="h-5 w-5" /> : <User className="h-5 w-5" />}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${op.perfil === 'admin' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
                    {op.perfil}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-ink truncate">{op.nome}</h3>
                <p className="text-ink-variant text-sm font-medium mb-4">@{op.login}</p>
                
                <div className="flex justify-end border-t border-outline-variant/30 pt-3">
                  <button 
                    disabled={op.id === 1}
                    onClick={() => handleDelete(op.id)}
                    className="p-1.5 text-error hover:bg-error-container rounded-sm transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    title="Remover Operador"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Novo Operador */}
        <Dialog open={showModal} onClose={() => setShowModal(false)} title="Novo operador">
          <form onSubmit={handleAdd} className="space-y-4">
            <Input
              label="Nome completo"
              required
              value={newOp.nome}
              onChange={e => setNewOp({...newOp, nome: e.target.value})}
            />
            <Input
              label="Login (usuário)"
              required
              value={newOp.login}
              onChange={e => setNewOp({...newOp, login: e.target.value})}
            />
            <Input
              label="Senha de acesso"
              type="password"
              required
              value={newOp.senha}
              onChange={e => setNewOp({...newOp, senha: e.target.value})}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-ink">Perfil</label>
              <select
                value={newOp.perfil}
                onChange={e => setNewOp({...newOp, perfil: e.target.value as any})}
                className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-sp-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="operador">Operador (Balcão)</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <Button type="submit" className="w-full mt-4">
              Criar Operador
            </Button>
          </form>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
