import type { LoadProblem } from '@capital/persistence';
import { t, type MessageKey } from './i18n';

/**
 * Kaydın neden açılmadığı, oyuncunun dilinde (Tur 75). Kalıcılık katmanı
 * nedeni bir kodla veriyor (`LoadProblem`); yükleme, içe aktarma ve açılış
 * bunu gösteriyor. Önceden kalıcılığın Türkçe gerekçesi her dilde
 * olduğu gibi çıkıyordu.
 */
const PROBLEM_TEXT: Record<LoadProblem, MessageKey> = {
  notJson: 'app.load.problem.notJson',
  noVersion: 'app.load.problem.noVersion',
  newer: 'app.load.problem.newer',
  noMigration: 'app.load.problem.noMigration',
  broken: 'app.load.problem.broken',
  unreadable: 'app.load.problem.unreadable',
  empty: 'app.load.problem.empty',
  reportWithoutSave: 'app.load.problem.reportWithoutSave',
};

export function loadProblemText(outcome: { problem: LoadProblem; version?: number }): string {
  return t(PROBLEM_TEXT[outcome.problem], { version: outcome.version ?? '?' });
}

/**
 * Açılışta otomatik kayıt açılmadıysa kurulum ekranının notu; kayıt yoksa
 * (ilk açılış) not yok. Yeni sürümün kaydı ezilmiyor: not bunu da söylüyor.
 */
export function bootLoadNotice(outcome: { problem: LoadProblem; version?: number }): string | null {
  if (outcome.problem === 'empty') return null;
  if (outcome.problem === 'newer') return t('app.boot.newer', { version: outcome.version ?? '?' });
  return t('app.boot.notLoaded', { reason: loadProblemText(outcome) });
}
