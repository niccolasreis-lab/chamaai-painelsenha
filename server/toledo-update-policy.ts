export type ComparableToledoItem = {
  plu: string;
  preco: number;
  descricao: string;
  categoria: string;
  unidade?: string | null;
};

export function hasToledoItemChanged(
  existing: ComparableToledoItem,
  incoming: ComparableToledoItem,
): boolean {
  return existing.preco !== incoming.preco
    || existing.descricao !== incoming.descricao
    || existing.categoria !== incoming.categoria
    || (existing.unidade || 'kg') !== (incoming.unidade || 'kg');
}

export function shouldPublishToledoUpdate(updatedCount: number): boolean {
  return Number.isInteger(updatedCount) && updatedCount > 0;
}
