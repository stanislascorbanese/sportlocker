import { useEffect, useRef, useState } from 'react'

// Scène scroll-driven immersive (« en conditions réelles ») pour /comment-ca-marche.
// Îlot React monté en client:visible. Zéro dépendance d'animation : on calcule la
// progression de scroll maison (getBoundingClientRect vs viewport), throttlée en
// requestAnimationFrame, puis on pilote des CSS variables. On n'anime QUE transform
// et opacity (60fps composités). prefers-reduced-motion → scène statique lisible
// (casier ouvert, matériel visible, équipements posés, sans sticky ni parallax).

// Couches d'équipements sport en parallaxe. `depth` = vitesse relative (plus grand
// = bouge plus vite, donc « plus proche »). `spin` = degrés de rotation sur 0→1.
interface Equip {
  emoji: string
  label: string
  // position de départ en % du viewport sticky
  x: number
  y: number
  depth: number
  spin: number
  size: number
}

const EQUIP: Equip[] = [
  { emoji: '⚽', label: 'ballon de foot', x: 8, y: 18, depth: 1.0, spin: 220, size: 64 },
  { emoji: '🏀', label: 'ballon de basket', x: 82, y: 24, depth: 1.6, spin: -260, size: 72 },
  { emoji: '🎾', label: 'balle de tennis', x: 16, y: 72, depth: 2.2, spin: 320, size: 46 },
  { emoji: '🥏', label: 'frisbee', x: 86, y: 70, depth: 2.8, spin: -360, size: 54 },
  { emoji: '🏓', label: 'raquette de ping-pong', x: 70, y: 12, depth: 0.7, spin: 180, size: 50 },
  { emoji: '🏸', label: 'volant de badminton', x: 30, y: 8, depth: 1.3, spin: -200, size: 44 },
]

interface Caption {
  // borne basse de progression (0→1) à partir de laquelle la légende s'affiche
  from: number
  kicker: string
  title: string
}

const CAPTIONS: Caption[] = [
  { from: 0, kicker: 'Étape 1', title: 'Je scanne mon QR' },
  { from: 0.42, kicker: 'Étape 2', title: 'Le casier s’ouvre' },
  { from: 0.78, kicker: 'Étape 3', title: 'Je joue' },
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

// clamp + easing utilitaires (pas de dépendance)
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
// sous-progression entre deux bornes, clampée
const range = (v: number, a: number, b: number): number => clamp01((v - a) / (b - a))
const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

export default function ImmersiveLocker(): JSX.Element {
  const reduced = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [captionIdx, setCaptionIdx] = useState(0)

  useEffect(() => {
    // En reduced-motion : aucune écoute scroll. La scène est figée à l'état
    // « ouvert » via la classe il-static appliquée plus bas, et on montre la
    // dernière légende (la plus informative) statiquement.
    if (reduced) {
      setCaptionIdx(CAPTIONS.length - 1)
      return
    }

    const scrollEl = scrollRef.current
    const stageEl = stageRef.current
    if (!scrollEl || !stageEl) return

    let lastCaption = -1
    let willChangeSet = false

    const apply = (): void => {
      rafRef.current = null
      const rect = scrollEl.getBoundingClientRect()
      const vh = window.innerHeight
      // progression : 0 quand le haut de la zone atteint le haut du viewport,
      // 1 quand le bas de la zone (moins un viewport sticky) l'a traversé.
      const travel = rect.height - vh
      const raw = travel > 0 ? -rect.top / travel : 0
      const p = clamp01(raw)

      // will-change posé pendant la traversée active, retiré aux extrémités.
      const active = p > 0.001 && p < 0.999
      if (active && !willChangeSet) {
        stageEl.style.willChange = 'transform'
        willChangeSet = true
      } else if (!active && willChangeSet) {
        stageEl.style.willChange = 'auto'
        willChangeSet = false
      }

      // Variables pilotant les transforms en CSS (cf. <style>).
      // Ouverture des portes : commence après le « scan », finit avant la fin.
      const doorP = easeInOut(range(p, 0.3, 0.82))
      // Onde QR : pulse d'intensité maximale juste avant l'ouverture.
      const scanP = range(p, 0.04, 0.34)
      // Halo néon : monte avec l'ouverture.
      const glowP = range(p, 0.34, 0.92)
      stageEl.style.setProperty('--p', p.toFixed(4))
      stageEl.style.setProperty('--door', doorP.toFixed(4))
      stageEl.style.setProperty('--scan', scanP.toFixed(4))
      stageEl.style.setProperty('--glow', glowP.toFixed(4))

      // Légende synchronisée
      let idx = 0
      for (let i = 0; i < CAPTIONS.length; i++) {
        if (p >= CAPTIONS[i].from) idx = i
      }
      if (idx !== lastCaption) {
        lastCaption = idx
        setCaptionIdx(idx)
      }
    }

    const onScroll = (): void => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
      if (stageEl) stageEl.style.willChange = 'auto'
    }
  }, [reduced])

  const caption = CAPTIONS[captionIdx]

  return (
    <div ref={scrollRef} className={reduced ? 'il-scroll il-static' : 'il-scroll'}>
      <div className="il-sticky">
        <div ref={stageRef} className="il-stage" role="img" aria-label="Un usager scanne son QR code, le casier SportLocker s’ouvre et révèle le matériel sportif.">
          {/* Couches de parallaxe : équipements sportifs en profondeur */}
          <div className="il-parallax" aria-hidden="true">
            {EQUIP.map((e) => (
              <span
                key={e.emoji}
                className="il-equip"
                style={
                  {
                    left: `${e.x}%`,
                    top: `${e.y}%`,
                    fontSize: `${e.size}px`,
                    ['--depth' as string]: e.depth.toString(),
                    ['--spin' as string]: `${e.spin}deg`,
                  } as React.CSSProperties
                }
              >
                {e.emoji}
              </span>
            ))}
          </div>

          {/* Halo néon derrière le casier */}
          <div className="il-halo" aria-hidden="true" />

          {/* Casier central + ouverture des portes */}
          <div className="il-locker" aria-hidden="true">
            <div className="il-interior">
              <span className="il-item il-item-1">⚽</span>
              <span className="il-item il-item-2">🎾</span>
              <span className="il-item il-item-3">🥏</span>
              <span className="il-shelf" />
            </div>
            <div className="il-door il-door-l">
              <span className="il-handle" />
            </div>
            <div className="il-door il-door-r">
              <span className="il-handle" />
            </div>
          </div>

          {/* Téléphone + onde de scan QR qui « atteint » le casier */}
          <div className="il-phone" aria-hidden="true">
            <div className="il-phone-screen">
              <div className="il-qr">
                <span /><span /><span /><span /><span /><span /><span /><span /><span />
              </div>
            </div>
            <div className="il-wave" />
            <div className="il-wave il-wave-2" />
          </div>

          {/* Légende synchronisée */}
          <div className="il-caption">
            <div className="il-caption-kicker">{caption.kicker}</div>
            <div key={caption.title} className={reduced ? 'il-caption-title' : 'il-caption-title il-caption-anim'}>
              {caption.title}
            </div>
            {reduced && (
              <p className="il-caption-static">
                Le QR ouvre le casier, le matériel est prêt à jouer.
              </p>
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: css }} />
    </div>
  )
}

