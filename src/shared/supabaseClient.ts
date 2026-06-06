import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface LicenseValidationResult {
  isValid: boolean;
  message?: string;
  data?: any;
  isNetworkError?: boolean;
}

export async function validateLicense(serialCode: string): Promise<LicenseValidationResult> {
  try {
    const { data, error } = await supabase
      .from('serials')
      .select('*')
      .eq('code', serialCode)
      .single();

    if (error) {
      const errMsg = error.message || '';
      const isNetwork = errMsg.includes('fetch') || errMsg.includes('Network') || error.code === 'UND_ERR_CONNECT_TIMEOUT';
      if (isNetwork) {
        return { isValid: false, message: 'Falha de comunicação com o servidor. Verifique sua conexão com a internet.', isNetworkError: true };
      }
      return { isValid: false, message: 'Serial inválido ou inexistente.' };
    }

    if (!data) {
      return { isValid: false, message: 'Serial inválido ou inexistente.' };
    }

    if (data.status !== 'Active') {
      return { isValid: false, message: 'Esta licença foi bloqueada por violação de termos ou falta de pagamento.' };
    }

    if (data.expiration_date) {
      const expirationDate = new Date(data.expiration_date);
      if (new Date() > expirationDate) {
        const dataFormatada = expirationDate.toLocaleDateString('pt-BR');
        return { isValid: false, message: `Sua licença expirou em ${dataFormatada}. Entre em contato para renovar.` };
      }
    }

    return { isValid: true, data };
  } catch (err) {
    console.error('Erro ao validar licença:', err);
    return { isValid: false, message: 'Erro de comunicação com o servidor de licenças. Verifique sua conexão com a internet.', isNetworkError: true };
  }
}
