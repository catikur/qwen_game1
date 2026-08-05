import type { ReactElement } from 'react';
import type { CeoPortrait as PortraitSpec } from '@capital/content';

/**
 * CEO portresi.
 *
 * Dış görsel dosyası yok: portre, karakterin parametrelerinden çizilen bir
 * SVG. Böylece hem asset zinciri gerekmiyor hem de yeni bir CEO eklemek
 * birkaç satır veri yazmaktan ibaret kalıyor.
 */
export function CeoPortrait({
  portrait,
  size = 96,
}: {
  portrait: PortraitSpec;
  size?: number;
}): ReactElement {
  const { skin, hair, hairStyle, clothes, accent, glasses, facialHair, background } = portrait;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-hidden="true"
      className="ceo-portrait"
    >
      <defs>
        <clipPath id={`clip-${background.replace('#', '')}`}>
          <rect x="0" y="0" width="100" height="100" rx="14" />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${background.replace('#', '')})`}>
        <rect x="0" y="0" width="100" height="100" fill={background} />
        <circle cx="50" cy="46" r="34" fill="#ffffff" opacity="0.05" />

        {/* Omuzlar ve yaka */}
        <path d="M14 100 Q22 74 50 74 Q78 74 86 100 Z" fill={clothes} />
        <path d="M42 76 L50 90 L58 76 L52 73 L48 73 Z" fill={accent} opacity="0.9" />

        {/* Boyun */}
        <rect x="43" y="60" width="14" height="16" rx="6" fill={skin} />
        <rect x="43" y="60" width="14" height="7" rx="3" fill="#000000" opacity="0.14" />

        {/* Baş */}
        <ellipse cx="50" cy="44" rx="19" ry="22" fill={skin} />
        <ellipse cx="41" cy="45" rx="1.9" ry="2.4" fill="#20161a" />
        <ellipse cx="59" cy="45" rx="1.9" ry="2.4" fill="#20161a" />
        <path d="M44 55 Q50 59 56 55" stroke="#20161a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.75" />

        {facialHair && (
          <path d="M38 50 Q50 68 62 50 Q58 62 50 63 Q42 62 38 50 Z" fill={hair} opacity="0.9" />
        )}

        {/* Saç — stile göre farklı siluet */}
        {hairStyle === 'short' && <path d="M31 40 Q32 20 50 20 Q68 20 69 40 Q63 30 50 30 Q37 30 31 40 Z" fill={hair} />}
        {hairStyle === 'crop' && <path d="M31 38 Q34 22 50 22 Q66 22 69 38 L65 33 L58 36 L50 32 L42 36 L35 33 Z" fill={hair} />}
        {hairStyle === 'bun' && (
          <>
            <path d="M31 42 Q31 20 50 20 Q69 20 69 42 Q62 28 50 28 Q38 28 31 42 Z" fill={hair} />
            <circle cx="70" cy="24" r="8" fill={hair} />
          </>
        )}
        {hairStyle === 'curly' && (
          <>
            <path d="M31 42 Q30 22 50 21 Q70 22 69 42 Q62 30 50 30 Q38 30 31 42 Z" fill={hair} />
            <circle cx="34" cy="30" r="6.5" fill={hair} />
            <circle cx="50" cy="22" r="7.5" fill={hair} />
            <circle cx="66" cy="30" r="6.5" fill={hair} />
          </>
        )}
        {hairStyle === 'wave' && (
          <path d="M30 44 Q28 20 50 20 Q72 20 70 44 Q66 34 60 36 Q54 26 44 32 Q36 34 30 44 Z" fill={hair} />
        )}
        {hairStyle === 'bald' && <path d="M33 34 Q38 24 50 24 Q62 24 67 34 Q58 30 50 30 Q42 30 33 34 Z" fill={hair} opacity="0.5" />}

        {glasses && (
          <g stroke={accent} strokeWidth="1.9" fill="none" opacity="0.95">
            <rect x="34" y="40" width="13" height="10" rx="4" />
            <rect x="53" y="40" width="13" height="10" rx="4" />
            <path d="M47 45 L53 45" />
          </g>
        )}
      </g>
    </svg>
  );
}