const css = `
.il-scroll {
  position: relative;
  height: 210vh;
}
.il-sticky {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.il-stage {
  position: relative;
  width: 100%;
  max-width: 1160px;
  height: min(80vh, 620px);
  margin: 0 auto;
  perspective: 1400px;
  --p: 0; --door: 0; --scan: 0; --glow: 0;
}

/* ---- Parallaxe équipements ---- */
.il-parallax { position: absolute; inset: 0; pointer-events: none; }
.il-equip {
  position: absolute;
  display: block;
  line-height: 1;
  filter: drop-shadow(0 14px 22px rgba(0,0,0,0.45));
  /* translate vertical proportionnel à la profondeur (déjà clampé 0→1) + rotation.
     translate3d force la compositing GPU. */
  transform:
    translate3d(
      calc((var(--p) - 0.5) * var(--depth) * -36px),
      calc((var(--p) - 0.5) * var(--depth) * -260px),
      0
    )
    rotate(calc(var(--p) * var(--spin)));
  opacity: calc(0.35 + var(--depth) * 0.18);
}

/* ---- Halo néon ---- */
.il-halo {
  position: absolute;
  left: 50%; top: 50%;
  width: 520px; height: 520px;
  transform: translate3d(-50%, -50%, 0) scale(calc(0.6 + var(--glow) * 0.7));
  background: radial-gradient(circle, rgba(43,194,149,0.55) 0%, rgba(29,158,117,0.18) 38%, transparent 68%);
  opacity: calc(var(--glow) * 0.9);
  border-radius: 50%;
}

/* ---- Casier central ---- */
.il-locker {
  position: absolute;
  left: 50%; top: 50%;
  width: 280px; height: 360px;
  transform: translate3d(-50%, -50%, 0);
  transform-style: preserve-3d;
}
.il-interior {
  position: absolute; inset: 0;
  border-radius: 18px;
  background: linear-gradient(160deg, #0b1622, #16304a);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: inset 0 6px 30px rgba(0,0,0,0.6);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.il-shelf {
  position: absolute; left: 12%; right: 12%; top: 52%; height: 6px;
  border-radius: 4px;
  background: rgba(255,255,255,0.12);
}
.il-item {
  position: absolute;
  font-size: 56px;
  filter: drop-shadow(0 10px 16px rgba(0,0,0,0.55));
  /* léger « rebond » des items à mesure que les portes s'ouvrent */
  transform: translate3d(0, calc((1 - var(--door)) * 24px), 0) scale(calc(0.7 + var(--door) * 0.3));
  opacity: var(--door);
}
.il-item-1 { left: 28%; top: 22%; }
.il-item-2 { right: 24%; top: 30%; font-size: 40px; }
.il-item-3 { left: 38%; top: 58%; font-size: 44px; }

.il-door {
  position: absolute; top: 0; bottom: 0; width: 50%;
  background: linear-gradient(150deg, #24405c, #14283d);
  border: 1px solid rgba(255,255,255,0.14);
  backface-visibility: hidden;
  display: flex; align-items: center;
}
.il-door-l {
  left: 0; border-radius: 18px 4px 4px 18px;
  transform-origin: left center;
  transform: rotateY(calc(var(--door) * -112deg));
  justify-content: flex-end;
  box-shadow: 8px 0 24px rgba(0,0,0,0.35);
}
.il-door-r {
  right: 0; border-radius: 4px 18px 18px 4px;
  transform-origin: right center;
  transform: rotateY(calc(var(--door) * 112deg));
  justify-content: flex-start;
  box-shadow: -8px 0 24px rgba(0,0,0,0.35);
}
.il-handle {
  width: 5px; height: 44px; border-radius: 4px;
  background: rgba(255,255,255,0.55);
  margin: 0 12px;
}

/* ---- Téléphone + onde de scan ---- */
.il-phone {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate3d(calc(-50% - 260px), calc(-50% + 40px), 0);
  width: 92px; height: 180px;
  border-radius: 18px;
  background: linear-gradient(160deg, #1b2a3d, #0d1b2a);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
  display: grid; place-items: center;
}
.il-phone-screen {
  width: 76px; height: 150px; border-radius: 12px;
  background: radial-gradient(120% 80% at 50% 0%, #16304a, #0d1b2a);
  display: grid; place-items: center;
}
.il-qr {
  width: 48px; height: 48px; padding: 5px; border-radius: 8px; background: #fff;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px;
}
.il-qr span { background: #0d1b2a; border-radius: 2px; }
.il-qr span:nth-child(2), .il-qr span:nth-child(4), .il-qr span:nth-child(9) { background: transparent; }
.il-wave {
  position: absolute; left: 70%; top: 50%;
  width: 60px; height: 60px; border-radius: 50%;
  border: 2px solid rgba(43,194,149,0.8);
  transform: translate3d(0, -50%, 0) scale(calc(0.3 + var(--scan) * 5));
  opacity: calc((1 - var(--scan)) * 0.9);
}
.il-wave-2 {
  transform: translate3d(0, -50%, 0) scale(calc(0.3 + var(--scan) * 8));
  opacity: calc((1 - var(--scan)) * 0.5);
}

/* ---- Légende ---- */
.il-caption {
  position: absolute;
  left: 50%; bottom: 4%;
  transform: translateX(-50%);
  text-align: center;
  width: max-content;
  max-width: 90%;
}
.il-caption-kicker {
  font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: #2BC295; margin-bottom: 6px;
}
.il-caption-title {
  font-weight: 800; font-size: clamp(1.4rem, 3vw, 2.2rem); color: #fff;
}
.il-caption-anim { animation: ilCaptionIn 0.45s cubic-bezier(0.22,1,0.36,1) both; }
.il-caption-static {
  margin-top: 10px; color: rgba(255,255,255,0.6); font-weight: 300;
  font-size: 0.95rem; max-width: 28rem;
}

@keyframes ilCaptionIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

/* ---- Mobile : amplitude réduite, pas de débordement horizontal ---- */
@media (max-width: 767px) {
  .il-scroll { height: 170vh; }
  .il-stage { height: min(76vh, 520px); }
  .il-locker { width: 210px; height: 280px; }
  .il-halo { width: 360px; height: 360px; }
  .il-phone {
    width: 64px; height: 126px;
    transform: translate3d(calc(-50% - 130px), calc(-50% + 96px), 0);
  }
  .il-phone-screen { width: 52px; height: 102px; }
  .il-qr { width: 34px; height: 34px; }
  /* parallaxe : amplitude divisée pour rester contenue dans l'écran */
  .il-equip {
    transform:
      translate3d(
        calc((var(--p) - 0.5) * var(--depth) * -16px),
        calc((var(--p) - 0.5) * var(--depth) * -140px),
        0
      )
      rotate(calc(var(--p) * var(--spin) * 0.6));
  }
}

/* ---- prefers-reduced-motion / état statique : casier ouvert figé ---- */
.il-static .il-sticky { position: relative; height: auto; padding: 4rem 0; }
.il-static .il-stage { --p: 0.5; --door: 1; --scan: 1; --glow: 1; }
.il-static .il-equip { transform: rotate(0deg); }
.il-static .il-wave, .il-static .il-wave-2 { display: none; }

@media (prefers-reduced-motion: reduce) {
  .il-sticky { position: relative; height: auto; padding: 4rem 0; }
  .il-stage { --p: 0.5; --door: 1; --scan: 1; --glow: 1; }
  .il-equip { transform: rotate(0deg) !important; }
  .il-wave, .il-wave-2 { display: none; }
  .il-caption-anim { animation: none !important; }
}
`
