import { useEffect } from 'react';
import type { GameEngine } from '@capital/core';
import { observeCareer } from './career';
import { t } from './i18n';
import type { ToastMessage } from './useGame';

/** Aynı anda açılan rozetlerden kaçı tek tek duyuruluyor; kalanı tek bildirim. */
const ANNOUNCED = 2;

/**
 * Oynanan koşuyu kariyere işler ve açılan rozeti bildirir (Tur 41).
 *
 * Motor durumu yerinde değiştiriyor; gün başı geri çağrısı yok, bir karede
 * birkaç gün de ilerleyebiliyor. Her sürümde gözlemleniyor: duraklatılmış
 * oyunda aynı gün verilen komut (halka arz, balon, görev) da sürümü
 * artırıyor ve günü değiştirmiyor (Codex #70). Gözlem ucuz; depoya yazma
 * kariyer deposunda seyreltiliyor.
 */
export function useCareerWatch(engine: GameEngine, version: number, toast: (text: string, tone?: ToastMessage['tone']) => void): void {
  useEffect(() => {
    const opened = observeCareer(engine.getState());
    for (const def of opened.slice(0, ANNOUNCED)) toast(t('hud.career.unlockedToast', { title: def.title }), 'good');
    if (opened.length > ANNOUNCED) toast(t('hud.career.moreToast', { count: opened.length - ANNOUNCED }), 'good');
  }, [engine, version, toast]);
}
