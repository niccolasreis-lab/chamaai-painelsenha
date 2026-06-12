import { useState, useEffect } from 'react';
import { Building2, Palette, CheckCircle2, ChevronRight, Check, Target, Users, MonitorPlay, ArrowRight } from 'lucide-react';
import { getApiUrl } from '../shared/apiConfig';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  // Inicialização do estado lendo do localStorage se existir
  const [step, setStep] = useState(() => {
    const savedStep = localStorage.getItem('onboarding_step');
    return savedStep ? parseInt(savedStep, 10) : 1;
  });

  const [formData, setFormData] = useState(() => {
    try {
      const savedData = localStorage.getItem('onboarding_data');
      return savedData ? JSON.parse(savedData) : {
        nome_estabelecimento: '',
        cnpj: '',
        categoria: '',
        cor_primaria: '#2563eb'
      };
    } catch (e) {
      return {
        nome_estabelecimento: '',
        cnpj: '',
        categoria: '',
        cor_primaria: '#2563eb'
      };
    }
  });

  // Salva no localStorage sempre que step ou formData mudarem
  useEffect(() => {
    localStorage.setItem('onboarding_step', step.toString());
    localStorage.setItem('onboarding_data', JSON.stringify(formData));
  }, [step, formData]);

  const updateForm = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleFinish = async () => {
    try {
      const API_URL = getApiUrl();
      const res = await fetch(`${API_URL}/api/configuracoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_estabelecimento: formData.nome_estabelecimento,
          cor_primaria: formData.cor_primaria,
          cnpj_estabelecimento: formData.cnpj,
          categoria_estabelecimento: formData.categoria
        })
      });
      if (!res.ok) {
        throw new Error('Falha ao salvar as configurações no servidor.');
      }
    } catch (e: any) {
      console.error('Erro ao salvar onboarding:', e);
      alert('Aviso: Não foi possível salvar as configurações no servidor local, mas seu progresso foi marcado como concluído localmente.');
    }
    
    // Marca como completo no storage
    localStorage.setItem('onboarding_completed', 'true');
    // Remove dados temporários
    localStorage.removeItem('onboarding_step');
    localStorage.removeItem('onboarding_data');
    
    onComplete();
  };

  const categorias = [
    'Supermercado', 'Farmácia', 'Barbearia / Salão', 'Clínica', 
    'Açougue / Padaria', 'Loja de Roupas', 'Outros'
  ];

  const coresSugeridas = [
    { nome: 'Azul Padrão', hex: '#2563eb' },
    { nome: 'Verde Sucesso', hex: '#16a34a' },
    { nome: 'Vermelho Intenso', hex: '#dc2626' },
    { nome: 'Amarelo Ouro', hex: '#ca8a04' },
    { nome: 'Roxo Premium', hex: '#9333ea' },
    { nome: 'Preto Clássico', hex: '#0f172a' },
  ];

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center font-sans overflow-y-auto p-4 sm:p-8">
      <div className="w-full max-w-4xl bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[600px]">
        
        {/* Painel Esquerdo - Indicador de Passos */}
        <div className="w-full md:w-1/3 bg-surface-variant p-8 border-b md:border-b-0 md:border-r border-outline-variant/30 flex flex-col">
          <div className="mb-12">
            <h1 className="text-3xl font-black text-primary tracking-widest uppercase mb-2">ChamaAí</h1>
            <p className="text-ink-secondary text-sm font-semibold uppercase tracking-wider">Bem-vindo(a) ao seu novo sistema</p>
          </div>

          <div className="flex-1 flex flex-col gap-8">
            <div className={`flex items-center gap-4 transition-opacity ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-inner ${step >= 1 ? 'bg-primary text-white' : 'bg-outline-variant text-ink-secondary'}`}>
                {step > 1 ? <Check size={20} strokeWidth={3} /> : '1'}
              </div>
              <div>
                <h3 className="font-bold text-ink uppercase tracking-wider text-sm">O Negócio</h3>
                <p className="text-xs text-ink-secondary uppercase tracking-widest font-semibold mt-1">Dados da Empresa</p>
              </div>
            </div>

            <div className={`flex items-center gap-4 transition-opacity ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-inner ${step >= 2 ? 'bg-primary text-white' : 'bg-outline-variant text-ink-secondary'}`}>
                {step > 2 ? <Check size={20} strokeWidth={3} /> : '2'}
              </div>
              <div>
                <h3 className="font-bold text-ink uppercase tracking-wider text-sm">Personalização</h3>
                <p className="text-xs text-ink-secondary uppercase tracking-widest font-semibold mt-1">Sua Marca</p>
              </div>
            </div>

            <div className={`flex items-center gap-4 transition-opacity ${step === 3 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-inner ${step === 3 ? 'bg-primary text-white' : 'bg-outline-variant text-ink-secondary'}`}>
                3
              </div>
              <div>
                <h3 className="font-bold text-ink uppercase tracking-wider text-sm">Tudo Pronto!</h3>
                <p className="text-xs text-ink-secondary uppercase tracking-widest font-semibold mt-1">Próximos Passos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Painel Direito - Conteúdo do Passo */}
        <div className="w-full md:w-2/3 p-8 md:p-12 flex flex-col">
          
          {/* STEP 1: Dados do Negócio */}
          {step === 1 && (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="mb-8">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
                  <Building2 size={24} />
                </div>
                <h2 className="text-2xl font-bold text-ink uppercase tracking-wider mb-2">Configure seu Estabelecimento</h2>
                <p className="text-ink-secondary font-medium">Preencha os dados básicos para que o sistema funcione com a cara do seu negócio.</p>
              </div>

              <div className="space-y-6 flex-1">
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">Nome do Estabelecimento *</label>
                  <input 
                    type="text" 
                    value={formData.nome_estabelecimento}
                    onChange={(e) => updateForm('nome_estabelecimento', e.target.value)}
                    placeholder="Ex: Barbearia do Zé"
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                  />
                </div>
                
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">CNPJ (Opcional)</label>
                  <input 
                    type="text" 
                    value={formData.cnpj}
                    onChange={(e) => updateForm('cnpj', e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">Categoria do Negócio</label>
                  <select 
                    value={formData.categoria}
                    onChange={(e) => updateForm('categoria', e.target.value)}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Selecione uma categoria...</option>
                    {categorias.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={handleNext}
                  disabled={!formData.nome_estabelecimento.trim()}
                  className="bg-primary text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-primary-hover active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuar
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Personalização */}
          {step === 2 && (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="mb-8">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
                  <Palette size={24} />
                </div>
                <h2 className="text-2xl font-bold text-ink uppercase tracking-wider mb-2">Personalize Sua Interface</h2>
                <p className="text-ink-secondary font-medium">Escolha a cor principal que os seus clientes e operadores verão no telão e no painel.</p>
              </div>

              <div className="flex-1 space-y-8">
                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-4 text-xs">Selecione uma Cor Primária</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {coresSugeridas.map(cor => (
                      <button
                        key={cor.hex}
                        onClick={() => updateForm('cor_primaria', cor.hex)}
                        className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${formData.cor_primaria === cor.hex ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-outline-variant'}`}
                      >
                        <div className="w-8 h-8 rounded-full shadow-inner" style={{ backgroundColor: cor.hex }}></div>
                        <span className="text-xs font-bold uppercase tracking-wider text-ink text-center">{cor.nome}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">Ou digite uma cor específica (HEX)</label>
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl shadow-inner border border-outline-variant/30 shrink-0" style={{ backgroundColor: formData.cor_primaria }}></div>
                    <input 
                      type="text" 
                      value={formData.cor_primaria}
                      onChange={(e) => updateForm('cor_primaria', e.target.value)}
                      placeholder="#000000"
                      className="w-full max-w-[200px] bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center">
                <button 
                  onClick={() => setStep(1)}
                  className="text-ink-secondary px-4 py-3 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-surface-variant transition-all"
                >
                  Voltar
                </button>
                <button 
                  onClick={handleNext}
                  className="bg-primary text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-primary-hover active:scale-95 transition-all flex items-center gap-2"
                >
                  Próximo Passo
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Checklist */}
          {step === 3 && (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="mb-8">
                <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center text-success mb-4">
                  <CheckCircle2 size={24} />
                </div>
                <h2 className="text-2xl font-bold text-ink uppercase tracking-wider mb-2">Tudo Configurado!</h2>
                <p className="text-ink-secondary font-medium">O seu sistema básico já está salvo. Para tirar o máximo proveito do ChamaAí, sugerimos os próximos passos abaixo.</p>
              </div>

              <div className="flex-1 space-y-4">
                <div className="bg-surface-variant/50 border border-outline-variant/50 p-5 rounded-2xl flex gap-4 items-start">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0 mt-1">
                    <MonitorPlay size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-ink uppercase tracking-wider text-sm mb-1">1. Conecte o Telão</h4>
                    <p className="text-sm text-ink-secondary leading-relaxed">Abra o menu principal do sistema em uma Smart TV ou Monitor e clique em "Telão" para começar a exibir as senhas e mídias.</p>
                  </div>
                </div>

                <div className="bg-surface-variant/50 border border-outline-variant/50 p-5 rounded-2xl flex gap-4 items-start">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0 mt-1">
                    <Users size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-ink uppercase tracking-wider text-sm mb-1">2. Cadastre Operadores</h4>
                    <p className="text-sm text-ink-secondary leading-relaxed">No painel Admin, vá até "Operadores" para criar usuários para a sua equipe, assim eles poderão chamar as senhas nos guichês.</p>
                  </div>
                </div>

                <div className="bg-surface-variant/50 border border-outline-variant/50 p-5 rounded-2xl flex gap-4 items-start">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0 mt-1">
                    <Target size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-ink uppercase tracking-wider text-sm mb-1">3. Personalize os Balcões</h4>
                    <p className="text-sm text-ink-secondary leading-relaxed">Acesse "Configurações" e "Gestão de Filas" para definir os nomes corretos dos seus balcões (ex: Caixa 01, Triagem, Retirada).</p>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex justify-between items-center pt-6 border-t border-outline-variant/30">
                <button 
                  onClick={() => setStep(2)}
                  className="text-ink-secondary px-4 py-3 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-surface-variant transition-all"
                >
                  Revisar
                </button>
                <button 
                  onClick={handleFinish}
                  className="bg-success text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-green-600 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-success/20"
                >
                  Acessar Meu Painel Admin
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
