export function normalizePortalBaseUrl(portalBase: string): string {
  const raw = String(portalBase ?? '').trim();
  if (!raw) return '';

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL do Portal do Cliente inválida. Informe uma URL completa, incluindo https://.');
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('A URL do Portal do Cliente deve usar HTTP ou HTTPS.');
  }

  // Ticket IDs belong to each printed ticket and must never be persisted in
  // the configured base URL. The public store token, when present, is kept.
  url.searchParams.delete('ticket');
  url.searchParams.delete('senha_id');
  if (url.hash) {
    const [route, rawQuery = ''] = url.hash.slice(1).split('?', 2);
    const params = new URLSearchParams(rawQuery);
    params.delete('ticket');
    params.delete('senha_id');
    url.hash = params.size > 0 ? `${route}?${params.toString()}` : route;
  }

  return url.toString();
}

export function buildPortalTicketUrl(portalBase: string, ticketId: string | number): string {
  const normalizedTicket = String(ticketId ?? '').trim();
  if (!/^\d+$/.test(normalizedTicket) || Number(normalizedTicket) <= 0) {
    throw new Error('Identificador da senha ausente ou inválido para o QR Code.');
  }

  let url: URL;
  try {
    url = new URL(normalizePortalBaseUrl(portalBase));
  } catch {
    throw new Error('URL do Portal do Cliente inválida.');
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('A URL do Portal do Cliente deve usar HTTP ou HTTPS.');
  }

  // Legacy hash-router URLs need their query inside the hash. Cloud and modern
  // URLs use regular search parameters.
  if (url.hash && !url.search) {
    const [route, rawQuery = ''] = url.hash.slice(1).split('?', 2);
    const params = new URLSearchParams(rawQuery);
    params.delete('senha_id');
    params.set('ticket', normalizedTicket);
    url.hash = `${route}?${params.toString()}`;
  } else {
    url.searchParams.delete('senha_id');
    url.searchParams.set('ticket', normalizedTicket);
  }

  return url.toString();
}

export function assertPublicPortalUrl(portalUrl: string): void {
  let url: URL;
  try {
    url = new URL(portalUrl);
  } catch {
    throw new Error('URL pública do Portal do Cliente inválida.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const octets = hostname.split('.').map(Number);
  const privateIpv4 = octets.length === 4 && octets.every(Number.isInteger) && (
    octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
  );
  const localHostname = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || hostname === '0.0.0.0';

  if (url.protocol !== 'https:' || localHostname || privateIpv4) {
    throw new Error('O QR Code exige uma URL pública HTTPS acessível pelo celular.');
  }
  if (!url.searchParams.get('token')) {
    throw new Error('O QR Code exige o token público da loja.');
  }
}
