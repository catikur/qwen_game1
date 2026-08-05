import { useState } from 'react';
import type { ReactElement } from 'react';
import { CEOS, DEFAULT_CEO_ID } from '@capital/content';
import { CeoPortrait } from './CeoPortrait';

/**
 * Açılış ekranı.
 *
 * Oyuncu doğrudan tabloya düşmek yerine masaya bir kimlikle oturuyor:
 * şirketin adı ve kimin yönettiği. İki soru, tek ekran, tek buton —
 * "sıkmadan içine çekmek" kuralı burada da geçerli.
 */
export function NewGameScreen({
  onStart,
  onCancel,
}: {
  onStart: (companyName: string, ceoId: string) => void;
  onCancel?: () => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [ceoId, setCeoId] = useState(DEFAULT_CEO_ID);
  const selected = CEOS.find((c) => c.id === ceoId) ?? CEOS[0]!;

  const submit = () => onStart(name.trim() || 'Yeni Girişim', ceoId);

  return (
    <div className="newgame">
      <div className="newgame-inner">
        <header className="newgame-head">
          <p className="newgame-eyebrow">Yeni şehir, yeni şirket</p>
          <h1>CapitalForge</h1>
          <p className="newgame-lead">
            Şehrin çoğu zaten kurulmuş durumda. Sen boş parselleri bulup büyüyeceksin — ya da
            birinin işini satın alacaksın.
          </p>
        </header>

        <label className="newgame-field">
          <span>Şirketin adı</span>
          <input
            type="text"
            value={name}
            maxLength={32}
            autoFocus
            placeholder="ör. Karaca Holding"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </label>

        <div className="newgame-field">
          <span>Şirketi kim yönetiyor?</span>
          <ul className="ceo-grid">
            {CEOS.map((ceo) => (
              <li key={ceo.id}>
                <button
                  type="button"
                  className={`ceo-card${ceo.id === ceoId ? ' selected' : ''}`}
                  onClick={() => setCeoId(ceo.id)}
                  aria-pressed={ceo.id === ceoId}
                >
                  <CeoPortrait portrait={ceo.portrait} size={72} />
                  <span className="ceo-name">{ceo.name}</span>
                  <span className="ceo-title">{ceo.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="ceo-detail">
          <CeoPortrait portrait={selected.portrait} size={104} />
          <div>
            <h2>
              {selected.name} <span className="ceo-title">· {selected.title}</span>
            </h2>
            <p className="ceo-bio">{selected.bio}</p>
            <p className="ceo-perk">
              <span className="tag good">Güçlü yanı</span> {selected.perk}
            </p>
            <p className="ceo-perk">
              <span className="tag bad">Zayıf yanı</span> {selected.drawback}
            </p>
          </div>
        </div>

        <div className="newgame-actions">
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Vazgeç
            </button>
          )}
          <button type="button" className="primary" onClick={submit}>
            Şirketi kur
          </button>
        </div>
      </div>
    </div>
  );
}
