import type { ItemKind } from '@/lib/contract'

/**
 * Illustrations du matériel.
 *
 * Elles sont lues à bout de bras, en plein soleil, par quelqu'un qui ne cherche
 * pas à les admirer : chaque forme doit rester reconnaissable à 48 px et ne
 * ressembler à rien d'autre de la grille.
 *
 * Deux règles de dessin, qui expliquent la forme du code :
 *
 * 1. Le CONTOUR d'un objet REMPLI est constant (`C.encre`). Première version :
 *    il héritait de `currentColor` — et sur fond sombre le texte est blanc, donc
 *    un ballon blanc se retrouvait cerné de blanc, sans aucune définition. Un
 *    contour sombre sur un remplissage clair se lit sur n'importe quel fond.
 *    Seules les formes SANS remplissage (cordage, corde à sauter, raquette
 *    générique) gardent `currentColor` : elles n'ont que leur trait, et il doit
 *    suivre le thème.
 * 2. Le REMPLISSAGE porte la couleur réelle de l'objet, en dur. Un ballon de
 *    basket est orange dans les deux thèmes ; c'est précisément cette couleur
 *    qui permet de le repérer sans lire l'étiquette.
 *
 * Les trois ballons ont leur propre motif parce qu'ils coexistent dans un même
 * casier. Les raquettes aussi, depuis qu'on a vu à l'écran ce que donnait le
 * contraire : hors du français l'app affiche le mot générique du `kind`, donc
 * ping-pong, badminton et raquettes de plage apparaissaient en trois tuiles
 * identiques — même mot, même dessin.
 */

/* Palette des objets. Choisie pour tenir sur fond clair comme sur fond sombre :
 * rien de plus pâle que le blanc cassé, rien de plus sombre que le cuir. */
const C = {
  cuir: '#f4f6f8',      // blanc cassé du ballon de foot et du volant
  orange: '#e8722c',    // basket, cône de marquage
  bleu: '#2f7fd0',      // bandes du volley
  jaune: '#d8e04a',     // balle de tennis
  rouge: '#d9453a',     // palette de ping-pong
  bois: '#c9945c',      // manches
  acier: '#aab6c2',     // boules de pétanque
  corail: '#e0574a',    // frisbee
  encre: '#1f2a37',     // motifs qui doivent rester sombres dans les deux thèmes
}

