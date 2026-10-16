/**
 * Android kabuğu (Capacitor, L11): yerel titreşim, uygulama durumu, geri
 * tuşu ve yerel bildirimler. Tarayıcıda hepsi boş geçiyor; eklentiler yalnızca
 * Android'de yükleniyor (ayrı parça).
 *
 * Bildirimler iOS'takiyle aynı (`Notifications.swift`): arka plana geçerken
 * modelden "ne zaman ne olacak" hesaplanıp zamanlanıyor, dönünce siliniyor.
 */
import { Capacitor } from '@capacitor/core';
import {
  CHAIN_IDS,
  OVERTAKE_SHARE,
  applyOffline,
  chainReport,
  firstOvertake,
  offlineCap,
  type LiteState,
} from '@capital/lite-model';
import { money } from './format';
import { chainName, t } from './l10n';

export const isNative = Capacitor.isNativePlatform();

export type HapticKind = 'selection' | 'warning' | 'success';

export async function nativeHaptic(kind: HapticKind): Promise<void> {
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
  if (kind === 'selection') await Haptics.impact({ style: ImpactStyle.Light });
  else await Haptics.notification({ type: kind === 'warning' ? NotificationType.Warning : NotificationType.Success });
}

/** Uygulama öne ya da arka plana geçince (sekme görünürlüğünün yerel karşılığı). */
export async function onAppState(listener: (active: boolean) => void): Promise<void> {
  const { App } = await import('@capacitor/app');
  await App.addListener('appStateChange', ({ isActive }) => listener(isActive));
}

/** Geri tuşu: açık pencereyi kapatır; yoksa uygulamayı arka plana alır (oyun durmuyor, kaydediliyor). */
export async function onBack(close: () => boolean): Promise<void> {
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (!close()) void App.minimizeApp();
  });
}

// ------------------------------------------------------------ bildirimler

const IDS = { cap: 1, council: 2, rival: 3 } as const;
/** Bundan yakın bildirim kurulmuyor: uygulamayı değiştirip dönmek "yokken" değil. */
const MINIMUM_DELAY = 60;

export interface Planned {
  id: number;
  title: string;
  body: string;
  /** Kaç saniye sonra. */
  delay: number;
}

/** Plan (iOS `LiteNotifications.plan` ile aynı): kasa doldu, meclis toplandı, rakip geçti. */
export function notificationPlan(state: LiteState): Planned[] {
  const plan: Planned[] = [];
  const cap = offlineCap(state);
  const earned = applyOffline(state, cap).earned;
  if (earned > 0) plan.push({ id: IDS.cap, title: t('notify.cap.title'), body: t('notify.cap.body', money(earned)), delay: cap });
  if (state.council === null) {
    const delay = state.nextCouncilAt - state.clock;
    if (delay <= cap) plan.push({ id: IDS.council, title: t('notify.council.title'), body: t('notify.council.body'), delay });
  }
  const overtake = firstOvertake(state, cap);
  if (overtake !== null) {
    const later = applyOffline(state, overtake).state;
    const chain = CHAIN_IDS.find(
      (id) => state.chains[id].levels[2] > 0 && chainReport(state, id).share >= OVERTAKE_SHARE && chainReport(later, id).share < OVERTAKE_SHARE,
    );
    if (chain) plan.push({ id: IDS.rival, title: t('notify.rival.title'), body: t('notify.rival.body', chainName(chain)), delay: overtake });
  }
  return plan.filter((item) => item.delay >= MINIMUM_DELAY);
}

export type Permission = 'granted' | 'denied' | 'prompt';

export async function notificationPermission(): Promise<Permission> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
}

export async function requestNotifications(): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

export async function cancelNotifications(): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: Object.values(IDS).map((id) => ({ id })) });
}

export async function scheduleNotifications(state: LiteState): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await cancelNotifications();
  const plan = notificationPlan(state);
  if (plan.length === 0) return;
  const now = Date.now();
  await LocalNotifications.schedule({
    notifications: plan.map((item) => ({ id: item.id, title: item.title, body: item.body, schedule: { at: new Date(now + item.delay * 1000) } })),
  });
}
