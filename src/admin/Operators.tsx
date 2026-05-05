import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

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
      <div className="max-w-6xl mx-auto space-y-8 font-sans">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-sans text-[48px] font-bold text-ink leading-tight uppercase tracking-widest">Operadores</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold uppercase tracking-wider">Gestão de acesso e perfis do sistema</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg hover:bg-primary-hover transition-all flex items-center gap-2 uppercase tracking-widest text-sm"
          >
            <span className="material-symbols-outlined">person_add</span>
            Novo Operador
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-xl font-bold text-ink-secondary animate-pulse uppercase tracking-widest">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {operadores.map(op => (
              <div key={op.id} className="bg-surface rounded-3xl p-6 border border-outline-variant/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-2 h-full ${op.perfil === 'admin' ? 'bg-primary' : 'bg-success'}`}></div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-surface-variant flex items-center justify-center">
                    <span className="material-symbols-outlined text-ink-secondary">{op.perfil === 'admin' ? 'admin_panel_settings' : 'person'}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${op.perfil === 'admin' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
                    {op.perfil}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-ink truncate">{op.nome}</h3>
                <p className="text-ink-secondary font-medium mb-6">@{op.login}</p>
                
                <div className="flex justify-end border-t border-outline-variant/30 pt-4">
                  <button 
                    onClick={() => handleDelete(op.id)}
                    className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                    title="Remover Operador"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Novo Operador */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-outline-variant/50 animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-sans text-2xl font-bold text-ink uppercase tracking-wider">Novo Operador</h2>
                <button onClick={() => setShowModal(false)} className="text-ink-secondary hover:text-ink"><span className="material-symbols-outlined">close</span></button>
              </div>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1">Nome Completo</label>
                  <input required value={newOp.nome} onChange={e => setNewOp({...newOp, nome: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="text" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1">Login (Usuário)</label>
                  <input required value={newOp.login} onChange={e => setNewOp({...newOp, login: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="text" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1">Senha de Acesso</label>
                  <input required value={newOp.senha} onChange={e => setNewOp({...newOp, senha: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="password" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary uppercase tracking-widest mb-1">Perfil</label>
                  <select value={newOp.perfil} onChange={e => setNewOp({...newOp, perfil: e.target.value as any})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold uppercase">
                    <option value="operador">Operador (Balcão)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold mt-6 hover:bg-primary-hover shadow-lg transition-all uppercase tracking-widest">Criar Operador</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
