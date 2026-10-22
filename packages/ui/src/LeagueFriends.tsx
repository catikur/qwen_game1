import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { CEO_BY_ID } from '@capital/content';
import { formatMoney } from '@capital/core';
import { useGame } from './useGame';
import type { FriendLeague, FriendLeagues, FriendOutcome, FriendTable } from './useGame';
import { clearInvite, inviteCode, inviteLink } from './invite';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/**
 * Arkadaş ligleri (Tur 55): davet kodlu ligler ve kendi tabloları.
 *
 * Lig sunucusu tanıyorsa (`friends.available()`) lig panelinde. Lig bir ad
 * ve altı harflik kod; kodu (ya da davet bağlantısını) alan katılıyor. Ligin
 * tablosu üyelerin bu hafta ya da bugünkü doğrulanmış koşuları: genel
 * tablodaki satırların aynısı, yalnız arkadaşlar.
 */

const SELECTED_KEY = 'capitalforge.league.friend';

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

function writeSelected(code: string | null): void {
  try {
    if (code) localStorage.setItem(SELECTED_KEY, code);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    // depo kapalı: seçim bu oturumda
  }
}

const OUTCOME: Record<Exclude<FriendOutcome, 'ok'>, MessageKey> = {
  offline: 'app.league.friends.error.offline',
  busy: 'app.league.friends.error.busy',
  name: 'app.league.friends.error.name',
  'name-blocked': 'app.league.friends.error.nameBlocked',
  'unknown-code': 'app.league.friends.error.unknownCode',
  full: 'app.league.friends.error.full',
  limit: 'app.league.friends.error.limit',
  error: 'app.league.friends.error.other',
};

/**
 * Ligin tablosu: açılınca, dakikada bir ve sekmeye dokununca (`reload`)
 * tazeleniyor. Tablo üye sayısını da getiriyor: liste ondan güncelleniyor
 * (`onMembers`), sekme ve başlık eski sayıda kalmasın (Codex #84).
 */
function useFriendTable(
  friends: FriendLeagues,
  code: string | null,
  boardId: string,
  reload: number,
  onMembers: (code: string, members: number) => void,
): FriendTable | 'gone' | 'offline' | 'loading' {
  const [state, setState] = useState<{ key: string; value: FriendTable | 'gone' | 'offline' }>({ key: '', value: 'offline' });
  const key = code ? `${code}:${boardId}` : '';
  const report = useRef(onMembers);
  report.current = onMembers;
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const load = async () => {
      const table = await friends.table(code, boardId);
      if (!alive) return;
      setState({ key, value: table ?? 'offline' });
      if (table && table !== 'gone') report.current(code, table.members);
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [friends, code, boardId, key, reload]);
  return state.key === key ? state.value : 'loading';
}

