import { useState, useEffect } from 'react';
import { Building2, Palette, CheckCircle2, ChevronRight, Check, Target, Users, MonitorPlay, ArrowRight } from 'lucide-react';
import { getApiUrl } from '../shared/apiConfig';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';

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
        cor_primaria: '#3525CD'
      };
    } catch (e) {
      return {
        nome_estabelecimento: '',
        cnpj: '',
        categoria: '',
        cor_primaria: '#3525CD'
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
          categoria_estabelecimento: formData.categoria,
          onboarding_completed: '1'
        })
      });
      if (!res.ok) {
        throw new Error('Falha ao salvar as configurações no servidor.');
      }
    } catch (e: any) {
      console.error('Erro ao salvar onboarding:', e);
      alert('Não foi possível salvar as configurações no servidor. O assistente permanecerá aberto para evitar perda de dados.');
      return;
    }

    localStorage.removeItem('onboarding_completed');
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
    { nome: 'Azul ChamaAí', hex: '#3525CD' },
    { nome: 'Azul Escuro', hex: '#00687A' },
    { nome: 'Verde Sucesso', hex: '#059669' },
    { nome: 'Vermelho Urgente', hex: '#dc2626' },
    { nome: 'Amarelo Alerta', hex: '#d97706' },
    { nome: 'Roxo Premium', hex: '#7e3000' },
  ];

  return (
    <div className="fixed inset-0 bg-background z-toast flex items-center justify-center font-sans overflow-y-auto p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-surface border border-outline-variant rounded-md shadow-lg overflow-hidden flex flex-col md:flex-row min-h-[550px]">
        
        {/* Painel Esquerdo - Indicador de Passos */}
        <div className="w-full md:w-1/3 bg-surface-container-low p-6 border-b md:border-b-0 md:border-r border-outline-variant flex flex-col">
          <div className="mb-8">
            <h1 className="text-xl font-bold text-primary font-display mb-1">ChamaAí</h1>
            <p className="text-ink-variant text-xs font-semibold uppercase tracking-wider">Bem-vindo(a) ao seu novo sistema</p>
          </div>

          <div className="flex-1 flex flex-col gap-6">
            <div className={`flex items-center gap-3 transition-opacity ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-inner ${step >= 1 ? 'bg-primary text-white' : 'bg-outline-variant text-ink-variant'}`}>
                {step > 1 ? <Check className="h-4 w-4" strokeWidth={3} /> : '1'}
              </div>
              <div>
                <h3 className="font-semibold text-ink text-sm">O Negócio</h3>
                <p className="text-[10px] text-ink-variant font-bold uppercase tracking-wider mt-0.5">Dados da Empresa</p>
              </div>
            </div>

            <div className={`flex items-center gap-3 transition-opacity ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-inner ${step >= 2 ? 'bg-primary text-white' : 'bg-outline-variant text-ink-variant'}`}>
                {step > 2 ? <Check className="h-4 w-4" strokeWidth={3} /> : '2'}
              </div>
              <div>
                <h3 className="font-semibold text-ink text-sm">Personalização</h3>
                <p className="text-[10px] text-ink-variant font-bold uppercase tracking-wider mt-0.5">Sua Marca</p>
              </div>
            </div>

            <div className={`flex items-center gap-3 transition-opacity ${step === 3 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-inner ${step === 3 ? 'bg-primary text-white' : 'bg-outline-variant text-ink-variant'}`}>
                3
              </div>
              <div>
                <h3 className="font-semibold text-ink text-sm">Tudo Pronto!</h3>
                <p className="text-[10px] text-ink-variant font-bold uppercase tracking-wider mt-0.5">Próximos Passos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Painel Direito - Conteúdo do Passo */}
        <div className="w-full md:w-2/3 p-6 md:p-8 flex flex-col justify-between">
          
          {/* STEP 1: Dados do Negócio */}
          {step === 1 && (
            <div className="flex-1 flex flex-col justify-between animate-fade-in">
              <div className="space-y-6">
                <div>
                  <div className="w-10 h-10 bg-primary/10 rounded-sm flex items-center justify-center text-primary mb-3">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold text-ink">Configure seu Estabelecimento</h2>
                  <p className="text-xs text-ink-variant mt-1">Preencha os dados básicos para que o sistema funcione com a cara do seu negócio.</p>
                </div>

                <div className="space-y-4">
                  <Input 
                    type="text" 
                    label="Nome do Estabelecimento *"
                    value={formData.nome_estabelecimento}
                    onChange={(e) => updateForm('nome_estabelecimento', e.target.value)}
                    placeholder="Ex: Supermercado Todo Dia"
                  />
                  
                  <Input 
                    type="text" 
                    label="CNPJ (Opcional)"
                    value={formData.cnpj}
                    onChange={(e) => updateForm('cnpj', e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-ink">Categoria do Negócio</label>
                    <select 
                      value={formData.categoria}
                      onChange={(e) => updateForm('categoria', e.target.value)}
                      className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-sp-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="" disabled>Selecione uma categoria...</option>
                      {categorias.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button 
                  onClick={handleNext}
                  disabled={!formData.nome_estabelecimento.trim()}
                  icon={<ChevronRight className="h-4 w-4" />}
                >
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Personalização */}
          {step === 2 && (
            <div className="flex-1 flex flex-col justify-between animate-fade-in">
              <div className="space-y-6">
                <div>
                  <div className="w-10 h-10 bg-primary/10 rounded-sm flex items-center justify-center text-primary mb-3">
                    <Palette className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold text-ink">Personalize Sua Interface</h2>
                  <p className="text-xs text-ink-variant mt-1">Escolha a cor principal que os seus clientes e operadores verão no telão e no painel.</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase mb-2">Selecione uma Cor Primária</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {coresSugeridas.map(cor => (
                        <button
                          key={cor.hex}
                          type="button"
                          onClick={() => updateForm('cor_primaria', cor.hex)}
                          className={`flex flex-col items-center gap-2 p-3 rounded-md border transition-all ${formData.cor_primaria === cor.hex ? 'border-primary bg-primary/5' : 'border-outline-variant hover:bg-surface-container'}`}
                        >
                          <div className="w-6 h-6 rounded-full shadow-inner border border-outline-variant/30" style={{ backgroundColor: cor.hex }}></div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink text-center">{cor.nome}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase mb-2">Ou digite uma cor específica (HEX)</label>
                    <div className="flex gap-3">
                      <div className="w-11 h-11 rounded-sm shadow-inner border border-outline-variant shrink-0" style={{ backgroundColor: formData.cor_primaria }}></div>
                      <input 
                        type="text" 
                        value={formData.cor_primaria}
                        onChange={(e) => updateForm('cor_primaria', e.target.value)}
                        placeholder="#000000"
                        className="w-full max-w-[150px] h-11 rounded-sm border border-outline-variant bg-surface text-ink px-3 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center">
                <Button 
                  variant="ghost"
                  onClick={() => setStep(1)}
                >
                  Voltar
                </Button>
                <Button 
                  onClick={handleNext}
                  icon={<ChevronRight className="h-4 w-4" />}
                >
                  Próximo Passo
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Checklist */}
          {step === 3 && (
            <div className="flex-1 flex flex-col justify-between animate-fade-in">
              <div className="space-y-6">
                <div>
                  <div className="w-10 h-10 bg-success/10 rounded-sm flex items-center justify-center text-success mb-3">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold text-ink">Tudo Configurado!</h2>
                  <p className="text-xs text-ink-variant mt-1">O seu sistema básico já está salvo. Para tirar o máximo proveito do ChamaAí, sugerimos os próximos passos abaixo.</p>
                </div>

                <div className="space-y-3">
                  <div className="bg-surface-container-low border border-outline-variant p-4 rounded-md flex gap-3 items-start">
                    <div className="bg-primary/10 p-1.5 rounded-sm text-primary shrink-0 mt-0.5">
                      <MonitorPlay className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-ink text-xs uppercase tracking-wide">1. Conecte o Telão</h4>
                      <p className="text-[11px] text-ink-variant leading-relaxed mt-0.5">Abra o menu principal do sistema em uma Smart TV ou Monitor e clique em "Telão" para começar a exibir as senhas e mídias.</p>
                    </div>
                  </div>

                  <div className="bg-surface-container-low border border-outline-variant p-4 rounded-md flex gap-3 items-start">
                    <div className="bg-primary/10 p-1.5 rounded-sm text-primary shrink-0 mt-0.5">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-ink text-xs uppercase tracking-wide">2. Cadastre Operadores</h4>
                      <p className="text-[11px] text-ink-variant leading-relaxed mt-0.5">No painel Admin, vá até "Operadores" para criar usuários para a sua equipe, assim eles poderão chamar as senhas nos guichês.</p>
                    </div>
                  </div>

                  <div className="bg-surface-container-low border border-outline-variant p-4 rounded-md flex gap-3 items-start">
                    <div className="bg-primary/10 p-1.5 rounded-sm text-primary shrink-0 mt-0.5">
                      <Target className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-ink text-xs uppercase tracking-wide">3. Personalize os Balcões</h4>
                      <p className="text-[11px] text-ink-variant leading-relaxed mt-0.5">Acesse "Configurações" e "Gestão de Filas" para definir os nomes corretos dos seus balcões (ex: Caixa 01, Triagem, Retirada).</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center pt-4 border-t border-outline-variant/30">
                <Button 
                  variant="ghost"
                  onClick={() => setStep(2)}
                >
                  Revisar
                </Button>
                <Button 
                  variant="primary"
                  onClick={handleFinish}
                  icon={<ArrowRight className="h-4 w-4" />}
                >
                  Acessar Meu Painel Admin
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
