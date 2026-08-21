import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentPath = new URL('../src/telao/SenhaChamada.tsx', import.meta.url);
const componentSource = readFileSync(componentPath, 'utf8');

function highlightedTicketMarkup(): string {
  const match = componentSource.match(
    /<div[\s\S]*?data-testid=["']called-ticket-number["'][\s\S]*?>[\s\S]*?\{senhaFormatada\}[\s\S]*?<\/div>/,
  );

  assert.ok(
    match,
    'a senha destacada deve manter data-testid="called-ticket-number" para auditoria visual',
  );
  return match[0];
}

test('senha destacada não volta a usar tamanhos fixos que extrapolam TVs e navegadores', () => {
  const markup = highlightedTicketMarkup();

  assert.doesNotMatch(markup, /text-\[(?:30|32)rem\]/);
  assert.doesNotMatch(markup, /(?:^|\s)scale-105(?:\s|$)/);
});

test('tipografia da senha destacada respeita simultaneamente largura e altura da viewport', () => {
  const markup = highlightedTicketMarkup();

  assert.match(markup, /clamp\([^)]*(?:vw|dvw)[^)]*(?:vh|dvh)[^)]*\)/);
  assert.match(markup, /max-w-full/);
  assert.match(markup, /whitespace-nowrap/);
});

test('contêiner da chamada impede overflow nos dois eixos', () => {
  const highlightedTicketIndex = componentSource.indexOf('data-testid="called-ticket-number"');
  assert.notEqual(highlightedTicketIndex, -1);

  const surroundingMarkup = componentSource.slice(
    Math.max(0, highlightedTicketIndex - 3_500),
    highlightedTicketIndex,
  );

  assert.match(surroundingMarkup, /overflow-hidden/);
  assert.match(surroundingMarkup, /(?:min-h-0|max-h-full)/);
});
