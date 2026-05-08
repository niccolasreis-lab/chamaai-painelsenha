export const getApiUrl = () => {
  // Permite sobrescrever o IP via localStorage para dispositivos móveis/APK
  const savedIp = localStorage.getItem('server_ip_override');
  if (savedIp) return `http://${savedIp}:3000`;

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    // Se estiver rodando dentro do Electron (protocolo file:), o servidor local é o localhost
    if (protocol === 'file:') {
      return `http://localhost:3000`;
    }

    const hostname = window.location.hostname;
    // Se acessarmos via IP (ex: no celular), o hostname já é o servidor
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:3000`;
    }
    return ''; // Fallback para relativo na web
  }

  return `http://localhost:3000`;
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
