export type EncarteGroup<T> = {
  nome: string;
  isOferta?: boolean;
  produtos: T[];
};

export type EncarteColumn<T> = Array<EncarteGroup<T>>;
export type EncarteSlide<T> = Array<EncarteColumn<T>>;

export function normalizeColumnCount(value: unknown, fallback = 3): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return Math.min(4, Math.max(1, fallback));
  return Math.min(4, Math.max(1, parsed));
}

export function normalizeItemLimit(value: unknown, fallback = 12): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return Math.min(96, Math.max(1, fallback));
  return Math.min(96, Math.max(1, parsed));
}

/**
 * Returns a conservative number of product rows that fit in each column.
 * The height is the component's actual rendered height, so this also works
 * when the encarte is embedded in the classic and L-shaped TV layouts.
 */
export function calculateRowsPerColumn(
  containerHeight: number,
  variant: 'precos' | 'granel',
): number {
  const safeHeight = Number.isFinite(containerHeight) && containerHeight > 0
    ? containerHeight
    : 720;
  const chromeHeight = variant === 'precos' ? 178 : 154;
  const rowHeight = variant === 'precos' ? 76 : 86;
  return Math.max(1, Math.floor((safeHeight - chromeHeight) / rowHeight));
}

/**
 * Paginates category groups into explicit columns. A category header consumes
 * one row in every column segment, preventing CSS multi-column balancing from
 * silently clipping a complete group below the viewport.
 */
export function paginateGroupedProducts<T>(
  groups: Array<EncarteGroup<T>>,
  options: {
    columns: number;
    rowsPerColumn: number;
    maxItemsPerSlide: number;
  },
): Array<EncarteSlide<T>> {
  const columns = normalizeColumnCount(options.columns);
  const rowsPerColumn = Math.max(2, Math.floor(options.rowsPerColumn));
  const maxItemsPerSlide = normalizeItemLimit(options.maxItemsPerSlide);
  const queue = groups
    .filter(group => group.produtos.length > 0)
    .map(group => ({ ...group, produtos: [...group.produtos], cursor: 0 }));
  const slides: Array<EncarteSlide<T>> = [];
  let groupIndex = 0;

  while (groupIndex < queue.length) {
    const slide: EncarteSlide<T> = [];
    let slideItemCount = 0;

    for (let columnIndex = 0; columnIndex < columns && groupIndex < queue.length; columnIndex += 1) {
      const column: EncarteColumn<T> = [];
      let remainingRows = rowsPerColumn;

      while (remainingRows >= 2 && groupIndex < queue.length && slideItemCount < maxItemsPerSlide) {
        const source = queue[groupIndex];
        const remainingItems = source.produtos.length - source.cursor;
        const take = Math.min(
          remainingItems,
          remainingRows - 1,
          maxItemsPerSlide - slideItemCount,
        );

        if (take <= 0) break;
        column.push({
          nome: source.nome,
          isOferta: source.isOferta,
          produtos: source.produtos.slice(source.cursor, source.cursor + take),
        });
        source.cursor += take;
        slideItemCount += take;
        remainingRows -= take + 1;

        if (source.cursor >= source.produtos.length) groupIndex += 1;
      }

      if (column.length > 0) slide.push(column);
      if (slideItemCount >= maxItemsPerSlide) break;
    }

    if (slide.length === 0) {
      // Defensive progress guarantee for pathological inputs.
      const source = queue[groupIndex];
      slide.push([{
        nome: source.nome,
        isOferta: source.isOferta,
        produtos: [source.produtos[source.cursor]],
      }]);
      source.cursor += 1;
      if (source.cursor >= source.produtos.length) groupIndex += 1;
    }
    slides.push(slide);
  }

  return slides;
}

export function calculateGridItemCapacity(options: {
  containerHeight: number;
  columns: number;
  maxItemsPerSlide: number;
}): number {
  const rows = calculateRowsPerColumn(options.containerHeight, 'granel');
  return Math.max(1, Math.min(
    normalizeItemLimit(options.maxItemsPerSlide),
    normalizeColumnCount(options.columns, 4) * rows,
  ));
}
