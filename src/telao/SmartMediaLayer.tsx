import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiUrl } from '../shared/apiConfig';

interface SmartMediaLayerProps {
  layout: 'lateral' | 'rodape' | 'background' | 'full';
  isCalling: boolean;
  onNext?: () => void;
}

export default function SmartMediaLayer({ layout, isCalling, onNext }: SmartMediaLayerProps) {
  const [playlist, setPlaylist] = useState<any[]>([]);
  const [theme, setTheme] = useState<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [weather, setWeather] = useState<any>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const API_URL = getApiUrl();

  const fetchActivePlaylist = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/media/active-playlist`);
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          setPlaylist(data.items || []);
          setTheme(data.theme);
        } else {
          setPlaylist([]);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar playlist inteligente:', err);
    }
  }, [API_URL]);

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

  useEffect(() => {
    fetchActivePlaylist();
    fetchWeather();
    
    // Configurar listener para o evento SSE de atualização de campanha
    const handleCampaignUpdate = () => {
      fetchActivePlaylist();
    };
    window.addEventListener('MEDIA_CAMPAIGN_UPDATED', handleCampaignUpdate);
    window.addEventListener('MEDIA_ITEMS_UPDATED', handleCampaignUpdate);
    window.addEventListener('MEDIA_THEME_UPDATED', handleCampaignUpdate);
    
    // Atualizar clima a cada 30 min
    const weatherInterval = setInterval(fetchWeather, 30 * 60 * 1000);
    
    return () => {
      window.removeEventListener('MEDIA_CAMPAIGN_UPDATED', handleCampaignUpdate);
      window.removeEventListener('MEDIA_ITEMS_UPDATED', handleCampaignUpdate);
      window.removeEventListener('MEDIA_THEME_UPDATED', handleCampaignUpdate);
      clearInterval(weatherInterval);
    };
  }, [fetchActivePlaylist, fetchWeather]);

  const handleNext = useCallback(() => {
    if (playlist.length > 0) {
      setActiveIndex((prev) => (prev + 1) % playlist.length);
    }
    if (onNext) onNext();
  }, [playlist.length, onNext]);

  useEffect(() => {
    if (playlist.length === 0) return;
    
    // Se isCalling for true e o layout for 'full', podemos pausar se necessário, mas o timer continua.
    const current = playlist[activeIndex];
    if (!current) return;

    if (current.type === 'imagem' || current.type === 'weather') {
      const duration = (current.duration_seconds || 15) * 1000;
      const timer = setTimeout(handleNext, duration);
      return () => clearTimeout(timer);
    } else if (current.type === 'youtube') {
      const duration = (current.duration_seconds || 60) * 1000;
      const timer = setTimeout(handleNext, duration);
      return () => clearTimeout(timer);
    }
    // video delegates to onEnded
  }, [activeIndex, playlist, handleNext]);

  useEffect(() => {
    if (playlist[activeIndex]?.type === 'video' && videoRef.current) {
      // Se não estiver em chamada, ou se o layout não for full, continua tocando
      videoRef.current.play().catch(e => console.warn('Autoplay bloqueado:', e));
    }
  }, [activeIndex, playlist, isCalling, layout]);

  if (playlist.length === 0) {
    return null;
  }

  const currentMedia = playlist[activeIndex];
  
  // Render based on media type
  const renderMedia = () => {
    if (!currentMedia) return null;
    
    if (currentMedia.type === 'video') {
      return (
        <video 
          ref={videoRef}
          src={`${API_URL}${currentMedia.local_path}`} 
          className="w-full h-full object-contain"
          autoPlay
          muted
          onEnded={handleNext}
          onError={handleNext}
          playsInline
        />
      );
    }
    
    if (currentMedia.type === 'imagem') {
      return (
        <img 
          src={`${API_URL}${currentMedia.local_path}`} 
          alt={currentMedia.title}
          className="w-full h-full object-contain"
          onError={handleNext}
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
      
      if (!videoId) return <div className="text-white flex h-full items-center justify-center">URL do YouTube Inválida</div>;

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

    if (currentMedia.type === 'weather') {
      if (!weather) return <div className="text-white">Carregando clima...</div>;
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 to-indigo-900 text-white p-8">
          <span className="material-symbols-outlined text-[80px] mb-4">
            {weather.current_weather?.weathercode === 0 ? 'sunny' : 'cloud'}
          </span>
          <h2 className="text-4xl font-bold uppercase tracking-widest">{weather.current_weather?.temperature}°C</h2>
          <p className="text-xl opacity-80 mt-2 uppercase tracking-wider">Vento: {weather.current_weather?.windspeed} km/h</p>
        </div>
      );
    }

    return null;
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
