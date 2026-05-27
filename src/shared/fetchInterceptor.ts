let installed = false;

export function installFetchInterceptor() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = localStorage.getItem('master_remote_token');

    if (token) {
      const headers = new Headers(init?.headers);
      if (!headers.has('X-Master-Token')) {
        headers.set('X-Master-Token', token);
      }
      init = { ...init, headers };
    }

    const response = await originalFetch(input, init);

    // If server says token is invalid/expired, force logout
    if (response.status === 401 && token) {
      localStorage.removeItem('master_remote_token');
      window.location.reload();
    }

    return response;
  };
}
