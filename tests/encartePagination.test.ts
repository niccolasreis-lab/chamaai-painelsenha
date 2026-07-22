import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGridItemCapacity,
  calculateRowsPerColumn,
  paginateGroupedProducts,
} from '../src/telao/encartePagination';

type Product = { plu: string; descricao: string; preco: number };

function products(prefix: string, count: number): Product[] {
  return Array.from({ length: count }, (_, index) => ({
    plu: `${prefix}-${index}`,
    descricao: index === 0 ? 'PRODUTO COM DESCRIÇÃO MUITO LONGA PARA OCUPAR DUAS LINHAS' : `Produto ${index}`,
    preco: index % 5 === 0 ? 0 : 1000 + index,
  }));
}

test('pagina todos os PLUs exatamente uma vez, preservando categorias e ofertas', () => {
  const groups = [
    { nome: 'OFERTAS', isOferta: true, produtos: products('O', 7) },
    { nome: 'Frios', produtos: products('F', 13) },
    { nome: 'Grãos', produtos: products('G', 5) },
  ];
  const slides = paginateGroupedProducts(groups, {
    columns: 3,
    rowsPerColumn: calculateRowsPerColumn(720, 'precos'),
    maxItemsPerSlide: 12,
  });
  const rendered = slides.flat(2).flatMap(group => group.produtos.map(product => product.plu));
  const expected = groups.flatMap(group => group.produtos.map(product => product.plu));

  assert.deepEqual(rendered.sort(), expected.sort());
  assert.equal(new Set(rendered).size, rendered.length);
  for (const slide of slides) {
    assert.ok(slide.flatMap(column => column.flatMap(group => group.produtos)).length <= 12);
  }
});

test('limita 4–96 itens pela capacidade visual em 720p, 1080p e 4K', () => {
  for (const height of [720, 1080, 2160]) {
    for (const columns of [1, 2, 3, 4]) {
      for (const configured of [4, 12, 96]) {
        const capacity = calculateGridItemCapacity({
          containerHeight: height,
          columns,
          maxItemsPerSlide: configured,
        });
        assert.ok(capacity >= 1);
        assert.ok(capacity <= configured);
        assert.ok(capacity <= columns * calculateRowsPerColumn(height, 'granel'));
      }
    }
  }
});
