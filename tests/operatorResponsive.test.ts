import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../src/operador/ControleTouch.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('operator surface always renders exactly three equal action cells', () => {
  assert.match(component, /CHAMAR PRÓXIMO/);
  assert.match(component, />REPETIR</);
  assert.match(component, />DEVOLVER</);
  assert.match(css, /grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.operator-action\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s);
});

test('operator layout has structural portrait and constrained-landscape rules', () => {
  assert.match(css, /@media \(orientation: portrait\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 620px\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
});

test('operator recovery polls every three seconds and reacts to foreground interaction', () => {
  assert.match(component, /HEALTH_INTERVAL_MS\s*=\s*3000/);
  assert.match(component, /HEALTH_TIMEOUT_MS\s*=\s*2200/);
  assert.match(component, /healthCheckRef\.current/);
  assert.match(component, /addEventListener\('pointerdown'/);
  assert.match(component, /addEventListener\('visibilitychange'/);
  assert.match(component, /addEventListener\('online'/);
  assert.match(component, /addEventListener\('focus'/);
  assert.match(component, /validateRecoveredAction/);
});
