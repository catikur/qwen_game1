import { pushNews } from './news';
import { runMarketTick } from './systems/market';
import { runCrisisTick } from './systems/economy';
import { runEnergyTick } from './systems/energy';
import { runRealEstateTick } from './systems/realestate';
import { runRelationsTick } from './systems/relations';
import { runCardTick } from './systems/cards';
import { runRivalryTick } from './systems/rivalry';
import { runBubbleTick } from './systems/opportunities';
import { runLivingTick } from './systems/living';
import { runProjectTick } from './systems/projects';
import { runEntrantTick } from './systems/entrants';
import { runCouncilTick } from './systems/council';
import { runLaborTick } from './systems/labor';
import { runCreditTick } from './systems/credit';
import { runOrderTick } from './systems/orders';
import { resetDailyLedgers, runProductionTick, runProfitTrendTick, runSpotPriceTick } from './systems/supply';
import { runDistrictUnlockTick, runLandValueTick, runPopulationTick } from './systems/city';
import { runCityGrowthTick } from './systems/citygrowth';
import { collectEventModifiers, runEraTick, runEventTick } from './systems/events';
import { runContractTick } from './systems/contracts';
import { runFreightTick } from './systems/freight';
import { runAuctionTick } from './systems/auction';
import { runDividendTick, runTakeoverTick } from './systems/equity';
import { runResearchTick } from './systems/focus';
import { runNpcTick } from './systems/npc';
import { notePathSources } from './systems/paths';
import type { GameState } from './types';

/**
 * Bir şehrin bir günü (Tur 30).
 *
 * `GameEngine.runDay` bunu oynanan şehir için, holding de bekleyen şehirler
 * için çağırıyor. Eskiden (Tur 22) bekleyen şehir donuktu: takvimi, rakipleri
 * ve gelişimi dururdu; bu adımlar motorun içindeydi ve yalnızca oynanan
 * şehirde koşuyordu. Burada yalnızca ŞEHRİN kendi sistemleri var — haber
 * eşikleri, sıralama ve liderlik oyuncunun gözünün önündeki şehrin işi,
 * motorda kalıyor. Net değer ve hedef adımı da çağıranda: oynanan şehirde
 * aralarına motorun eşik haberleri giriyor.
 *
 * Sıra Tur 29'daki `runDay` ile birebir aynı; holding'siz oyunun davranış
 * özeti değişmedi.
 */
export function simulateCityDay(state: GameState): void {
  state.time.day += 1;

  runEventTick(state);
  runEraTick(state);
  // Canlı pazar (Tur 37d): mevsim dönümü, moda ve eğilim haberleri; çarpanlar durumsuz.
  runLivingTick(state);
  // Kriz takvimi (Tur 37a): dönemin üstüne binen sert ve uzun şok.
  runCrisisTick(state);
  // Enerji (Tur 57): süresi biten yakıt sabitlemesi bugünkü defterden önce kalksın.
  runEnergyTick(state);
  // Proje (Tur 58): açılış günü gelen proje bugünkü defterden önce açılsın.
  runRealEstateTick(state);
  // Rakiplerin hafızası (Tur 59): sönüm ve fiyat kırma; meclis, kampanya
  // ve ihale bugünkü duruşla tepki versin.
  runRelationsTick(state);
  // İmar takvimi sözleşmeden ÖNCE: açılış günü gelen bir inşaat
  // teklifi yeni bölgeyi hedefleyebilmeli.
  runDistrictUnlockTick(state);
  // Meclis imar takvimini değiştirebilir; sözleşmeden önce otursun ki
  // aynı gün üretilen teklif güncel takvimi görsün.
  runCouncilTick(state);
  runContractTick(state);
  // Şehir projesi (Tur 37d): katkı penceresi, sponsor, inşaat ve bitiş.
  runProjectTick(state);
  // Karar kartı (Tur 37b) işgücünden ÖNCE: sendika baskısına dokunan
  // seçenek aynı günün talebine yansısın.
  runCardTick(state);
  // Rakip kampanyası pazardan ÖNCE: başlayan kampanyanın fiyatı aynı gün satışa girsin.
  runRivalryTick(state);
  // İşgücü defterler sıfırlanmadan ÖNCE: talep dünkü kâr marjını okur,
  // bugünkü ücret ve grev de bugünkü defterin ilk satırına girsin.
  runLaborTick(state);
  resetDailyLedgers(state);
  // Ar-Ge primi pazardan ÖNCE ilerler: bugünkü kalite bugünkü satışa
  // girsin. Spot fiyatın tersi (o günün sonunda çözülüyor) çünkü orada
  // yarının fiyatı bugünkü arz fazlasından doğuyor.
  runResearchTick(state);
  runProductionTick(state);
  runMarketTick(state);
  runSpotPriceTick(state);
  runProfitTrendTick(state);
  // Taşıma sözleşmeleri (Tur 56) pazardan SONRA: bugünkü ücret pazarın
  // defterinde; biten ve bozulan sözleşmeler, yeni teklif.
  runFreightTick(state);

  const mods = collectEventModifiers(state);
  runLandValueTick(state, mods.landValueDrift);
  runPopulationTick(state);
  // Şehrin kendi gelişimi nüfustan SONRA: bugünkü nüfus bugünkü
  // yapılaşma basıncını belirlesin. Rakiplerden ÖNCE, çünkü şehir de
  // araziye talip — rakip bugün baktığı parseli dün şehir kapmış
  // olabilir ve bu, kaçırılan parselin bedelini gerçek kılıyor.
  runCityGrowthTick(state);
  runNpcTick(state);
  // Devralma emirleri rakiplerden SONRA: hedef dünkü alımı gördü ve
  // bugünkü savunmasını (geri alım, ihraç) yaptı; emir kalan dolaşımdan
  // alır. Devralma tick'inden ÖNCE: eşiği geçen alım aynı gün sonuçlansın.
  runOrderTick(state);
  // İhale NPC turundan sonra: rakip aynı gün hem mağaza açıp hem teklif
  // vermesin, nakit iki kez harcanmış gibi görünmesin.
  runAuctionTick(state);

  // Temettü kredi kapatmadan ÖNCE: hissedarın parası, borcunu
  // kapatmak için o gün elinde olsun.
  runDividendTick(state);
  // Devralma temettüden SONRA: devralınan şirket son gününün payını
  // dağıtmış olsun, hissedar ortada kalmasın.
  runTakeoverTick(state, (title, body) => pushNews(state, 'rival', title, body));
  // Boşalan koltuk: devralma sonrası kadro eksikse yeni rakip girer.
  runEntrantTick(state);
  // Banka: taksit, kredili hesap, not, haciz.
  runCreditTick(state);
  // Fırsat balonu (Tur 37c) günün SONUNDA: tutarı bugünkü cirodan. Görev
  // panosu burada değil: net değerin günlük hesabından SONRA çalışıyor
  // (`runQuestTick`'e bakın).
  runBubbleTick(state);
  // Şirketin yolu (Tur 61) günün defterleri kapanınca: hedef adımından ÖNCE,
  // zafer günü donan yol o günün kârını da saysın. Bekleyen şehir de kendi
  // gününde (Codex #91). Simülasyon defteri okumuyor.
  notePathSources(state);
}
