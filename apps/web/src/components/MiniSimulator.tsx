import { useMemo, useState } from 'react'
import { EMPLACEMENTS_PAR_BORNE, OFFRE, loyerSaison, recommendBornes } from '@/data/site'

// Aide au dimensionnement, pas simulateur de rentabilité.
//
// L'ancienne version projetait un revenu de locations (10 emprunts/jour/borne)
// et un taux de subvention communale. Les deux chiffres étaient inventés : rien
// ne les étayait, et l'ANS ne finance plus les équipements de proximité depuis
// 2026. Ce composant se limite désormais à ce qu'on sait dire honnêtement —
// combien de bornes pour combien d'emplacements, et ce que ça coûte.

const eur = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' € HT'

export default function MiniSimulator() {
  const [emplacements, setEmplacements] = useState(180)

  const { bornes, achatAn1, locationSaison } = useMemo(() => {
    const b = recommendBornes(emplacements)
    return {
      bornes: b,
      achatAn1: b * (OFFRE.prixBorne + OFFRE.aboSaison),
      locationSaison: b * loyerSaison,
    }
  }, [emplacements])

  return (
    <div className="card-dark p-7 sm:p-9">
      <label
        htmlFor="emplacements"
        className="block text-xs uppercase tracking-[0.12em] text-white/60 mb-3"
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
        onChange={(e) => setEmplacements(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
      <div className="font-extrabold text-3xl text-white mt-2 mb-8">
        {emplacements} <span className="text-base font-light text-white/50">emplacements</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.1em] text-brand-400 mb-1">Bornes</div>
          <div className="font-extrabold text-2xl text-white">{bornes}</div>
          <div className="text-xs text-white/45 font-light mt-1">
            environ 1 pour {EMPLACEMENTS_PAR_BORNE} emplacements
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.1em] text-brand-400 mb-1">Achat, 1re année</div>
          <div className="font-extrabold text-2xl text-white">{eur(achatAn1)}</div>
          <div className="text-xs text-white/45 font-light mt-1">
            puis {eur(bornes * OFFRE.aboSaison)} par saison
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.1em] text-brand-400 mb-1">Location</div>
          <div className="font-extrabold text-2xl text-white">{eur(locationSaison)}</div>
          <div className="text-xs text-white/45 font-light mt-1">par saison, tout compris</div>
        </div>
      </div>

      <p className="text-xs text-white/40 font-light mt-7 leading-relaxed">
        Ordre de grandeur pour situer le budget. Le nombre exact se décide sur place, en
        fonction de la distance entre la borne et vos terrains.
      </p>
    </div>
  )
}
