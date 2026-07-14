import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, Users, PlusCircle } from 'lucide-react';
import { getApiUrl } from '../shared/apiConfig';
import { Button } from '../shared/components/Button';

export default function Confirmacao() {
  const navigate = useNavigate();
  const location = useLocation();
  const senhaData = location.state?.senha;
  const API_URL = getApiUrl();

  const voltarTelaInicial = () => {
    const ticket = document.getElementById('ticket-fisico');
    if (ticket) {
      ticket.classList.remove('animate-print-tease');
    }
    navigate('/totem');
  };

  useEffect(() => {
    // If no data (e.g. page refresh), go back to emission screen
    if (!senhaData) {
      navigate('/totem');
      return;
    }

    // Auto return to emission screen after 5 seconds
    const timer = setTimeout(() => {
      voltarTelaInicial();
    }, 5000);
    return () => clearTimeout(timer);
  }, [navigate, senhaData]);

  const numeroFormatado = senhaData?.numero !== undefined 
    ? String(senhaData.numero).padStart(3, '0') 
    : '---';

  const [pessoasNaFrente, setPessoasNaFrente] = useState(0);

  useEffect(() => {
    const fetchFila = async () => {
      try {
        const res = await fetch(`${API_URL}/api/senhas`);
        const data = await res.json();
        // Contar quantas senhas estão aguardando e foram emitidas antes desta
        if (senhaData?.id) {
          const naFrente = data.filter((s: any) => s.status === 'aguardando' && s.id < senhaData.id).length;
          setPessoasNaFrente(naFrente);
        }
      } catch (err) {}
    };
    fetchFila();
  }, [senhaData, API_URL]);

  useEffect(() => {
    const ticket = document.getElementById('ticket-fisico');
    if (ticket) {
      ticket.classList.remove('animate-print-tease');
      void ticket.offsetWidth; // force reflow
      ticket.classList.add('animate-print-tease');
    }
  }, [senhaData]);

  return (
    <div className="bg-background h-screen w-screen flex flex-col items-center justify-center p-4 overflow-hidden fixed inset-0">
      <main className="w-full max-w-[650px] bg-surface rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.08)] p-6 flex flex-col items-center text-center border-b-[6px] border-outline-variant/20 overflow-hidden animate-pop-in-card">
        <div className="bg-success/10 text-success w-16 h-16 rounded-full flex items-center justify-center mb-4 shrink-0 animate-bounce-check">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        
        <h1 className="font-sans text-3xl font-bold text-ink mb-1 uppercase tracking-tight shrink-0">Senha Emitida</h1>
        <p className="font-sans text-lg text-ink-variant mb-4 font-medium shrink-0">Retire seu ticket e aguarde.</p>
        
        <div className="bg-surface-variant/20 w-full rounded-md py-6 px-4 mb-6 border-2 border-outline-variant/20 relative overflow-hidden flex flex-col items-center justify-center shrink-0">
          <span className="font-sans text-base font-bold tracking-[0.2em] text-primary uppercase mb-1">
            Sua Senha
          </span>
          <div className="font-sans text-[7rem] font-black text-primary leading-none tracking-tighter">
            {numeroFormatado}
          </div>
        </div>
        
        <div className="w-full grid grid-cols-2 gap-4 mb-6 border-t border-outline-variant/20 pt-4 shrink-0">
          <div className="flex flex-col items-center bg-surface-variant/10 rounded-md py-3">
            <span className="font-sans text-xs font-bold text-ink-variant uppercase mb-1">Horário</span>
            <div className="flex items-center gap-2 font-sans text-xl font-bold text-ink">
              <Clock className="h-5 w-5 text-primary" />
              <span id="display-hora">
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center bg-surface-variant/10 rounded-md py-3">
            <span className="font-sans text-xs font-bold text-ink-variant uppercase mb-1">Na Frente</span>
            <div className="flex items-center gap-2 font-sans text-xl font-bold text-ink">
              <Users className="h-5 w-5 text-warning-ink" />
              <span>{pessoasNaFrente}</span>
            </div>
          </div>
        </div>
        
        <Button 
          onClick={voltarTelaInicial}
          className="w-full py-6 text-2xl font-bold uppercase tracking-widest shrink-0"
          icon={<PlusCircle className="h-6 w-6" />}
        >
          Retirar Nova Senha
        </Button>
      </main>

      {/* Calha da Impressora Física Simulada */}
      <div className="printer-base mt-6 shrink-0">
        <div className="printer-slot"></div>
        <div className="printed-ticket animate-print-tease" id="ticket-fisico">
          <h5 className="font-bold">SENHA EMITIDA</h5>
          <div className="ticket-number" id="ticket-codigo">{numeroFormatado}</div>
          <p style={{ fontWeight: 'bold', marginTop: '2px' }}>
            {senhaData?.preferencial ? 'Atendimento Prioritário' : 'Atendimento Geral'}
          </p>
          <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '6px 0' }} />
          <p style={{ fontSize: '0.65rem' }}><strong>Fila e Lista de Produtos</strong></p>
          <div style={{ width: '50px', height: '50px', background: '#222', margin: '6px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.1rem' }}>📷</div>
          <p style={{ fontSize: '0.55rem', color: 'var(--gray-text)', lineHeight: '1.2' }}>Escaneie o QR Code para acompanhar sua vez e consultar os preços a granel!</p>
        </div>
      </div>
      
      <footer className="mt-6 text-center opacity-30 shrink-0">
        <p className="font-sans text-base text-ink-variant font-medium tracking-widest uppercase">ChamaAí</p>
      </footer>
    </div>
  );
}
