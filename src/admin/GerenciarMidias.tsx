import { useState, useEffect, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

interface Midia {
  id: number;
  nome: string;
  caminho: string;
  tipo: 'imagem' | 'video';
  ordem: number;
  ativo: number;
  status: string;
  data_expiracao: string | null;
}

export default function GerenciarMidias() {
  const [midias, setMidias] = useState<Midia[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_URL = getApiUrl();

  const fetchMidias = async () => {
    try {
      const res = await fetch(`${API_URL}/api/midias`);
      const data = await res.json();
      setMidias(data);
    } catch (err) {
      console.error('Erro ao buscar mídias', err);
    }
  };

  useEffect(() => {
    fetchMidias();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('nome', file.name);

    try {
      const res = await fetch(`${API_URL}/api/midias`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        fetchMidias();
      } else {
        const errorData = await res.json();
        alert(`Erro ao enviar arquivo: ${errorData.error || res.statusText}`);
      }
    } catch (err: any) {
      console.error('Erro no upload', err);
      alert(`Erro de rede ou conexão: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta mídia?')) return;

    try {
      const res = await fetch(`${API_URL}/api/midias/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMidias(midias.filter(m => m.id !== id));
      }
    } catch (err) {
      console.error('Erro ao excluir', err);
    }
  };

  const handleUpdate = async (id: number, data: Partial<Midia>) => {
    try {
      const res = await fetch(`${API_URL}/api/midias/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        fetchMidias();
      } else {
        alert('Erro ao atualizar mídia');
      }
    } catch (err) {
      console.error('Erro ao atualizar', err);
    }
  };

  const activeCount = midias.filter(m => m.ativo === 1).length;
  const inactiveCount = midias.filter(m => m.ativo === 0).length;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 font-sans">
        {/* Action Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">Mídias do Telão</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold">Configure os vídeos e imagens que serão exibidos no Telão em carrossel.</p>
            <div className="flex space-x-3 mt-4">
              <span className="bg-primary/10 px-4 py-1 rounded-full text-xs font-bold tracking-widest text-primary flex items-center space-x-2 border border-primary/20 uppercase">
                <span className="material-symbols-outlined text-sm">photo_library</span>
                <span>{activeCount} ATIVAS</span>
              </span>
              <span className="bg-error/10 px-4 py-1 rounded-full text-xs font-bold tracking-widest text-error flex items-center space-x-2 border border-error/20 uppercase">
                <span className="material-symbols-outlined text-sm">visibility_off</span>
                <span>{inactiveCount} INATIVAS</span>
              </span>
            </div>
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,video/*"
          />
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`bg-primary text-white px-8 py-4 rounded-xl font-bold shadow-lg hover:bg-primary-hover transition-all active:scale-95 flex items-center space-x-2 outline-none uppercase tracking-widest text-sm ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="material-symbols-outlined">
              {uploading ? 'sync' : 'add_circle'}
            </span>
            <span>{uploading ? 'Enviando...' : 'Adicionar Mídia'}</span>
          </button>
        </div>

        {/* Media Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {/* Real Media Cards */}
          {midias.map((midia) => (
            <div key={midia.id} className="bg-surface rounded-[24px] p-5 shadow-sm border border-outline-variant/50 relative group hover:border-primary/50 transition-all animate-fade-in">
              <div className="absolute top-8 left-8 z-10 cursor-move text-white drop-shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="material-symbols-outlined">drag_indicator</span>
              </div>
              
              <div className="aspect-video w-full rounded-2xl overflow-hidden mb-5 relative bg-ink flex items-center justify-center">
                {midia.tipo === 'video' ? (
                  <video 
                    src={`${API_URL}${midia.caminho}`} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img 
                    src={`${API_URL}${midia.caminho}`} 
                    alt={midia.nome}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
                <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-[10px] font-bold flex items-center space-x-2 uppercase tracking-widest">
                  <span className="material-symbols-outlined text-sm">
                    {midia.tipo === 'video' ? 'videocam' : 'image'}
                  </span>
                  <span>{midia.tipo.toUpperCase()}</span>
                </div>
              </div>

              <div className="flex justify-between items-start mt-4">
                <div className="overflow-hidden w-full">
                  <h3 className="font-bold text-lg text-ink truncate pr-2 uppercase font-sans tracking-wide" title={midia.nome}>
                    {midia.nome}
                  </h3>
                  <div className="mt-2 space-y-2">
                    <label className="text-[10px] font-bold text-ink-secondary tracking-widest block">Data de expiração</label>
                    <input
                      type="date"
                      value={midia.data_expiracao || ''}
                      onChange={(e) => handleUpdate(midia.id, { data_expiracao: e.target.value || null })}
                      className="w-full px-2 py-1 text-xs font-bold rounded bg-surface-variant border border-outline-variant outline-none"
                    />
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => handleUpdate(midia.id, { ativo: midia.ativo === 1 ? 0 : 1 })}
                        className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded ${midia.ativo === 1 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}
                      >
                        {midia.ativo === 1 ? 'Visível' : 'Oculto'}
                      </button>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${midia.status === 'ativo' ? 'bg-primary/10 text-primary' : 'bg-surface-variant text-ink-secondary'}`}>
                        {midia.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(midia.id)}
                className="absolute bottom-4 right-4 bg-error/10 text-error hover:bg-error hover:text-white transition-colors p-2 rounded-lg opacity-0 group-hover:opacity-100 outline-none"
                title="Excluir"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          ))}

          {/* Add New Media Placeholder */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="bg-surface-variant/30 rounded-[24px] p-5 border-2 border-dashed border-outline-variant hover:border-primary/50 transition-all cursor-pointer flex flex-col group h-full min-h-[250px]"
          >
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-3xl text-primary">
                  {uploading ? 'sync' : 'upload_file'}
                </span>
              </div>
              <p className="font-bold text-lg text-ink uppercase tracking-wider font-sans">
                {uploading ? 'Enviando...' : 'Nova Mídia'}
              </p>
              <p className="text-[10px] font-bold tracking-widest text-ink-secondary mt-1 text-center px-4">Clique ou arraste arquivos mp4, jpg ou png para cá</p>
            </div>
          </div>
        </div>
        
        {midias.length === 0 && !uploading && (
          <div className="text-center py-20 bg-surface rounded-3xl border border-dashed border-outline-variant">
            <span className="material-symbols-outlined text-6xl text-outline-variant mb-4">cloud_off</span>
            <p className="text-xl font-bold text-ink-secondary tracking-widest font-sans">Nenhuma mídia cadastrada</p>
            <p className="text-ink-secondary/60 mt-2">As mídias aparecerão no carrossel do Telão quando a fila estiver vazia.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
