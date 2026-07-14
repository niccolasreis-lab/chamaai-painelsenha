import { useState, useEffect, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import {
  Image,
  EyeOff,
  PlusCircle,
  RefreshCw,
  Move,
  Video,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { StatusBadge } from '../shared/components/StatusBadge';

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
      <div className="max-w-7xl mx-auto space-y-6 font-sans">
        {/* Action Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">Mídias do Telão</h1>
            <p className="text-ink-variant mt-1 text-sm">Configure os vídeos e imagens que serão exibidos no Telão em carrossel.</p>
            <div className="flex space-x-3 mt-3">
              <span className="bg-primary/10 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider text-primary flex items-center space-x-1.5 border border-primary/20 uppercase">
                <Image className="h-3 w-3" />
                <span>{activeCount} ATIVAS</span>
              </span>
              <span className="bg-error/10 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider text-error flex items-center space-x-1.5 border border-error/20 uppercase">
                <EyeOff className="h-3 w-3" />
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
          
          <Button 
            onClick={() => fileInputRef.current?.click()}
            loading={uploading}
            icon={<PlusCircle className="h-4 w-4" />}
          >
            {uploading ? 'Enviando...' : 'Adicionar Mídia'}
          </Button>
        </div>

        {/* Media Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Real Media Cards */}
          {midias.map((midia) => (
            <div key={midia.id} className="bg-surface rounded-md p-4 shadow-sm border border-outline-variant relative group hover:border-primary/50 transition-all animate-fade-in flex flex-col justify-between">
              <div className="absolute top-6 left-6 z-10 cursor-move text-white drop-shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <Move className="h-5 w-5" />
              </div>
              
              <div>
                <div className="aspect-video w-full rounded-md overflow-hidden mb-4 relative bg-ink flex items-center justify-center">
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
                  <div className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                    {midia.tipo === 'video' ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                    <span>{midia.tipo}</span>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-base text-ink truncate pr-2" title={midia.nome}>
                    {midia.nome}
                  </h3>
                  <div className="mt-3 space-y-2">
                    <div>
                      <label className="text-[10px] font-bold text-ink-variant tracking-wider uppercase block mb-1">Data de expiração</label>
                      <input
                        type="date"
                        value={midia.data_expiracao || ''}
                        onChange={(e) => handleUpdate(midia.id, { data_expiracao: e.target.value || null })}
                        className="w-full px-2 py-1 text-xs font-semibold rounded-sm bg-surface-container border border-outline-variant outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
                      <button
                        onClick={() => handleUpdate(midia.id, { ativo: midia.ativo === 1 ? 0 : 1 })}
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm transition-colors ${midia.ativo === 1 ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-error/10 text-error hover:bg-error/20'}`}
                      >
                        {midia.ativo === 1 ? 'Visível' : 'Oculto'}
                      </button>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm ${midia.status === 'ativo' ? 'bg-primary/10 text-primary' : 'bg-surface-container text-ink-variant'}`}>
                        {midia.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 flex justify-end">
                <Button 
                  variant="danger"
                  size="sm"
                  className="px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(midia.id)}
                  title="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Add New Media Placeholder */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="bg-surface-container-low/40 rounded-md p-4 border-2 border-dashed border-outline-variant hover:border-primary/50 transition-all cursor-pointer flex flex-col group h-full min-h-[200px] justify-center items-center"
          >
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-3 shadow-sm group-hover:scale-105 transition-transform border border-outline-variant/20">
                {uploading ? <RefreshCw className="h-5 w-5 text-primary animate-spin" /> : <UploadCloud className="h-5 w-5 text-primary" />}
              </div>
              <p className="font-bold text-sm text-ink">
                {uploading ? 'Enviando...' : 'Nova Mídia'}
              </p>
              <p className="text-[10px] font-semibold text-ink-variant mt-1 max-w-[180px]">Clique para selecionar ou arraste mp4, jpg ou png</p>
            </div>
          </div>
        </div>
        
        {midias.length === 0 && !uploading && (
          <StatusBadge
            variant="empty"
            message="Nenhuma mídia cadastrada"
            detail="As mídias aparecerão no carrossel do Telão quando a fila estiver vazia."
          />
        )}
      </div>
    </AdminLayout>
  );
}
