export const getApiUrl = () => {
  // Permite sobrescrever o IP via localStorage para dispositivos móveis/APK
  const savedIp = localStorage.getItem('server_ip_override');
  if (savedIp) return `http://${savedIp}:3000`;

  // Em modo web, se estivermos no mesmo host, usamos caminhos relativos
  // Isso resolve problemas de HTTPS/Mixed Content e simplifica o proxy
  if (typeof window !== 'undefined') {
    // Se acessarmos via IP (ex: no celular), o hostname já é o servidor
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !savedIp) {
      return `http://${hostname}:3000`;
    }
    return ''; // Fallback para relativo
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
