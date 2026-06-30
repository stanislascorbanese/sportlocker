/**
 * Concat conditionnel de classes Tailwind (équivalent clsx minimal).
 * Filtre les valeurs falsy et joint avec un espace.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
