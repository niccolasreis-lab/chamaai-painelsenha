export type TotemQueueConfig = {
  fila_normal_ativa?: unknown;
  fila_preferencial_ativa?: unknown;
  ocultar_tipo_senha?: unknown;
};

const isEnabled = (value: unknown): boolean => value === '1' || value === 1 || value === true;

export function getTotemQueueAvailability(config: TotemQueueConfig) {
  return {
    normal: isEnabled(config.fila_normal_ativa),
    preferential: isEnabled(config.fila_preferencial_ativa),
    singleButton: isEnabled(config.ocultar_tipo_senha),
  };
}
