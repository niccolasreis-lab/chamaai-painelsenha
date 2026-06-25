export type RecentCall = {
  id: string | number;
  numero: string | number;
  guiche: string;
  balcao_nome?: string | null;
  chamada_em?: string | null;
  preferencial?: number;
  prefixo_senha?: string | null;
  nome_cliente?: string | null;
  repeticao?: boolean;
};

export type ProdutoToledo = {
  id?: string | number;
  plu?: string | number;
  codigo?: string | number;
  descricao: string;
  nome?: string;
  preco: number;
  categoria?: string | null;
  unidade?: string | null;
};

export type Categoria = {
  id: string | number;
  nome: string;
  emoji?: string | null;
  slug?: string | null;
  ativo?: number | boolean;
  ordem: number;
  descricao?: string | null;
};

export type TemaEncarte = {
  id?: string | number;
  nome?: string;
  imagem_fundo?: string | null;
  [key: string]: unknown;
};

export type PerfilTelao = {
  id?: string | number;
  nome?: string;
  status?: string;
  modulo_painel?: boolean | number;
  modulo_encarte?: boolean | number;
  modulo_midia?: boolean | number;
  encarte_categorias?: string | null;
  template_layout?: string | null;
};

export type MediaItem = {
  id: string | number;
  nome: string;
  tipo: 'imagem' | 'video' | 'weather' | 'youtube' | 'tabela' | 'encarte';
  caminho?: string;
  local_path?: string;
  ativo?: number;
  status?: string;
  duration_seconds?: number;
  source_url?: string;
  title?: string;
  is_active?: boolean | number;
};

export type EstablishmentConfig = {
  id?: string | number;
  tipo_som?: string | null;
  som_personalizado?: string | null;
  toledo_encarte_posicao?: string | number | null;
  logo_cliente?: string | null;
  nome_estabelecimento?: string | null;
  mostrar_rodape?: string | null;
  texto_rodape?: string | null;
  toledo_encarte_estilo?: string | null;
  toledo_encarte_duracao?: string | number | null;
  toledo_itens_por_slide?: string | number | null;
  telao_ticker_texto?: string | null;
  telao_ocultar_guiche?: string | null;
  rotulo_local?: string | null;
  toledo_encarte_colunas?: string | number | null;
  toledo_encarte_tema?: string | null;
  toledo_tema?: string | null;
  toledo_fonte_descricao?: string | null;
  toledo_fonte_preco?: string | null;
  toledo_ocultar_em_falta?: string | boolean | null;
  telao_tts_ativo?: string | null;
  telao_tts_template?: string | null;
  telao_tts_template_nome?: string | null;
  telao_tts_tom?: string | null;
  telao_tts_velocidade?: string | null;
  telao_tts_voz?: string | null;
  volume_audio?: number | null;
  portal_som_sua_vez?: string | null;
  rotulo_atendimento_geral?: string | null;
};

export type SmartMediaSettings = {
  midia_indoor_ativa?: boolean;
  midia_indoor_layout?: 'lateral' | 'rodape' | 'background' | 'full';
};
