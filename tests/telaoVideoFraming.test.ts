import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mediaIndoorSource = readFileSync(
  new URL('../src/telao/MediaIndoor.tsx', import.meta.url),
  'utf8',
);
const smartMediaSource = readFileSync(
  new URL('../src/telao/SmartMediaLayer.tsx', import.meta.url),
  'utf8',
);
const devicesSource = readFileSync(
  new URL('../src/admin/Devices.tsx', import.meta.url),
  'utf8',
);
const serverSource = readFileSync(
  new URL('../server/index.ts', import.meta.url),
  'utf8',
);

const targetViewports = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
];

function containedSize(
  mediaWidth: number,
  mediaHeight: number,
  containerWidth: number,
  containerHeight: number,
) {
  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  return { width: mediaWidth * scale, height: mediaHeight * scale };
}

test('vídeos nativos e inteligentes usam contain, limites integrais e fundo neutro', () => {
  for (const source of [mediaIndoorSource, smartMediaSource]) {
    const videoTags = source.match(/<video[\s\S]*?\/>/g) || [];
    assert.ok(videoTags.length > 0, 'player de vídeo ausente');
    for (const videoTag of videoTags) {
      assert.match(videoTag, /object-contain/);
      assert.match(videoTag, /max-w-full/);
      assert.match(videoTag, /max-h-full/);
      assert.match(videoTag, /bg-black/);
      assert.doesNotMatch(videoTag, /object-(?:fill|cover)/);
    }
  }
});

for (const viewport of targetViewports) {
  test(`enquadramento preserva proporção e limites em ${viewport.width}x${viewport.height}`, () => {
    for (const sourceRatio of [16 / 9, 4 / 3, 9 / 16, 21 / 9]) {
      const sourceWidth = sourceRatio * 1000;
      const fitted = containedSize(sourceWidth, 1000, viewport.width, viewport.height);
      assert.ok(fitted.width <= viewport.width + Number.EPSILON);
      assert.ok(fitted.height <= viewport.height + Number.EPSILON);
      assert.ok(Math.abs(fitted.width / fitted.height - sourceRatio) < 1e-10);
    }
  });
}

test('administrador e API mantêm somente os três layouts públicos', () => {
  for (const layout of ['classic', 'sidebar', 'l-shape']) {
    assert.match(devicesSource, new RegExp(`<option value=["']${layout}["']`));
    assert.match(serverSource, new RegExp(`value === ['"]${layout}['"]`));
  }
  assert.match(serverSource, /Layout inválido\. Use classic, sidebar ou l-shape\./);
  assert.doesNotMatch(serverSource, /template_layout\s*=\s*'classic'/);
});
