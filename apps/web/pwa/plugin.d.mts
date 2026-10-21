import type { Plugin } from 'vite';

export function precacheEntries(files: readonly string[]): string[];
export function cacheVersion(entries: readonly string[], read: (entry: string) => string | Uint8Array, salt?: string): string;
export function renderServiceWorker(template: string, entries: readonly string[], version: string): string;
export function serviceWorkerSource(template: string, entries: readonly string[], read: (entry: string) => string | Uint8Array): string;
export function serviceWorker(): Plugin;
