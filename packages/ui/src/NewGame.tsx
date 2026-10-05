import { useState } from 'react';
import type { ReactElement } from 'react';
import { CEOS, DEFAULT_CEO_ID, DEFAULT_DIFFICULTY, DIFFICULTIES } from '@capital/content';
import type { DifficultyId } from '@capital/content';
import { leagueWeekId } from '@capital/core';
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
  onStart: (companyName: string, ceoId: string, difficulty: DifficultyId, league: boolean) => void;
  onCancel?: () => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [ceoId, setCeoId] = useState(DEFAULT_CEO_ID);
  const [difficulty, setDifficulty] = useState<DifficultyId>(DEFAULT_DIFFICULTY);
  const [league, setLeague] = useState(false);
  const weekId = leagueWeekId();
  const selected = CEOS.find((c) => c.id === ceoId) ?? CEOS[0]!;
  const level = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1]!;

  const submit = () => onStart(name.trim() || 'Yeni Girişim', ceoId, league ? 'normal' : difficulty, league);

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

        {/*
          Oyun türü: serbest şehir ya da haftanın tohumu. Ligde şehir ve
          kurallar herkes için aynı; zorluk seçimi bu yüzden kalkıyor.
        */}
        <div className="newgame-field">
          <span>Nasıl oynayacaksın?</span>
          <div className="difficulty-picker mode-picker" role="radiogroup" aria-label="Oyun türü">
            <button
              type="button"
              role="radio"
              aria-checked={!league}
              className={`difficulty-option${!league ? ' selected' : ''}`}
              data-mode="free"
              onClick={() => setLeague(false)}
            >
              Serbest şehir
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={league}
              className={`difficulty-option${league ? ' selected' : ''}`}
              data-mode="league"
              onClick={() => setLeague(true)}
            >
              Tohum Ligi · {weekId}
            </button>
          </div>
          {league && (
            <div className="difficulty-detail">
              <p>
                Bu haftanın şehri herkes için aynı. 360 gün oynarsın; skor 360. gündeki şirket değerin. Her hamlen
                kaydedilir — skorun, herkesin kendi tarayıcısında koşunu baştan oynatmasıyla doğrulanır.
              </p>
              <ul>
                <li>Zorluk Dengeli, kurallar sabit</li>
                <li>En iyi koşu "hayalet" olarak yanında yarışır</li>
              </ul>
            </div>
          )}
        </div>

        {/*
          Zorluk görünmez bir bonus değil: seçilen kademenin farkları
          açıkça yazıyor. Oyuncu neye razı olduğunu bilerek başlamalı.
        */}
        {!league && (
        <div className="newgame-field">
          <span>Şehir ne kadar acımasız?</span>
          <div className="difficulty-picker" role="radiogroup" aria-label="Zorluk">
            {DIFFICULTIES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === difficulty}
                className={`difficulty-option${option.id === difficulty ? ' selected' : ''}`}
                data-difficulty={option.id}
                onClick={() => setDifficulty(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <div className="difficulty-detail">
            <p>{level.blurb}</p>
            <ul>
              {level.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>
        )}

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
