import type { ItemKind } from '@/lib/contract'

/**
 * Pictogrammes du matériel.
 *
 * Dessins au trait, volontairement simples : ils sont lus à bout de bras, en
 * plein soleil, par quelqu'un qui ne cherche pas à les admirer. Le libellé
 * texte reste l'information principale — le glyphe sert à repérer la bonne
 * tuile d'un coup d'œil.
 *
 * Contrainte de dessin : chaque forme doit rester reconnaissable en 24 px et
 * ne ressembler à rien d'autre. Une première version faisait passer le ballon
 * pour un globe terrestre et la raquette pour une loupe — d'où la découpe des
 * ballons en trois motifs distincts, et un manche de raquette plus long que
 * la tête.
 */

const paths: Record<ItemKind, React.ReactNode> = {
  // Ballon de football : pentagone central et coutures qui rayonnent.
  ballon: (
    <>
      <circle cx="24" cy="24" r="17" />
      <path d="M24 17l6.7 4.8-2.6 7.9h-8.2l-2.6-7.9z" />
      <path d="M24 17V7M30.7 21.8l9.5-3M28.1 29.7l5.9 8M19.9 29.7l-5.9 8M17.3 21.8l-9.5-3" />
    </>
  ),
  // Ballon de basket : les deux axes et les deux arcs latéraux.
  basket: (
    <>
      <circle cx="24" cy="24" r="17" />
      <path d="M24 7v34M7 24h34" />
      <path d="M12 11c7 7 7 19 0 26M36 11c-7 7-7 19 0 26" />
    </>
  ),
  // Ballon de volley : trois courbes qui s'enroulent.
  volley: (
    <>
      <circle cx="24" cy="24" r="17" />
      <path d="M10 16c10 2 17 10 19 21" />
      <path d="M24 7c-6 9-8 20-4 32" />
      <path d="M40 21c-11-3-22 2-27 12" />
    </>
  ),
  // Raquette : tête haute, cordage, et un manche plus long que la tête.
  raquette: (
    <>
      <ellipse cx="19" cy="16" rx="9" ry="12" />
      <path d="M12 12h14M12 21h14M15 5v22M23 5v22" />
      <path d="M19 28l6 15" />
      <path d="M21 37l5 2" />
    </>
  ),
  // Frisbee vu de trois quarts.
  disque: (
    <>
      <ellipse cx="24" cy="27" rx="18" ry="7" />
      <path d="M6 27c0-6 8-9 18-9s18 3 18 9" />
      <ellipse cx="24" cy="25" rx="8" ry="3" />
    </>
  ),
  // Cône de marquage.
  plot: (
    <>
      <path d="M24 8l10 28H14z" />
      <path d="M8 40h32" />
      <path d="M18 27h12" />
    </>
  ),
  // Corde à sauter.
  corde: (
    <>
      <path d="M13 13v6M35 13v6" />
      <path d="M13 19c0 14 5 20 11 20s11-6 11-20" />
      <path d="M11 9h4M33 9h4" />
    </>
  ),
  // Jeu de boules.
  boule: (
    <>
      <circle cx="18" cy="29" r="10" />
      <circle cx="34" cy="32" r="7" />
      <circle cx="30" cy="15" r="4" />
    </>
  ),
  autre: (
    <>
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
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[kind] ?? paths.autre}
    </svg>
  )
}
