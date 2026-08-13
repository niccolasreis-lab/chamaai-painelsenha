
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sun, Cloud } from 'lucide-react';
import { getApiUrl } from '../shared/apiConfig';
import EncartePrecos from './EncartePrecos';
import EncarteGranel from './EncarteGranel';
import { readDisplayCache, writeDisplayCache } from './displayCache';
import type { ProdutoToledo, Categoria, TemaEncarte, EstablishmentConfig, PerfilTelao, MediaItem } from '../shared/types';

interface SmartMediaLayerProps {
  layout: 'lateral' | 'rodape' | 'background' | 'full';
  isCalling: boolean;
  onNext?: () => void;
  // Caching props passed from parent MediaIndoor
  encarteProdutos?: ProdutoToledo[];
  encarteCategorias?: Categoria[];
  encarteTemaAtivo?: TemaEncarte | null;
  encarteLoading?: boolean;
  encarteError?: string | null;
  lowPerformanceMode?: boolean;
}

type WeatherData = {
  current_weather?: {
    weathercode?: number;
    temperature?: number;
    windspeed?: number;
  };
};

export default function SmartMediaLayer({ 
  layout, 
  isCalling, 
  onNext,
  encarteProdutos = [],
  encarteCategorias = [],
  encarteTemaAtivo = null,
  encarteLoading = false,
  encarteError = null,
  lowPerformanceMode = false
}: SmartMediaLayerProps) {
  const API_URL = getApiUrl();
  const [playlist, setPlaylist] = useState<MediaItem[]>(() => (
    readDisplayCache<{ items: MediaItem[]; theme: TemaEncarte | null }>(API_URL, 'smart-playlist')?.data.items || []
  ));
  const [theme, setTheme] = useState<TemaEncarte | null>(() => (
    readDisplayCache<{ items: MediaItem[]; theme: TemaEncarte | null }>(API_URL, 'smart-playlist')?.data.theme || null
  ));
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedMediaIds, setFailedMediaIds] = useState<Set<string | number>>(() => new Set());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [config, setConfig] = useState<Partial<EstablishmentConfig>>({});
  const [perfil, setPerfil] = useState<PerfilTelao | null>(null);
  const parsedEncarteCategories = useMemo(() => (
    perfil?.encarte_categorias
      ? perfil.encarte_categorias.split(';').map((category: string) => category.trim()).filter(Boolean)
      : []
  ), [perfil?.encarte_categorias]);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  const resolveMediaUrl = useCallback((value?: string | null) => {
    if (!value) return '';
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    return `${API_URL}${value.startsWith('/') ? value : `/${value}`}`;
  }, [API_URL]);

  const fetchActivePlaylist = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/media/active-playlist`);
      if (!res.ok) throw new Error(`Falha ao buscar playlist (${res.status})`);

      const data = await res.json();
      if (data.active) {
        let items = (data.items || []) as MediaItem[];
        // Remove encartes e tabelas se o layout for lateral ou rodape
        if (layout === 'lateral' || layout === 'rodape') {
          items = items.filter((item: MediaItem) => item.type !== 'encarte' && item.type !== 'tabela');
        }
        const nextTheme = (data.theme || null) as TemaEncarte | null;
        setPlaylist(items);
        setTheme(nextTheme);
        setActiveIndex(0);
        setFailedMediaIds(new Set());
        writeDisplayCache(API_URL, 'smart-playlist', { items, theme: nextTheme });
      } else {
        setPlaylist([]);
        setTheme(null);
        setActiveIndex(0);
        setFailedMediaIds(new Set());
        writeDisplayCache(API_URL, 'smart-playlist', { items: [], theme: null });
      }
    } catch (err) {
      console.error('Erro ao buscar playlist inteligente:', err);
    }
  }, [API_URL, layout]);

  const fetchWeather = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/media/weather`);
      if (res.ok) {
        setWeather(await res.json());
      }
    } catch (err) {
      console.error('Erro ao buscar clima:', err);
    }
  }, [API_URL]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`);
      if (res.ok) {
        setConfig(await res.json());
      }
    } catch (err) {
      console.error('Erro ao buscar configurações:', err);
    }
  }, [API_URL]);

  const fetchPerfil = useCallback(async (code: string) => {
    try {
      const res = await fetch(`${API_URL}/api/telao/profile/${code}`);
      if (res.ok) {
        setPerfil(await res.json());
      }
    } catch (err) {
      console.error('Erro ao buscar perfil do telão:', err);
    }
  }, [API_URL]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchActivePlaylist();
    fetchWeather();
    fetchConfig();
    
    const telaoCode = localStorage.getItem('telao_code');
    if (telaoCode) {
      fetchPerfil(telaoCode);
    }
    
    // Configurar listener para o evento SSE de atualização de campanha
    const handleCampaignUpdate = () => {
      fetchActivePlaylist();
    };
    
    const handleConfigUpdate = () => {
      fetchConfig();
    };

    const handlePerfilUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<PerfilTelao>;
      if (customEvent.detail) {
        setPerfil(customEvent.detail);
      } else if (telaoCode) {
        fetchPerfil(telaoCode);
      }
    };

    window.addEventListener('MEDIA_CAMPAIGN_UPDATED', handleCampaignUpdate);
    window.addEventListener('MEDIA_ITEMS_UPDATED', handleCampaignUpdate);
    window.addEventListener('MEDIA_THEME_UPDATED', handleCampaignUpdate);
    window.addEventListener('CONFIG_ATUALIZADA', handleConfigUpdate);
    window.addEventListener('TELAO_ATUALIZADO', handlePerfilUpdate);
    
    // Atualizar clima a cada 30 min
    const weatherInterval = setInterval(fetchWeather, 30 * 60 * 1000);
    const playlistInterval = setInterval(fetchActivePlaylist, 60 * 1000);
    
    return () => {
      window.removeEventListener('MEDIA_CAMPAIGN_UPDATED', handleCampaignUpdate);
      window.removeEventListener('MEDIA_ITEMS_UPDATED', handleCampaignUpdate);
      window.removeEventListener('MEDIA_THEME_UPDATED', handleCampaignUpdate);
      window.removeEventListener('CONFIG_ATUALIZADA', handleConfigUpdate);
      window.removeEventListener('TELAO_ATUALIZADO', handlePerfilUpdate);
      clearInterval(weatherInterval);
      clearInterval(playlistInterval);
    };
  }, [fetchActivePlaylist, fetchWeather, fetchConfig, fetchPerfil]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleNext = useCallback(() => {
    if (playlist.length > 0) {
      setActiveIndex((prev) => (prev + 1) % playlist.length);
    }
    if (onNext) onNext();
  }, [playlist.length, onNext]);

  const markMediaFailed = useCallback((mediaId: string | number) => {
    setFailedMediaIds(previous => {
      const next = new Set(previous);
      next.add(mediaId);
      return next;
    });
  }, []);

  // Log de diagnóstico temporário para confirmar playlist ativa no telão
  useEffect(() => {
    if (playlist.length > 0) {
      console.log('[Carrossel] Playlist ativa:', playlist.map(item => ({
        id: item.id,
        tipo: item.type || item.tipo,
        nome: item.title || item.nome,
        ativo: item.is_active !== undefined ? item.is_active : item.ativo
      })));
    }
  }, [playlist]);

  useEffect(() => {
    if (playlist.length === 0) return;
    
    // Se isCalling for true e o layout for 'full', podemos pausar se necessário, mas o timer continua.
    const current = playlist[activeIndex];
    if (!current) return;

    const type = current.type || current.tipo;
    const hasRequiredSource = (
      (type === 'video' || type === 'image' || type === 'imagem')
        ? Boolean(current.local_path || current.caminho)
        : (type === 'youtube' || type === 'url')
          ? Boolean(current.source_url)
          : ['weather', 'tabela', 'encarte'].includes(String(type))
    );
    const failed = failedMediaIds.has(current.id);

    // Vídeos válidos avançam pelo evento onEnded.
    if (type === 'video' && hasRequiredSource && !failed) return;

    const durationSeconds = failed || !hasRequiredSource
      ? 2
      : (current.duration_seconds || 15);
    const duration = durationSeconds * 1000;
    const timer = setTimeout(handleNext, duration);
    return () => clearTimeout(timer);
  }, [activeIndex, playlist, handleNext, failedMediaIds]);

  useEffect(() => {
    if (
      playlist[activeIndex]?.type === 'video'
      && !failedMediaIds.has(playlist[activeIndex].id)
      && videoRef.current
    ) {
      // Se não estiver em chamada, ou se o layout não for full, continua tocando
      videoRef.current.play().catch(e => console.warn('Autoplay bloqueado:', e));
    }
  }, [activeIndex, playlist, isCalling, layout, failedMediaIds]);

  if (playlist.length === 0) {
    return null;
  }

  const currentMedia = playlist[activeIndex];

  const renderFallback = () => (
    <div className="h-full w-full bg-[#041a14] text-white flex flex-col items-center justify-center gap-5 p-8 text-center">
      {config.logo_cliente ? (
        <img
          src={`${API_URL}${config.logo_cliente}`}
          className="max-h-32 max-w-[40%] object-contain"
          alt=""
        />
      ) : null}
      <span className="text-xl font-semibold tracking-wide">
        {config.nome_estabelecimento || 'ChamaAí'}
      </span>
    </div>
  );
  
  // Render based on media type
  const renderMedia = () => {
    if (!currentMedia) return null;
    if (failedMediaIds.has(currentMedia.id)) return renderFallback();
    
    if (currentMedia.type === 'video') {
      return (
        <video 
          ref={videoRef}
          src={resolveMediaUrl(currentMedia.local_path)}
          className="w-full h-full object-cover"
          autoPlay
          muted
          onEnded={handleNext}
          onError={() => markMediaFailed(currentMedia.id)}
          playsInline
        />
      );
    }
    
    if (currentMedia.type === 'image' || currentMedia.type === 'imagem') {
      return (
        <img 
          src={resolveMediaUrl(currentMedia.local_path)}
          alt={currentMedia.title}
          className="w-full h-full object-cover"
          onError={() => markMediaFailed(currentMedia.id)}
        />
      );
    }

    if (currentMedia.type === 'tabela' || currentMedia.type === 'encarte') {
      const EncarteComponent = config.toledo_encarte_estilo === 'granel' ? EncarteGranel : EncartePrecos;

      return (
        <EncarteComponent
          duracao={currentMedia.duration_seconds || parseInt(String(config.toledo_encarte_duracao ?? '15'), 10)}
          itensPorSlide={parseInt(String(config.toledo_itens_por_slide ?? '12'), 10)}
          onComplete={handleNext}
          config={config}
          categoriasFiltro={parsedEncarteCategories}
          produtos={encarteProdutos}
          categorias={encarteCategorias}
          temaAtivo={encarteTemaAtivo}
          loading={encarteLoading}
          error={encarteError}
          lowPerformanceMode={lowPerformanceMode}
        />
      );
    }

    if (currentMedia.type === 'youtube') {
      // Extrai video ID da URL (ex: https://www.youtube.com/watch?v=dQw4w9WgXcQ)
      const extractVideoID = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|live\/)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
      };
      const videoId = currentMedia.source_url ? extractVideoID(currentMedia.source_url) : null;
      
      if (!videoId) return renderFallback();

      return (
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1`}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      );
    }

    if (currentMedia.type === 'url' && currentMedia.source_url) {
      return (
        <iframe
          className="w-full h-full border-0 bg-black"
          src={currentMedia.source_url}
          title={currentMedia.title || 'Conteúdo web'}
          sandbox="allow-forms allow-presentation allow-same-origin allow-scripts"
          referrerPolicy="no-referrer"
        />
      );
    }

    if (currentMedia.type === 'weather') {
      if (!weather) return <div className="text-white">Carregando clima...</div>;
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 to-indigo-900 text-white p-8">
          {weather.current_weather?.weathercode === 0 ? (
            <Sun className="h-20 w-20 mb-4 text-amber-400" />
          ) : (
            <Cloud className="h-20 w-20 mb-4 text-blue-200" />
          )}
          <h2 className="text-4xl font-bold uppercase tracking-widest">{weather.current_weather?.temperature}°C</h2>
          <p className="text-xl opacity-80 mt-2 uppercase tracking-wider">Vento: {weather.current_weather?.windspeed} km/h</p>
        </div>
      );
    }

    return renderFallback();
  };

  // Resolve styles based on layout
  let baseClasses = '';
  switch(layout) {
    case 'lateral':
      baseClasses = 'w-[30%] h-full border-l border-outline-variant/30 bg-black shrink-0 relative z-10';
      break;
    case 'rodape':
      baseClasses = 'w-full h-64 border-t border-outline-variant/30 bg-black shrink-0 relative z-10';
      break;
    case 'background':
      baseClasses = 'w-full h-full absolute inset-0 -z-10 opacity-30';
      break;
    case 'full':
      // Se estiver full screen e chamando senha, baixa o z-index para não esconder a senha
      baseClasses = isCalling 
        ? 'w-full h-full absolute inset-0 z-0 opacity-20' 
        : 'w-full h-full absolute inset-0 z-50 bg-black';
      break;
  }

  const cssStyle = theme?.custom_css || {};

  return (
    <div className={`${baseClasses} overflow-hidden animate-fade-in transition-all duration-500`} style={cssStyle}>
      {renderMedia()}
    </div>
  );
}
