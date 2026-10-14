import * as THREE from 'three';

/**
 * Bina yüzeyi (Tur 24).
 *
 * Bütün kütleler hâlâ ölçeklenmiş birim kutular. Kutuyu kutu gibi
 * göstermeyen üç şey burada, gölgelendiricide:
 *
 *   1. CEPHE ATLASI — tek doku dört cephe türü taşıyor (konut, ofis camı,
 *      dükkân vitrini, sanayi paneli). Hangisinin kullanılacağı örnek
 *      başına bir öznitelikten (`aFacade`) okunuyor; yani dört ayrı
 *      malzeme ve dört kat çizim çağrısı yerine bir malzeme ve aynı tek
 *      çağrı. "Dükkân" türlerinde zemin kat vitrin, üst katlar konut ya da
 *      ofis: mahalle esnafının altı dükkân üstü ev binası.
 *   2. ZEMİNE YAKIN KARARTMA — yüzey yere yaklaştıkça koyulaşıyor. Gerçek
 *      ortam kapatmasının (AO) en görünür etkisi bu ve hiçbir ek geçiş
 *      gerektirmiyor; gölge haritası olmayan en ucuz kademede de çalışıyor.
 *   3. KENAR VURGUSU — düşey köşeler ve üst kenar ince bir açık bantla
 *      çiziliyor. Pahlı kenarın ucuz karşılığı: kütleler kesilmiş karton
 *      gibi değil, işlenmiş bir maket gibi okunuyor.
 *
 * Doku tekrarı önceki gibi örnek ÖLÇEĞİNE göre (kat yüksekliği her binada
 * aynı). Atlasın dörtte birine `fract` ile düşüldüğü için mip seviyesi
 * türevden seçiliyor (`textureGrad`); yoksa her tekrar sınırında ince bir
 * dikiş çizgisi çıkardı.
 */

/** Cephe türleri — `aFacade` özniteliğinin değerleri. */
export const FACADE = {
  /** Delikli pencereler, kat bantları. */
  residential: 0,
  /** Cam giydirme, ince dikmeler. */
  office: 1,
  /** Zemin kat vitrin, üstü konut. */
  shop: 2,
  /** Oluklu panel, yüksek şerit pencereler. */
  industrial: 3,
  /** Zemin kat vitrin, üstü ofis camı. */
  shopOffice: 4,
} as const;

export type FacadeStyle = (typeof FACADE)[keyof typeof FACADE];

export interface SurfaceOptions {
  /** Birim başına doku tekrarı (kat yoğunluğu). */
  tilesPerUnit: number;
  /** Doku atlas mı (gövde) yoksa düz mü (taban, çatı). */
  atlas: boolean;
  /** Yüzeyin en alt kotu — karartma buradan başlıyor. */
  groundY: number;
}

/** Vitrin bandı: dükkân türlerinde ilk tekrarın alt bu kadarı. */
const STOREFRONT_BAND = 0.42;

/**
 * Bir bina malzemesine yüzey gölgelendiricisini takar. Aynı seçeneklerle
 * kurulan malzemeler aynı programı paylaşıyor.
 */
