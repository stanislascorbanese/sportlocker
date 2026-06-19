import { useCallback, useEffect, useRef, useState } from 'react'

// Simulation animée du parcours citoyen (localiser → choisir → ouvrir → rendre).
// Îlot React monté en client:visible sur /comment-ca-marche. Zéro dépendance
// d'animation : state + keyframes CSS. On n'anime QUE transform/opacity (60fps),
// et on respecte prefers-reduced-motion (auto-play coupé + navigation manuelle).

const STEP_MS = 2800

interface Step {
  n: string
  key: string
  label: string
  caption: string
}

const STEPS: Step[] = [
  { n: '01', key: 'locate', label: 'Localiser', caption: 'Le casier libre le plus proche, en temps réel.' },
  { n: '02', key: 'choose', label: 'Choisir la durée', caption: 'Un slot, un prix fixé par le site. Caution préautorisée.' },
  { n: '03', key: 'open', label: 'Ouvrir', caption: 'On scanne le QR, le casier s’ouvre en moins d’une seconde.' },
  { n: '04', key: 'return', label: 'Jouer & rendre', caption: 'Location encaissée, caution libérée automatiquement.' },
]

// Motif 7×7 stylisé « façon QR » avec trois coins de repérage — purement
// décoratif (aria-hidden), pas un vrai code scannable.
const QR_PATTERN: number[] = [
  1, 1, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 1, 0, 1,
  1, 1, 1, 0, 1, 1, 1,
  0, 0, 0, 1, 0, 1, 0,
  1, 1, 1, 0, 1, 0, 1,
  1, 0, 1, 1, 0, 1, 1,
  1, 1, 1, 0, 1, 0, 0,
]

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

