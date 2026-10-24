/**
 * Oyuncunun şehirdeki rengi: çatı kapağı ve tabela, kamyon ve müşteri
 * araçları, devralmada çatıların döndüğü renk. Sahne ve arayüz aynı rengi
 * buradan okuyor (Tur 63): devralma bandı çatıların döndüğü rengi
 * gösteriyor, şirketin kurulumda seçtiği rengi değil (Codex #93).
 *
 * Renk körlüğüne uygun palette (Tur 47) limon: nane yeşili on altı rakip
 * rengine karşı döteranopide OKLab ΔE 7,6'ya, sahiplik lensinde (×0,7)
 * normal görüşte bile 7,5'e iniyordu (Atlas'ın camgöbeği). Limon en kötü
 * renk körlüğünde 17,1; lenste parlak kaldığı için (×0,9) 28,3.
 */
export const PLAYER_ACCENT = { standard: '#3fd39a', safe: '#fff36b' } as const;
