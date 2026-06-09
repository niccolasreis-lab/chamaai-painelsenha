let installed = false;

export function installFetchInterceptor() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const masterToken = localStorage.getItem('master_remote_token');
    const userToken = localStorage.getItem('user_token');
    let userSession = null;
    try {
      const sessionStr = localStorage.getItem('user_session');
      if (sessionStr) userSession = JSON.parse(sessionStr);
    } catch (e) {}
    
    const operatorToken = userSession?.token;

    if (masterToken || operatorToken || userToken) {
      const headers = new Headers(init?.headers);
      if (masterToken && !headers.has('X-Master-Token')) {
        headers.set('X-Master-Token', masterToken);
      }
      if (operatorToken && !headers.has('X-Operator-Token')) {
        headers.set('X-Operator-Token', operatorToken);
      }
      if (userToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${userToken}`);
      }
      init = { ...init, headers };
    }

    const response = await originalFetch(input, init);

    // If server says token is invalid/expired, force logout
    if (response.status === 401 && (masterToken || operatorToken)) {
      if (masterToken) localStorage.removeItem('master_remote_token');
      if (operatorToken) localStorage.removeItem('user_session');
      window.location.reload();
    }

    return response;
  };
}