export default function JourneySimulation(): JSX.Element {
  const reduced = useReducedMotion()
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-play : avance d'une étape toutes les STEP_MS, en boucle. Désactivé si
  // l'utilisateur a demandé moins de mouvement ou s'il a mis en pause.
  useEffect(() => {
    if (reduced || !playing) return
    timer.current = setInterval(() => {
      setCurrent((c) => (c + 1) % STEPS.length)
    }, STEP_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [reduced, playing])

  const goTo = useCallback((i: number): void => {
    setCurrent(((i % STEPS.length) + STEPS.length) % STEPS.length)
  }, [])

  const replay = useCallback((): void => {
    setCurrent(0)
    setPlaying(true)
  }, [])

  const step = STEPS[current]

  return (
    <div className="grid lg:grid-cols-[auto_1fr] gap-8 lg:gap-12 items-center">
      {/* Téléphone */}
      <div className="js-phone mx-auto" role="img" aria-label={`Parcours citoyen, étape ${step.n} sur ${STEPS.length} : ${step.label}`}>
        <div className="js-phone-notch" aria-hidden="true" />
        <div className="js-screen">
          {/* Barre de statut factice — pas de label central (le notch l'occupe) */}
          <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[0.6rem] text-white/45 tabular-nums">
            <span>9:41</span>
            <span>5G</span>
          </div>

          {/* Contenu de l'étape — keyé sur `current` pour rejouer l'animation */}
          <div key={`${step.key}-${current}`} className={reduced ? 'js-stage' : 'js-stage js-stage-anim'}>
            <StepScreen stepKey={step.key} reduced={reduced} />
          </div>
        </div>
      </div>

      {/* Panneau de contrôle + description */}
      <div>
        {/* Progression */}
        <div className="flex gap-2 mb-6" role="tablist" aria-label="Étapes du parcours">
          {STEPS.map((s, i) => {
            const active = i === current
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Étape ${s.n} : ${s.label}`}
                onClick={() => {
                  setPlaying(false)
                  goTo(i)
                }}
                className="js-seg"
              >
                <span className={active ? 'js-seg-fill js-seg-fill-active' : 'js-seg-fill'} />
              </button>
            )
          })}
        </div>

        <div className="text-[0.7rem] uppercase tracking-[0.14em] text-brand-400 mb-2 tabular-nums">
          Étape {step.n} / {STEPS.length.toString().padStart(2, '0')}
        </div>
        <h3 className="font-extrabold text-white text-2xl mb-3">{step.label}</h3>
        <p className="text-white/60 font-light leading-relaxed max-w-md">{step.caption}</p>

        {/* Commandes */}
        <div className="flex flex-wrap items-center gap-3 mt-7">
          {reduced ? (
            <>
              <button
                type="button"
                onClick={() => goTo(current - 1)}
                className="btn btn-outline btn-sm"
                aria-label="Étape précédente"
              >
                ← Précédent
              </button>
              <button
                type="button"
                onClick={() => goTo(current + 1)}
                className="btn btn-primary btn-sm"
                aria-label="Étape suivante"
              >
                Suivant →
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="btn btn-primary btn-sm"
                aria-pressed={playing}
                aria-label={playing ? 'Mettre la simulation en pause' : 'Lire la simulation'}
              >
                {playing ? '❚❚ Pause' : '▶ Lecture'}
              </button>
              <button
                type="button"
                onClick={replay}
                className="btn btn-outline btn-sm"
                aria-label="Rejouer la simulation depuis le début"
              >
                ↺ Rejouer
              </button>
            </>
          )}
        </div>
      </div>

      <style>{css}</style>
    </div>
  )
}

function StepScreen({ stepKey, reduced }: { stepKey: string; reduced: boolean }): JSX.Element {
  switch (stepKey) {
    case 'locate':
      return (
        <div className="js-pane">
          <div className="js-map">
            <div className="js-map-grid" aria-hidden="true" />
            <div className={reduced ? 'js-pin' : 'js-pin js-anim-drop'} aria-hidden="true">
              <div className="js-pin-dot" />
              <div className="js-pin-stem" />
            </div>
            <div className="js-map-ping" aria-hidden="true" />
          </div>
          <div className="js-card">
            <div className="js-row">
              <span className="js-badge">⚽ Ballon foot</span>
              <span className="js-dist">120 m</span>
            </div>
            <div className="text-[0.7rem] text-white/45 mt-1">Distributeur · 4 casiers libres</div>
          </div>
        </div>
      )
    case 'choose':
      return (
        <div className="js-pane">
          <div className="text-xs text-white/50 mb-3">Choisissez votre durée</div>
          <div className="grid grid-cols-2 gap-2 w-full">
            {['30 min', '1 h', '1 h 30', '2 h'].map((d, i) => (
              <div key={d} className={i === 1 ? 'js-slot js-slot-active' : 'js-slot'}>
                {d}
              </div>
            ))}
          </div>
          <div className={reduced ? 'js-price' : 'js-price js-anim-fade'}>
            1,00 €
            <span className="js-price-sub">+ caution 30 € préautorisée</span>
          </div>
        </div>
      )
    case 'open':
      return (
        <div className="js-pane items-center justify-center">
          <div className="js-qr" aria-hidden="true">
            <div className="js-qr-grid">
              {QR_PATTERN.map((on, i) => (
                <span key={i} className={on ? 'on' : ''} />
              ))}
            </div>
          </div>
          <div className="js-locker" aria-hidden="true">
            <div className={reduced ? 'js-door js-door-open' : 'js-door js-anim-door'}>
              <span className="js-door-handle" />
            </div>
            <div className="js-locker-content">⚽</div>
          </div>
          <div className={reduced ? 'js-ok' : 'js-ok js-anim-pop'}>✓ Ouvert</div>
        </div>
      )
    case 'return':
    default:
      return (
        <div className="js-pane items-center justify-center text-center">
          <div className="js-timer">
            <div className="js-timer-bar">
              <span className={reduced ? 'js-timer-fill js-timer-fill-done' : 'js-timer-fill js-anim-fill'} />
            </div>
            <div className="text-[0.7rem] text-white/45 mt-2">Session 1 h · rappel push à -30 min</div>
          </div>
          <div className={reduced ? 'js-done' : 'js-done js-anim-pop-late'}>
            <div className="text-3xl mb-1">🎉</div>
            <div className="font-bold text-white">Rendu ✓</div>
            <div className="text-[0.72rem] text-brand-400 mt-1">Caution libérée automatiquement</div>
          </div>
        </div>
      )
  }
}

// Couleur de marque alignée sur le reste du site (#1d9e75 / brand-500).
const css = `
.js-phone {
  position: relative;
  width: 270px;
  height: 540px;
  border-radius: 40px;
  padding: 12px;
  background: linear-gradient(160deg, #1b2a3d, #0d1b2a);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 30px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06);
}
.js-phone-notch {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  width: 110px; height: 22px; border-radius: 0 0 14px 14px; background: #0d1b2a; z-index: 3;
}
.js-screen {
  position: relative; width: 100%; height: 100%;
  border-radius: 30px; overflow: hidden;
  background: radial-gradient(120% 80% at 50% 0%, #16304a 0%, #0d1b2a 60%);
}
.js-stage { position: absolute; inset: 0; top: 34px; padding: 8px 14px 16px; }
.js-stage-anim { animation: jsScreenIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
.js-pane { display: flex; flex-direction: column; height: 100%; gap: 12px; }

/* Étape 1 — carte + pin */
.js-map {
  position: relative; flex: 1; border-radius: 16px; overflow: hidden;
  background: linear-gradient(135deg, #14283d, #0f2034);
  border: 1px solid rgba(255,255,255,0.07);
}
.js-map-grid {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 26px 26px;
}
.js-pin {
  position: absolute; top: 38%; left: 50%; transform: translate(-50%,-100%);
  display: flex; flex-direction: column; align-items: center; z-index: 2;
}
.js-pin-dot { width: 22px; height: 22px; border-radius: 50%; background: #1d9e75; border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
.js-pin-stem { width: 2px; height: 12px; background: #fff; opacity: 0.7; }
.js-anim-drop { animation: jsDrop 0.6s cubic-bezier(0.34,1.56,0.64,1) both; }
.js-map-ping {
  position: absolute; top: 38%; left: 50%; width: 16px; height: 16px;
  border-radius: 50%; border: 2px solid #1d9e75; transform: translate(-50%,-50%);
  animation: jsPing 1.8s ease-out infinite;
}
.js-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 14px; }
.js-row { display: flex; align-items: center; justify-content: space-between; }
.js-badge { font-size: 0.78rem; color: #fff; font-weight: 600; }
.js-dist { font-size: 0.72rem; color: #4fd1a5; font-weight: 600; }

/* Étape 2 — slots */
.js-slot {
  padding: 14px 0; text-align: center; border-radius: 12px; font-size: 0.82rem; font-weight: 600;
  color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
}
.js-slot-active {
  color: #fff; background: rgba(29,158,117,0.18); border-color: #1d9e75;
  animation: jsSlotPulse 0.6s ease both;
}
.js-price {
  margin-top: auto; text-align: center; font-weight: 800; font-size: 2rem; color: #fff;
  display: flex; flex-direction: column;
}
.js-price-sub { font-size: 0.68rem; font-weight: 400; color: rgba(255,255,255,0.45); margin-top: 2px; }
.js-anim-fade { animation: jsFadeUp 0.5s 0.35s cubic-bezier(0.22,1,0.36,1) both; }

/* Étape 3 — QR + casier */
.js-qr { padding: 12px; background: #fff; border-radius: 14px; }
.js-qr-grid { display: grid; grid-template-columns: repeat(7, 12px); grid-auto-rows: 12px; gap: 2px; }
.js-qr-grid span { background: transparent; border-radius: 2px; }
.js-qr-grid span.on { background: #0d1b2a; }
.js-locker {
  position: relative; width: 88px; height: 88px; border-radius: 12px;
  background: #0f2034; border: 1px solid rgba(255,255,255,0.12);
  display: grid; place-items: center; perspective: 500px;
}
.js-locker-content { font-size: 2rem; }
.js-door {
  position: absolute; inset: 0; border-radius: 12px;
  background: linear-gradient(135deg, #24405c, #16304a); border: 1px solid rgba(255,255,255,0.14);
  transform-origin: left center; backface-visibility: hidden;
  display: flex; align-items: center; justify-content: flex-end; padding-right: 8px;
}
.js-door-handle { width: 4px; height: 26px; border-radius: 4px; background: rgba(255,255,255,0.5); }
.js-door-open { transform: rotateY(-105deg); }
.js-anim-door { animation: jsDoor 0.9s 0.5s cubic-bezier(0.5,0,0.2,1) both; }
.js-ok {
  font-weight: 700; color: #4fd1a5; font-size: 0.95rem;
}
.js-anim-pop { animation: jsPop 0.4s 1.2s cubic-bezier(0.34,1.56,0.64,1) both; }

/* Étape 4 — timer + fin */
.js-timer { width: 100%; }
.js-timer-bar { height: 8px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; }
.js-timer-fill { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #1d9e75, #4fd1a5); transform-origin: left; transform: scaleX(0.05); }
.js-timer-fill-done { transform: scaleX(1); }
.js-anim-fill { animation: jsFill 1.6s ease-out both; }
.js-done { margin-top: 8px; }
.js-anim-pop-late { animation: jsPop 0.5s 1.5s cubic-bezier(0.34,1.56,0.64,1) both; }

/* Progression */
.js-seg { flex: 1; height: 6px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; padding: 0; border: 0; cursor: pointer; }
.js-seg-fill { display: block; width: 100%; height: 100%; border-radius: 99px; background: transparent; transform-origin: left; transform: scaleX(0); transition: transform 0.3s ease; }
.js-seg-fill-active { background: #1d9e75; transform: scaleX(1); }

@keyframes jsScreenIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes jsDrop { 0% { opacity: 0; transform: translate(-50%,-180%); } 60% { opacity: 1; } 100% { opacity: 1; transform: translate(-50%,-100%); } }
@keyframes jsPing { 0% { opacity: 0.7; transform: translate(-50%,-50%) scale(0.6); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(3.4); } }
@keyframes jsSlotPulse { 0% { transform: scale(0.94); } 60% { transform: scale(1.04); } 100% { transform: scale(1); } }
@keyframes jsFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes jsDoor { from { transform: rotateY(0deg); } to { transform: rotateY(-105deg); } }
@keyframes jsPop { 0% { opacity: 0; transform: scale(0.6); } 100% { opacity: 1; transform: scale(1); } }
@keyframes jsFill { from { transform: scaleX(0.05); } to { transform: scaleX(1); } }

@media (prefers-reduced-motion: reduce) {
  .js-stage-anim, .js-anim-drop, .js-anim-fade, .js-anim-door, .js-anim-pop,
  .js-anim-pop-late, .js-anim-fill, .js-map-ping, .js-slot-active { animation: none !important; }
}
`
