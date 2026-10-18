import { useEffect, useRef } from 'react';
import type { GameEngine } from '@capital/core';
import { observeCareer } from './career';
import { t } from './i18n';
import type { ToastMessage } from './useGame';

/** Aynı anda açılan rozetlerden kaçı tek tek duyuruluyor; kalanı tek bildirim. */
const ANNOUNCED = 2;

/**
 * Oynanan koşuyu kariyere işler ve açılan rozeti bildirir (Tur 41).
 *
 * Motor durumu yerinde değiştiriyor ve bir karede birkaç gün ilerleyebiliyor:
 * gün başı geri çağrısı yok. Bu yüzden her sürümde koşunun imzasına
 * (gün, zafer, oyun sonu, senaryo ve lig bitişi, şehir sayısı) bakılıyor;
 * imza değişmediyse hiçbir şey yapılmıyor.
 */
export function useCareerWatch(engine: GameEngine, version: number, toast: (text: string, tone?: ToastMessage['tone']) => void): void {
  const last = useRef('');
  useEffect(() => {
    const state = engine.getState();
    const signature = [
      state.meta.createdAtIso,
      state.time.day,
      state.victory?.day ?? '',
      state.gameOver?.day ?? '',
      state.scenario?.finishedDay ?? '',
      state.league?.finishedDay ?? '',
      state.holding?.opened ?? 1,
    ].join(':');
    if (signature === last.current) return;
    last.current = signature;
    const opened = observeCareer(state);
    for (const def of opened.slice(0, ANNOUNCED)) toast(t('hud.career.unlockedToast', { title: def.title }), 'good');
    if (opened.length > ANNOUNCED) toast(t('hud.career.moreToast', { count: opened.length - ANNOUNCED }), 'good');
  }, [engine, version, toast]);
}