export function buildingSurface(material: THREE.Material, options: SurfaceOptions): void {
  const { tilesPerUnit, atlas, groundY } = options;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTilesPerUnit'] = { value: tilesPerUnit };
    shader.uniforms['uGroundY'] = { value: groundY };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTilesPerUnit;
         attribute float aFacade;
         varying float vCfFacade;
         varying float vCfWorldY;
         varying float vCfVertical;
         varying vec2 vCfUv;
         varying vec3 vCfScale;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vCfUv = uv;
         vCfFacade = aFacade;
         vCfVertical = 1.0 - step(0.5, abs(normal.y));
         #ifdef USE_INSTANCING
           vCfScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
           vec2 instanceTiling = vCfScale.xy * uTilesPerUnit;
           #ifdef USE_MAP
             vMapUv = vMapUv * instanceTiling;
           #endif
           #ifdef USE_EMISSIVEMAP
             vEmissiveMapUv = vEmissiveMapUv * instanceTiling;
           #endif
         #else
           vCfScale = vec3(1.0);
         #endif`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         #ifdef USE_INSTANCING
           vCfWorldY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
         #else
           vCfWorldY = (modelMatrix * vec4(transformed, 1.0)).y;
         #endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uGroundY;
         varying float vCfFacade;
         varying float vCfWorldY;
         varying float vCfVertical;
         varying vec2 vCfUv;
         varying vec3 vCfScale;

         // Atlas çeyrekleri: sol alt konut, sağ alt ofis, sol üst vitrin, sağ üst sanayi.
         // Dallanmasız: tür numarasından çeyrek koordinatı aritmetikle.
         //   0 konut (0,0) · 1 ofis (.5,0) · 2 dükkân: bantta vitrin, üstü konut
         //   3 sanayi (.5,.5) · 4 dükkân-ofis: bantta vitrin, üstü ofis
         vec2 cfQuadrant(float style, float v) {
           float s = floor(style + 0.5);
           float band = step(v, ${STOREFRONT_BAND.toFixed(2)});
           float shop = step(1.5, s) * (1.0 - step(2.5, s)) + step(3.5, s);
           float officeUpper = step(0.5, s) * (1.0 - step(1.5, s)) + step(3.5, s);
           float industrial = step(2.5, s) * (1.0 - step(3.5, s));
           vec2 upper = vec2(0.5 * max(officeUpper, industrial), 0.5 * industrial);
           return mix(upper, vec2(0.0, 0.5), shop * band);
         }

         // Çeyrek kenarından bir buçuk texel içeride: komşu çeyreğin rengi
         // süzgeçle sızmasın.
         vec4 cfAtlas(sampler2D tex, vec2 tiled) {
           const float pad = 1.5 / 256.0;
           vec2 cell = fract(tiled);
           vec2 atlasUv = cfQuadrant(vCfFacade, tiled.y) + pad + cell * (0.5 - 2.0 * pad);
           return textureGrad(tex, atlasUv, dFdx(tiled) * 0.5, dFdy(tiled) * 0.5);
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 cfTexel = vec4(1.0);
         ${
          atlas
            ? `#ifdef USE_MAP
                 cfTexel = cfAtlas(map, vMapUv);
                 diffuseColor *= cfTexel;
               #endif`
            : '#include <map_fragment>'
        }
         // Zemine yakın karartma: yerden ilk ~0,55 birimde koyulaşma (Tur 33'te
         // yumuşadı: Kenney tarzı aydınlık cephede 0,6 kirli bir etek bırakıyordu).
         float cfShade = mix(0.76, 1.0, smoothstep(uGroundY, uGroundY + 0.55, vCfWorldY));
         // Kenar vurgusu: düşey yüzde köşeler ve üst kenar, yatay yüzde dört kenar.
         vec2 cfEdgeUv = min(vCfUv, 1.0 - vCfUv);
         float cfEdgeDist = vCfVertical > 0.5
           ? min(cfEdgeUv.x * vCfScale.x, (1.0 - vCfUv.y) * vCfScale.y)
           : min(cfEdgeUv.x * vCfScale.x, cfEdgeUv.y * vCfScale.z);
         float cfEdge = 1.0 - smoothstep(0.004, 0.03, cfEdgeDist);
         float cfLight = cfShade * (1.0 + cfEdge * 0.2);
         diffuseColor.rgb *= cfLight;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Cam bina rengiyle çarpılmıyor (Tur 33): atlasın mavi ağırlıklı
         // pikseli kendi rengini koruyor — mor binada da sarı binada da aynı
         // açık mavi cam. Duvar ve çerçeve nötr; onlar örnek rengini alıyor.
         float cfGlass = clamp((cfTexel.b - cfTexel.r) * 5.0 - 0.4, 0.0, 1.0);
         diffuseColor.rgb = mix(diffuseColor.rgb, cfTexel.rgb * diffuse * cfLight, cfGlass);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        atlas
          ? `#ifdef USE_EMISSIVEMAP
               totalEmissiveRadiance *= cfAtlas(emissiveMap, vEmissiveMapUv).rgb;
             #endif`
          : '#include <emissivemap_fragment>',
      );
  };
  material.customProgramCacheKey = () => `surface-${tilesPerUnit}-${atlas ? 'atlas' : 'flat'}-${groundY}-glass`;
}
