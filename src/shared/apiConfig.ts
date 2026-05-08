export const getApiUrl = () => {
  // Permite sobrescrever o IP via localStorage para dispositivos móveis/APK
  const savedIp = localStorage.getItem('server_ip_override');
  if (savedIp) return `http://${savedIp}:3000`;

  // Em modo web, se estivermos no mesmo host, usamos caminhos relativos
  // Isso resolve problemas de HTTPS/Mixed Content e simplifica o proxy
  if (typeof window !== 'undefined') {
    return ''; // Retorna vazio para usar caminhos relativos como /api/...
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
