export const TELAO_TTS_MODE_MIGRATION_SQL = `
  INSERT OR IGNORE INTO configuracoes (chave, valor, atualizado_em)
    SELECT
      'telao_tts_modo',
      CASE
        WHEN (SELECT valor FROM configuracoes WHERE chave = 'telao_tts_ativo') = '1'
          THEN 'sintetizador'
        ELSE 'desativado'
      END,
      datetime('now');
`;
