import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://npfqnsgjicmxwmurwosu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZnFuc2dqaWNteHdtdXJ3b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODQyNDQsImV4cCI6MjA5MjM2MDI0NH0.wLIFMxZkE9rjGQjZF7eFi0dyDioOGQfg1jfhRy32O90';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface LicenseValidationResult {
  isValid: boolean;
  message?: string;
  data?: any;
}

export async function validateLicense(serialCode: string): Promise<LicenseValidationResult> {
  try {
    const { data, error } = await supabase
      .from('serials')
      .select('*')
      .eq('code', serialCode)
      .single();

    if (error || !data) {
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
    return { isValid: false, message: 'Erro de comunicação com o servidor de licenças. Verifique sua conexão com a internet.' };
  }
}
