import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isSoftwareRenderer, type RendererQuery } from '../src/gpu';

/**
 * Yazılımsal GPU'yu tanıma (Tur 42). Gerçek bağlam yok: `RENDERER` ve hata
 * ayıklama uzantısının verdiği adlar taklit ediliyor.
 */
const RENDERER = 0x1f01;
const UNMASKED_RENDERER_WEBGL = 0x9246;

function context(plain: string, unmasked?: string): RendererQuery {
  return {
    RENDERER,
    getParameter: (name: number) => (name === RENDERER ? plain : name === UNMASKED_RENDERER_WEBGL ? unmasked : null),
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' && unmasked !== undefined ? { UNMASKED_RENDERER_WEBGL } : null,
  } as unknown as RendererQuery;
}

describe('gpu: yazılımsal GPU', () => {
  test('adı açık olan sürücüler', () => {
    assert.equal(isSoftwareRenderer(context('llvmpipe (LLVM 15.0.7, 256 bits)')), true);
    assert.equal(isSoftwareRenderer(context('Microsoft Basic Render Driver')), true);
    assert.equal(isSoftwareRenderer(context('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')), false);
  });

  test("Chrome'un gizlediği ad uzantıdan okunuyor", () => {
    assert.equal(isSoftwareRenderer(context('WebKit WebGL', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')), true);
    assert.equal(isSoftwareRenderer(context('WebKit WebGL', 'Apple M2')), false);
    assert.equal(isSoftwareRenderer(context('WebKit WebGL')), false, 'uzantı yoksa donanım sayılıyor');
  });

  test("Firefox'un gizlediği ad da uzantıdan okunuyor (Codex #71)", () => {
    assert.equal(isSoftwareRenderer(context('Mozilla', 'llvmpipe, or similar')), true);
    assert.equal(isSoftwareRenderer(context('Mozilla', 'Mesa Intel(R) UHD Graphics 620')), false);
  });
});
