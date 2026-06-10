export const getApiUrl = () => {
  // Permite sobrescrever o IP via localStorage para dispositivos móveis/APK
  const savedIp = localStorage.getItem('server_ip_override');
  if (savedIp) return `http://${savedIp}:3001`;

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAndroid = userAgent.includes('android');

    // Se estiver rodando dentro do Electron (protocolo file:), o servidor local é o localhost
    if (protocol === 'file:') {
      return `http://localhost:3001`;
    }

    // No Android Emulator, 'localhost' refere-se ao próprio dispositivo.
    // O IP 10.0.2.2 mapeia para o localhost da máquina hospedeira.
    if (isAndroid && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      return `http://10.0.2.2:3001`;
    }

    // Se estiver rodando no navegador (protocolo http ou https)
    // E não estiver rodando dentro de um app nativo (onde savedIp ou outros protocolos se aplicam)
    if (protocol === 'http:' || protocol === 'https:') {
      const isCapacitor = userAgent.includes('capacitor') || protocol.startsWith('capacitor');
      const isAndroidEmulator = isAndroid && (hostname === 'localhost' || hostname === '127.0.0.1');
      
      if (!isCapacitor && !isAndroidEmulator) {
        return '';
      }
    }

    // Se acessarmos via IP (ex: no celular/tablet via app), o hostname já é o servidor
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:3001`;
    }
  }

  // Fallback para o servidor local padrão
  return `http://localhost:3001`;
};

export const setServerIp = (ip: string) => {
  if (!ip) {
    localStorage.removeItem('server_ip_override');
  } else {
    localStorage.setItem('server_ip_override', ip);
  }
  window.location.reload();
};
export const useAPI = () => {
  return { API_URL: getApiUrl() };
};
