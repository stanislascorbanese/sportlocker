import { useMemo, useState } from 'react'
import { EMPLACEMENTS_PAR_BORNE, OFFRES, recommendBornes } from '@/data/site'

/**
 * Aide au dimensionnement et au budget.
 *
 * Ce n'est pas un simulateur de rentabilité : l'ancienne version projetait un
 * revenu de locations et un taux de subvention, deux chiffres inventés. Elle
 * répond à la seule question qu'un gérant se pose devant une grille tarifaire —
 * « chez moi, ça fait combien de bornes et combien d'euros ? »
 */

const eur = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' € HT'

// Montants unitaires par formule, dérivés d'OFFRES pour rester cohérents avec
// la grille affichée juste au-dessus sur la page.
const PILOTE_SAISON = 894
const ACHAT_AN1 = 4500 + 790
const ACHAT_SUITE = 790
const LOCATION_SAISON = 349 * 6

export default function MiniSimulator() {
  const [emplacements, setEmplacements] = useState(180)

  const chiffres = useMemo(() => {
    const bornes = recommendBornes(emplacements)
    return {
      bornes,
      pilote: bornes * PILOTE_SAISON,
      achatAn1: bornes * ACHAT_AN1,
      achatSuite: bornes * ACHAT_SUITE,
      location: bornes * LOCATION_SAISON,
    }
  }, [emplacements])

  return (
    <div className="card-dark p-7 sm:p-9">
      <label
        htmlFor="emplacements"
        className="block text-xs uppercase tracking-[0.12em] text-white/55 mb-3"
      >
        Nombre d’emplacements
      </label>
      <input
        id="emplacements"
        type="range"
        min={40}
        max={600}
        step={10}
        value={emplacements}
        onChange={(event) => setEmplacements(Number(event.target.value))}
        className="w-full accent-brand-500"
      />
      <div className="flex flex-wrap items-baseline gap-x-3 mt-2 mb-8">
        <span className="font-extrabold text-3xl text-white">{emplacements}</span>
        <span className="text-white/50 font-light">emplacements</span>
        <span className="text-brand-400 font-medium ml-auto">
          {chiffres.bornes} borne{chiffres.bornes > 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        <div>
          <div className="text-xs uppercase tracking-[0.1em] text-brand-400 mb-1">
            {OFFRES[0]?.label ?? 'Saison pilote'}
          </div>
          <div className="font-extrabold text-2xl text-white">{eur(chiffres.pilote)}</div>
          <div className="text-xs text-white/45 font-light mt-1">la saison, rien à investir</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.1em] text-white/45 mb-1">Achat</div>
          <div className="font-extrabold text-2xl text-white">{eur(chiffres.achatAn1)}</div>
          <div className="text-xs text-white/45 font-light mt-1">
            la 1ʳᵉ année, puis {eur(chiffres.achatSuite)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.1em] text-white/45 mb-1">Location</div>
          <div className="font-extrabold text-2xl text-white">{eur(chiffres.location)}</div>
          <div className="text-xs text-white/45 font-light mt-1">par saison, tout compris</div>
        </div>
      </div>

      <p className="text-xs text-white/40 font-light mt-7 leading-relaxed">
        Environ une borne pour {EMPLACEMENTS_PAR_BORNE} emplacements. Le nombre exact se décide
        sur place. Ce qui compte n’est pas la taille du camping, mais la distance entre la borne
        et vos terrains.
      </p>
    </div>
  )
}
