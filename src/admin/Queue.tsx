import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

export default function Queue() {
  const [fila, setFila] = useState<any[]>([]);
  const API_URL = getApiUrl();

  useEffect(() => {
    const fetchFila = async () => {
      try {
        const res = await fetch(`${API_URL}/api/senhas`);
        const data = await res.json();
        setFila(data);
      } catch (error) {
        console.error('Erro ao buscar fila:', error);
      }
    };
    fetchFila();
  }, [API_URL]);

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 font-sans">
        <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">Fila de Atendimento</h1>
        <div className="bg-surface rounded-3xl border border-outline-variant p-6">
          {fila.length === 0 ? (
            <p className="text-ink-secondary text-lg font-semibold text-center py-20">A fila está vazia no momento.</p>
          ) : (
            <ul className="space-y-4">
              {fila.map((item) => (
                <li key={item.id} className="p-4 bg-background rounded-xl shadow-sm border border-outline">
                  {item.nome} - {item.senha}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
