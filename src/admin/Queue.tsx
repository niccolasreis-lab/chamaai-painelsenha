import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { StatusBadge } from '../shared/components/StatusBadge';

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
      <div className="max-w-7xl mx-auto space-y-6 font-sans">
        <h1 className="font-display text-2xl font-bold text-ink leading-tight">Fila de Atendimento</h1>
        <div className="bg-surface rounded-md border border-outline-variant p-6">
          {fila.length === 0 ? (
            <StatusBadge variant="empty" message="A fila está vazia no momento." />
          ) : (
            <ul className="space-y-3">
              {fila.map((item) => (
                <li key={item.id} className="p-4 bg-surface-container-low rounded-md border border-outline-variant shadow-sm hover:shadow-md transition-shadow duration-fast text-ink font-medium">
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
