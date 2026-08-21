const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];
export const MAX_MEDIA_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function validateMediaUpload(file: File, type: 'image' | 'video'): string | null {
  if (file.size <= 0) return 'O arquivo selecionado está vazio.';
  if (file.size > MAX_MEDIA_UPLOAD_BYTES) return 'O arquivo excede o limite de 2 GB.';

  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const allowed = type === 'video' ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
  const mimeMatches = file.type === '' || file.type.startsWith(`${type}/`);
  if (!allowed.includes(extension) || !mimeMatches) {
    return type === 'video'
      ? 'Selecione um vídeo MP4, WebM ou MOV válido.'
      : 'Selecione uma imagem JPG, PNG, GIF ou WebP válida.';
  }
  return null;
}

export async function readMediaApiError(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const payload = await response.json() as { error?: unknown; message?: unknown };
      const detail = payload.error || payload.message;
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
    } else {
      const detail = (await response.text()).trim();
      if (detail && !detail.startsWith('<!DOCTYPE') && !detail.startsWith('<html')) return detail;
    }
  } catch {
    // Resposta inválida: use a mensagem determinística com o status abaixo.
  }
  return `${fallback} (HTTP ${response.status}).`;
}
