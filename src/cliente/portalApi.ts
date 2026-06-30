// CHAMA AÍ - Portal API Client
// FASE 5B

export const PORTAL_API_URL = (import.meta.env.VITE_CHAMAAI_PORTAL_API_URL as string) || 'http://localhost:54321/functions/v1/chamaai-portal';

export interface PortalSummary {
  ok: boolean;
  store: {
    name: string;
    theme: {
      primary_color: string;
      logo_url: string | null;
    };
  };
  queue: {
    last_called: Array<{
      id: number | string;
      senha_id: string;
      guiche: string;
      last_update: string;
    }>;
    waiting_count: number;
  };
  features: {
    products?: boolean;
    queue?: boolean;
  };
}

export interface TicketStatus {
  ok: boolean;
  ticket: {
    id: number | string;
    senha_id: string;
    status: 'aguardando' | 'expirado' | 'chamada';
    position: number | null;
    last_update: string;
  };
}

export interface ProductList {
  ok: boolean;
  page: number;
  limit: number;
  products: Array<{
    plu: string;
    descricao: string;
    preco: number;
    categoria: string;
  }>;
}

export async function fetchPortalSummary(token: string): Promise<PortalSummary> {
  const response = await fetch(`${PORTAL_API_URL}?token=${encodeURIComponent(token)}`);
  if (!response.ok) {
    throw new Error('Falha ao carregar informações do portal.');
  }
  return response.json();
}

export async function fetchTicketStatus(token: string, ticketId: string): Promise<TicketStatus> {
  const response = await fetch(`${PORTAL_API_URL}?token=${encodeURIComponent(token)}&senha_id=${encodeURIComponent(ticketId)}`);
  if (!response.ok) {
    throw new Error('Falha ao obter status do ticket.');
  }
  return response.json();
}

export async function fetchPortalProducts(token: string, page = 1, limit = 50): Promise<ProductList> {
  const response = await fetch(`${PORTAL_API_URL}?token=${encodeURIComponent(token)}&resource=products&page=${page}&limit=${limit}`);
  if (!response.ok) {
    throw new Error('Falha ao carregar produtos.');
  }
  return response.json();
}
