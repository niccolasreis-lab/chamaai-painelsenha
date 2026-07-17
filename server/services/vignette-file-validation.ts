import path from 'path';

export const MAX_VIGNETTE_FILE_SIZE = 50 * 1024 * 1024;

const MP3_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/x-mpeg',
  'audio/x-mp3',
]);

export function hasMp3Signature(buffer: Uint8Array): boolean {
  if (buffer.length < 3) return false;
  const hasId3Header = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
  const hasMpegFrame = buffer.length >= 2
    && buffer[0] === 0xff
    && (buffer[1] & 0xe0) === 0xe0
    && (buffer[1] & 0x18) !== 0x08
    && (buffer[1] & 0x06) !== 0;
  return hasId3Header || hasMpegFrame;
}

export function validateMp3Metadata(file: Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size'>): string | null {
  if (path.extname(file.originalname).toLowerCase() !== '.mp3') {
    return 'Somente arquivos com extensão .mp3 são aceitos.';
  }
  if (!MP3_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return 'O tipo do arquivo deve ser MP3 (audio/mpeg).';
  }
  if (file.size <= 0) {
    return 'O arquivo MP3 está vazio.';
  }
  if (file.size > MAX_VIGNETTE_FILE_SIZE) {
    return 'Cada arquivo MP3 pode ter no máximo 50 MB.';
  }
  return null;
}

export function validateMp3File(file: Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size' | 'buffer'>): string | null {
  return validateMp3Metadata(file)
    || (hasMp3Signature(file.buffer) ? null : 'A assinatura binária do arquivo não corresponde a um MP3 válido.');
}