const dessins: Record<ItemKind, React.ReactNode> = {
  // Ballon de football : pentagone plein et coutures rayonnantes.
  ballon: (
    <>
      <circle cx="24" cy="24" r="17" fill={C.cuir} />
      <path d="M24 16.5l7.1 5.2-2.7 8.4h-8.8l-2.7-8.4z" fill={C.encre} />
      <path d="M24 16.5V7M31.1 21.7l9.1-2.9M28.4 30.1l5.6 7.7M19.6 30.1L14 37.8M16.9 21.7l-9.1-2.9" />
      <circle cx="24" cy="24" r="17" stroke={C.encre} />
    </>
  ),
  // Ballon de basket : orange, deux axes et deux arcs.
  basket: (
    <>
      <circle cx="24" cy="24" r="17" fill={C.orange} />
      <path d="M24 7v34M7 24h34M12 11c7 7 7 19 0 26M36 11c-7 7-7 19 0 26" stroke={C.encre} />
      <circle cx="24" cy="24" r="17" stroke={C.encre} />
    </>
  ),
  // Ballon de volley : bandes bleues qui s'enroulent.
  volley: (
    <>
      <circle cx="24" cy="24" r="17" fill={C.cuir} />
      <path d="M10 16c10 2 17 10 19 21M24 7c-6 9-8 20-4 32M40 21c-11-3-22 2-27 12"
            stroke={C.bleu} strokeWidth="3.2" />
      <circle cx="24" cy="24" r="17" stroke={C.encre} />
    </>
  ),
  // Ping-pong : palette rouge pleine, manche court, et la balle.
  pingpong: (
    <>
      <ellipse cx="20" cy="18" rx="11" ry="12" fill={C.rouge} />
      <ellipse cx="20" cy="18" rx="11" ry="12" stroke={C.encre} />
      <path d="M20 30v9" stroke={C.bois} strokeWidth="5" />
      <path d="M20 30v9" stroke={C.encre} />
      <circle cx="37" cy="33" r="5" fill={C.cuir} />
      <circle cx="37" cy="33" r="5" stroke={C.encre} />
    </>
  ),
  // Badminton : le volant, dont la silhouette n'appartient qu'à lui.
  badminton: (
    <>
      <path d="M8 7h32l-9 22H17z" fill={C.cuir} />
      <path d="M8 7h32l-9 22H17z" stroke={C.encre} />
      <path d="M18.5 7L16 29M24 7v22M29.5 7L32 29" strokeWidth="1.5" stroke={C.encre} />
      <path d="M17 29h14a7 7 0 01-14 0z" fill={C.bois} />
      <path d="M17 29h14a7 7 0 01-14 0z" stroke={C.encre} />
    </>
  ),
  // Tennis : tête ovale large, cordage, et la balle jaune.
  tennis: (
    <>
      <ellipse cx="19" cy="17" rx="11" ry="13" fill="none" />
      <path d="M10 12h18M10 22h18M14 5v24M23 5v24" strokeWidth="1.6" />
      <ellipse cx="19" cy="17" rx="11" ry="13" />
      <path d="M19 30l5 12" strokeWidth="4" stroke={C.bois} />
      <path d="M19 30l5 12" />
      <circle cx="38" cy="36" r="6" fill={C.jaune} />
      <circle cx="38" cy="36" r="6" stroke={C.encre} />
    </>
  ),
  // Raquette générique : le repli quand on n'a pas su nommer le sport.
  raquette: (
    <>
      <ellipse cx="19" cy="16" rx="9" ry="12" />
      <path d="M12 12h14M12 21h14M15 5v22M23 5v22" strokeWidth="1.6" />
      <path d="M19 28l6 15" strokeWidth="3.6" stroke={C.bois} />
      <path d="M19 28l6 15" />
    </>
  ),
  // Frisbee vu de trois quarts.
  disque: (
    <>
      <path d="M6 27c0-6 8-10 18-10s18 4 18 10v1c0 4-8 7-18 7S6 32 6 28z" fill={C.corail} />
      <ellipse cx="24" cy="27" rx="18" ry="7" stroke={C.encre} />
      <path d="M6 27c0-6 8-10 18-10s18 4 18 10" stroke={C.encre} />
      <ellipse cx="24" cy="25" rx="7" ry="2.6" stroke={C.encre} />
    </>
  ),
  // Cône de marquage.
  plot: (
    <>
      <path d="M24 8l10 28H14z" fill={C.orange} />
      <path d="M24 8l10 28H14z" stroke={C.encre} />
      <path d="M18.5 26h11" stroke={C.encre} />
      <path d="M8 40h32" strokeWidth="3.2" />
    </>
  ),
  // Corde à sauter.
  corde: (
    <>
      <path d="M13 19c0 14 5 20 11 20s11-6 11-20" />
      <path d="M13 12v8M35 12v8" strokeWidth="5" stroke={C.bois} />
      <path d="M13 12v8M35 12v8" />
    </>
  ),
  // Jeu de boules : deux boules d'acier et le but en bois.
  boule: (
    <>
      <circle cx="18" cy="29" r="10" fill={C.acier} />
      <circle cx="18" cy="29" r="10" stroke={C.encre} />
      <circle cx="34" cy="32" r="7" fill={C.acier} />
      <circle cx="34" cy="32" r="7" stroke={C.encre} />
      <circle cx="31" cy="15" r="4" fill={C.bois} />
      <circle cx="31" cy="15" r="4" stroke={C.encre} />
    </>
  ),
  autre: (
    <>
      <rect x="9" y="13" width="30" height="22" rx="4" fill="currentColor" opacity=".08" />
      <rect x="9" y="13" width="30" height="22" rx="4" />
      <path d="M9 21h30M24 21v14" />
    </>
  ),
}

export function ItemGlyph({ kind, className }: { kind: ItemKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {dessins[kind] ?? dessins.autre}
    </svg>
  )
}