export function LeagueFriends({
  friends,
  boardId,
  daily,
  onAccount,
}: {
  friends: FriendLeagues;
  boardId: string;
  daily: boolean;
  /** Kurmak ya da katılmak hesabı açabiliyor: panel hesap bölümünü hemen göstersin. */
  onAccount?: () => void;
}): ReactElement {
  const { toast } = useGame();
  const [leagues, setLeagues] = useState<FriendLeague[] | null | 'loading'>('loading');
  const [selected, setSelected] = useState<string | null>(readSelected);
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => inviteCode() ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const invited = inviteCode();

  const refresh = async (prefer?: string) => {
    const list = await friends.list();
    setLeagues(list);
    if (list && list.length > 0) {
      const keep = prefer ?? selected;
      const next = list.some((league) => league.code === keep) ? keep! : list[0]!.code;
      setSelected(next);
      writeSelected(next);
    }
  };
  useEffect(() => {
    void refresh();
    // Panel her açılışta bir kez; liste ancak bu bölümden değişiyor.
  }, [friends]);

  const list = Array.isArray(leagues) ? leagues : [];
  const current = list.find((league) => league.code === selected) ?? null;
  const [reload, setReload] = useState(0);
  const table = useFriendTable(friends, current?.code ?? null, boardId, reload, (code, members) =>
    setLeagues((before) =>
      Array.isArray(before) && before.some((league) => league.code === code && league.members !== members)
        ? before.map((league) => (league.code === code ? { ...league, members } : league))
        : before,
    ),
  );
  // Davet bağlantısıyla gelen kod zaten liglerimden biriyse katılma alanı boş kalsın.
  const alreadyIn = invited !== null && list.some((league) => league.code === invited);

  const act = async (run: () => Promise<{ outcome: FriendOutcome; league?: FriendLeague }>, done: MessageKey) => {
    setBusy(true);
    setMessage(null);
    const result = await run();
    setBusy(false);
    if (result.outcome === 'ok' && result.league) {
      setMessage({ text: t(done, { name: result.league.name }), tone: 'good' });
      onAccount?.();
      if (invited === result.league.code) clearInvite();
      await refresh(result.league.code);
      return true;
    }
    setMessage({ text: t(OUTCOME[result.outcome === 'ok' ? 'error' : result.outcome]), tone: 'bad' });
    return false;
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => friends.create(name), 'app.league.friends.created')) setName('');
  };
  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => friends.join(code), 'app.league.friends.joined')) setCode('');
  };
  const leave = async () => {
    if (!current) return;
    setBusy(true);
    const ok = await friends.leave(current.code);
    setBusy(false);
    setConfirmLeave(false);
    if (!ok) {
      setMessage({ text: t('app.league.friends.error.offline'), tone: 'bad' });
      return;
    }
    setMessage({ text: t('app.league.friends.left', { name: current.name }), tone: 'good' });
    writeSelected(null);
    setSelected(null);
    await refresh();
  };
  const copyInvite = async () => {
    if (!current) return;
    const link = inviteLink(current.code);
    try {
      await navigator.clipboard.writeText(link);
      toast(t('app.league.friends.copied'), 'good');
    } catch {
      // Pano kapalı: bağlantı seçilebilir metin olarak görünüyor.
      toast(t('app.league.friends.copyFailed', { link }), 'info');
    }
  };

  return (
    <section className="league-friends" data-league-friends={leagues === 'loading' ? 'loading' : leagues === null ? 'offline' : list.length}>
      <h3>{t('app.league.friends.title')}</h3>
      {invited && !alreadyIn && (
        <p className="league-invite" data-league-invite={invited}>
          {t('app.league.friends.invited', { code: invited })}
        </p>
      )}
      {leagues === null && <p className="muted">{t('app.league.friends.error.offline')}</p>}
      {Array.isArray(leagues) && list.length === 0 && <p className="muted">{t('app.league.friends.none')}</p>}
      {list.length > 0 && (
        <div className="league-friend-tabs" role="tablist" aria-label={t('app.league.friends.title')}>
          {list.map((league) => (
            <button
              key={league.code}
              type="button"
              role="tab"
              aria-selected={league.code === current?.code}
              data-league-friend={league.code}
              onClick={() => {
                setSelected(league.code);
                writeSelected(league.code);
                setConfirmLeave(false);
                // Seçili sekmeye dokunmak tabloyu tazeliyor.
                if (league.code === current?.code) setReload((count) => count + 1);
              }}
            >
              {league.name}
              <span className="muted"> · {league.members}</span>
            </button>
          ))}
        </div>
      )}
      {current && (
        <div className="league-friend" role="tabpanel" data-league-friend-table={current.code}>
          <p className="league-friend-code">
            <span>
              {t('app.league.friends.code')} <code>{current.code}</code> · {t('app.league.friends.members', { count: current.members })}
            </span>
            <button type="button" className="ghost" onClick={() => void copyInvite()} data-league-friend-copy>
              {t('app.league.friends.copy')}
            </button>
          </p>
          {table === 'loading' && <p className="muted">{t('app.league.friends.loading')}</p>}
          {table === 'offline' && <p className="muted">{t('app.league.friends.error.offline')}</p>}
          {table === 'gone' && <p className="muted">{t('app.league.friends.gone')}</p>}
          {typeof table === 'object' &&
            (table.entries.length === 0 ? (
              <p className="muted">{t(daily ? 'app.league.friends.emptyDay' : 'app.league.friends.empty')}</p>
            ) : (
              <ol className="league-table" data-league-table="friends">
                {table.entries.map((entry, index) => (
                  <li key={entry.id} className={entry.mine ? 'mine' : undefined} data-league-row="friend">
                    <span className="league-rank">{index + 1}</span>
                    <span className="league-who">
                      {entry.companyName}
                      <span className="muted">{entry.ceoId ? ` · ${CEO_BY_ID[entry.ceoId]?.name ?? ''}` : ''}</span>
                    </span>
                    <span className="league-score">{formatMoney(entry.score)}</span>
                  </li>
                ))}
              </ol>
            ))}
          {typeof table === 'object' && table.entries.length > 0 && table.entries.length < current.members && (
            <p className="muted">{t('app.league.friends.played', { played: table.entries.length, members: current.members })}</p>
          )}
          <div className="manual-actions">
            {confirmLeave ? (
              <>
                <button type="button" className="danger" disabled={busy} onClick={() => void leave()} data-league-friend-leave="confirm">
                  {t('app.league.friends.leaveConfirm', { name: current.name })}
                </button>
                <button type="button" className="ghost" disabled={busy} onClick={() => setConfirmLeave(false)}>
                  {t('app.league.account.cancel')}
                </button>
              </>
            ) : (
              <button type="button" className="ghost" onClick={() => setConfirmLeave(true)} data-league-friend-leave="ask">
                {t('app.league.friends.leave')}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="league-friend-forms">
        <form onSubmit={(event) => void create(event)} data-league-friend-form="create">
          <label>
            <span>{t('app.league.friends.createLabel')}</span>
            <input
              type="text"
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('app.league.friends.createPlaceholder')}
            />
          </label>
          <button type="submit" disabled={busy || name.trim().length < 2}>
            {t('app.league.friends.create')}
          </button>
        </form>
        <form onSubmit={(event) => void join(event)} data-league-friend-form="join">
          <label>
            <span>{t('app.league.friends.joinLabel')}</span>
            <input
              type="text"
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABC234"
            />
          </label>
          <button type="submit" disabled={busy || code.trim().length !== 6}>
            {t('app.league.friends.join')}
          </button>
        </form>
      </div>
      {message && (
        <p className={message.tone === 'good' ? 'pos' : 'neg'} role="status" data-league-friend-message={message.tone}>
          {message.text}
        </p>
      )}
      <p className="muted">{t('app.league.friends.note')}</p>
    </section>
  );
}
