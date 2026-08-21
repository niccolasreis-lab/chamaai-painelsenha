export type TelaoTtsMode = 'desativado' | 'sintetizador' | 'mp3';

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
  template_layout?: 'classic' | 'sidebar' | 'l-shape';
};

export type MediaItem = {
  id: string | number;
  nome: string;
  tipo: 'imagem' | 'video' | 'weather' | 'youtube' | 'tabela' | 'encarte';
  type?: 'imagem' | 'video' | 'weather' | 'youtube' | 'tabela' | 'encarte' | 'image' | 'video' | 'weather' | 'youtube' | 'tabela' | 'encarte' | string;
  caminho?: string;
  local_path?: string;
  ativo?: number;
  status?: string;
  duration_seconds?: number;
  source_url?: string;
  title?: string;
  is_active?: boolean | number;
};

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type VignetteFile = {
  id: number;
  folder_id: number;
  original_name: string;
  local_path: string;
  mime_type: 'audio/mpeg';
  size_bytes: number;
  created_at: string;
};

export type VignetteFolder = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  files: VignetteFile[];
};

export type VignetteSchedule = {
  id: number;
  name: string;
  folder_id: number;
  folder_name?: string;
  weekdays: IsoWeekday[];
  start_time: string;
  end_time: string;
  interval_minutes: number;
  is_active: boolean;
  last_triggered_slot?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type VignetteOccurrence = {
  occurrence_id: string;
  schedule_id: number;
  schedule_name: string;
  folder_id: number;
  folder_name: string;
  file_id: number;
  file_name: string;
  file_url: string;
  scheduled_for: string;
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
  telao_tts_modo?: TelaoTtsMode | null;
  telao_tts_template?: string | null;
  telao_tts_template_nome?: string | null;
  telao_tts_tom?: string | null;
  telao_tts_velocidade?: string | null;
  telao_tts_voz?: string | null;
  telao_tts_revision?: string | null;
  telao_cache_limite_mb?: string | number | null;
  volume_audio?: string | number | null;
  portal_som_sua_vez?: string | null;
  rotulo_atendimento_geral?: string | null;
};

export type SmartMediaSettings = {
  midia_indoor_ativa?: boolean;
  midia_indoor_layout?: 'lateral' | 'rodape' | 'background' | 'full';
};
