/** React bağları: depo, gece/gündüz, pencere boyu. */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { isNight } from './settings';
import type { GameStore } from './store';

export const StoreContext = createContext<GameStore | null>(null);

const noSubscribe = () => () => {};
const zero = () => 0;

/** Depo; her değişiklikte (saniyede birkaç kez) yeniden çiziliyor. */
export function useStore(): GameStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext yok');
  useSyncExternalStore(store.subscribe, store.getRevision);
  return store;
}

/** Gece mi: Ayarlar'daki görünüm ya da cihazın koyu modu. */
export function useNight(): boolean {
  const store = useContext(StoreContext);
  const [system, setSystem] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystem(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getRevision ?? zero);
  if (!store) return system;
  return store.settings.appearance === 'system' ? system : isNight(store.settings);
}

export function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({ width: innerWidth, height: innerHeight }));
  useEffect(() => {
    const resize = () => setSize({ width: innerWidth, height: innerHeight });
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  return size;
}
