import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/telao/MediaIndoor.tsx', import.meta.url),
  'utf8',
);

const supportedLayouts = ['classic', 'sidebar', 'l-shape'] as const;

function openingTag(testId: string): string {
  const marker = `data-testid="${testId}"`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `marcador estrutural ausente: ${marker}`);

  const start = source.lastIndexOf('<div', markerIndex);
  const end = source.indexOf('>', markerIndex);
  assert.ok(start >= 0 && end > markerIndex, `tag inválida para ${marker}`);
  return source.slice(start, end + 1);
}

test('seleção de layout usa o perfil vinculado e mantém fallback classic', () => {
  const selectionRegion = source.slice(
    Math.max(0, source.indexOf('const layout') - 800),
    source.indexOf('const layout') + 1_200,
  );

  assert.match(selectionRegion, /perfil\.template_layout/);
  for (const layout of supportedLayouts) {
    assert.match(selectionRegion, new RegExp(`['"]${layout}['"]`));
  }
  assert.doesNotMatch(selectionRegion, /const layout:\s*string\s*=\s*['"]classic['"]/);
});

test('viewport do telão fica limitado nos dois eixos no navegador e no APK', () => {
  const root = openingTag('telao-layout-root');

  assert.match(root, /(?:100dvh|h-dvh)/);
  assert.match(root, /(?:100dvw|w-dvw)/);
  assert.match(root, /overflow-hidden/);
  assert.match(root, /min-h-0/);
  assert.match(root, /min-w-0/);
});

for (const layout of supportedLayouts) {
  test(`layout ${layout} não depende de dimensão rígida nem permite clipping`, () => {
    const shell = openingTag(`layout-${layout}`);

    assert.match(shell, /w-full/);
    assert.match(shell, /h-full/);
    assert.match(shell, /min-w-0/);
    assert.match(shell, /min-h-0/);
    assert.match(shell, /overflow-hidden/);
    assert.doesNotMatch(shell, /(?:^|\s)(?:w|h)-\[(?:\d+(?:\.\d+)?)(?:px|rem)\](?:\s|$)/);
  });
}

test('elementos de destaque abandonam escalas fixas críticas em favor de clamp', () => {
  assert.match(source, /clamp\([^)]*(?:vw|dvw)[^)]*(?:vh|dvh)[^)]*\)/);
  assert.doesNotMatch(source, /text-\[(?:4\.5|5\.5)rem\]/);
  assert.doesNotMatch(source, /className="h-32\b/);
});
