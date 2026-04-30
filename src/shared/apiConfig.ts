export const getApiUrl = () => {
  // Permite sobrescrever o IP via localStorage para dispositivos móveis/APK
  const savedIp = localStorage.getItem('server_ip_override');
  if (savedIp) return `http://${savedIp}:3000`;

  const hostname = window.location.hostname;
  const host = hostname && hostname !== 'localhost' ? hostname : 'localhost';
  return `http://${host}:3000`;
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
