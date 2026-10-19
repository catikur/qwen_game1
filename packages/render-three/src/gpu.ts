/** Yazılımsal rasterleştirici: SwiftShader, llvmpipe, Windows'un temel sürücüsü. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i;

/** `rendererName`'in okuduğu kadarı: testler gerçek bir WebGL bağlamı olmadan çağırıyor. */
export type RendererQuery = Pick<WebGLRenderingContext, 'RENDERER' | 'getParameter' | 'getExtension'>;

/**
 * GPU'nun adı (Tur 42). Chrome `RENDERER`'ı "WebKit WebGL", eski Firefox
 * "Mozilla" diye gizliyor; gerçek adı hata ayıklama uzantısı veriyor
 * (Codex #71). Yeni Firefox gerçek adı zaten `RENDERER`'da veriyor ve uzantı
 * istenince uyarı yazıyor: uzantı yalnız ad gizliyse isteniyor.
 */
export function rendererName(gl: RendererQuery): string {
  const plain = String(gl.getParameter(gl.RENDERER));
  if (!/^(webkit webgl|mozilla)$/i.test(plain)) return plain;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : plain;
}

/** Yazılımsal GPU mu: açılış en ucuz kademeden başlıyor. */
export function isSoftwareRenderer(gl: RendererQuery): boolean {
  return SOFTWARE_RENDERER.test(rendererName(gl));
}
