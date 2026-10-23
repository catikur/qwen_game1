import { localizeList } from './localize';

/**
 * Şirketin yolu (Tur 61): zafere hangi iş kolundan gidildiği.
 *
 * Faz 3 üç yeni iş kolu getirdi (nakliye, enerji, gayrimenkul) ve
 * Rakipler 2.0'la birlikte borsadan büyümeyi de keskinleştirdi. Yol,
 * şirketin kârının nereden geldiğiyle ölçülüyor: oyuncunun binalarının
 * günlük kârı, kaynağına göre koşu boyunca toplanıyor (`state.sources`).
 * Perakende ve zincir herkesin omurgası; yolu ayıran, omurganın yanında
 * neyin büyüdüğü.
 *
 *   - `source` + `share`: kaynağın toplam kârdaki payı bu eşiği geçerse.
 *   - `acquisitions`: bu kadar rakibi devralan şirket borsadan büyümüş.
 *
 * Birden çok yolun eşiği geçerse listedeki sırayla ilki: devralma,
 * gayrimenkul, enerji, nakliye (büyük iş kolu önce). Hiçbiri geçmezse
 * perakende. Eşikler "Yollar" denge bölümünün ölçümünden (Dengeli, beş
 * şehir; DURUM Tur 61): temel vekilde kira en çok %3, enerji ve nakliye
 * yok; her yolun vekili kendi eşiğini her şehirde geçiyor (kira %21–27,
 * enerji %8–12, nakliye ücreti %4–5, 2–3 devralma).
 *
 * Enerji ve nakliyenin eşikleri düşük, çünkü ikisi omurganın yanında bir
 * iş kolu: santral şehrin enerji faturasını, terminal rakibin taşıma
 * maliyetini satıyor, ikisi de perakendenin bir payı. Ölçümde en keskin
 * vekilleri bile kârın sekizde birini geçmiyor; DURUM Tur 61'de "açık kalan".
 */
export type PathId = 'retail' | 'takeover' | 'realestate' | 'energy' | 'freight';

/** Kârın kaynakları: perakende (mağaza, zincir, depo, Ar-Ge, pazarlama), kira, enerji, nakliye. */
export type PathSource = 'retail' | 'realestate' | 'energy' | 'freight';

export interface PathDef {
  id: PathId;
  name: string;
  blurb: string;
  /** Payı ölçülen kaynak. */
  source?: PathSource;
  /** Kaynağın toplam kârdaki payının eşiği (0..1). */
  share?: number;
  /** Devralınan rakip sayısının eşiği. */
  acquisitions?: number;
}

export const PATH_SOURCES: PathSource[] = ['retail', 'realestate', 'energy', 'freight'];

export const PATHS: PathDef[] = [
  {
    id: 'retail',
    name: 'Perakende ve zincir',
    blurb: 'Mağazalar ve onları besleyen üretim zinciri.',
  },
  {
    id: 'takeover',
    name: 'Devralma',
    blurb: 'Rakipleri borsadan satın alarak büyüdün.',
    acquisitions: 2,
  },
  {
    id: 'realestate',
    name: 'Gayrimenkul',
    blurb: 'Kiralık projeler kârın önemli bir payını getirdi.',
    source: 'realestate',
    share: 0.15,
  },
  {
    id: 'energy',
    name: 'Enerji',
    blurb: 'Santrallerin şehrin enerjisini sattı.',
    source: 'energy',
    share: 0.06,
  },
  {
    id: 'freight',
    name: 'Nakliye',
    blurb: 'Terminallerin rakiplerin mağazalarını taşıdı.',
    source: 'freight',
    share: 0.02,
  },
];

export const PATH_BY_ID: Record<PathId, PathDef> = Object.fromEntries(PATHS.map((path) => [path.id, path])) as Record<PathId, PathDef>;

localizeList(PATHS, 'path', ['name', 'blurb']);
