/**
 * Lecture d'un export de séjours issu d'un PMS de camping.
 *
 * Le site promet « rien à changer dans votre logiciel ». La contrepartie, c'est
 * qu'on reçoit ce que le PMS veut bien exporter : un CSV dont on ne maîtrise ni
 * le séparateur, ni l'ordre des colonnes, ni leur intitulé, ni le format de
 * date, ni l'encodage. eSeason, Naxi et Secureholiday n'écrivent pas la même
 * chose, et le même logiciel n'écrit pas la même chose d'une version à l'autre.
 *
 * Ce module ne fait donc aucune hypothèse et ne jette rien : il rend les lignes
 * comprises, les lignes rejetées avec leur numéro et la raison, et l'entête tel
 * qu'il a été interprété. C'est ce qui permet à l'écran d'import de montrer un
 * aperçu avant d'écrire quoi que ce soit — un gérant qui voit « 142 séjours,
 * 3 lignes ignorées » corrige son export ; un gérant qui voit « erreur » appelle.
 *
 * Volontairement sans dépendance : les bibliothèques CSV généralistes gèrent
 * des cas (quotes multilignes exotiques, dialectes) qu'un export de PMS ne
 * produit pas, et aucune ne résout le vrai problème, qui est le nommage des
 * colonnes.
 */

export interface ParsedStay {
  stayRef: string
  lastName: string
  firstName: string | null
  arrivesOn: string
  departsOn: string
}

export interface RejectedRow {
  line: number
  reason:
    | 'missing_stay_ref'
    | 'missing_last_name'
    | 'bad_arrival_date'
    | 'bad_departure_date'
    | 'departure_before_arrival'
  raw: string
}

export interface ParseResult {
  rows: ParsedStay[]
  rejected: RejectedRow[]
  /** Colonnes reconnues, pour affichage : « emplacement → n° de séjour ». */
  mapping: Record<string, string>
  /** Entêtes qu'on n'a pas su rattacher — affichés pour information. */
  ignoredColumns: string[]
  separator: string
}

/** Normalise un entête : minuscules, sans accents, sans ponctuation. */
function normalizeHeader(value: string): string {
  return value
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Rattachement d'un entête à un champ. L'ordre compte : on teste du plus
 * spécifique au plus vague, sinon « date » attraperait aussi bien l'arrivée
 * que le départ.
 */
const HEADER_RULES: { field: keyof ParsedStay; patterns: RegExp[] }[] = [
  {
    field: 'arrivesOn',
    patterns: [/arriv/, /debut sejour/, /^debut$/, /date d entree/, /check in/, /checkin/, /^du$/],
  },
  {
    field: 'departsOn',
    patterns: [/depart/, /fin sejour/, /^fin$/, /date de sortie/, /check out/, /checkout/, /^au$/],
  },
  {
    field: 'stayRef',
    patterns: [
      /emplacement/, /^empl/, /parcelle/, /^n *emp/, /reservation/, /^resa/,
      /dossier/, /^ref/, /contrat/, /sejour/,
    ],
  },
  {
    field: 'firstName',
    patterns: [/prenom/, /first *name/],
  },
  {
    field: 'lastName',
    patterns: [/^nom$/, /nom de famille/, /nom client/, /nom du client/, /titulaire/, /last *name/, /^client$/, /^nom/],
  },
]

function matchHeader(header: string): keyof ParsedStay | null {
  const h = normalizeHeader(header)
  if (!h) return null
  for (const rule of HEADER_RULES) {
    if (rule.patterns.some((p) => p.test(h))) return rule.field
  }
  return null
}

/**
 * Devine le séparateur en comptant les occurrences hors guillemets sur la
 * première ligne. Le point-virgule gagne les égalités : c'est ce que produit un
 * Excel configuré en français, et donc l'immense majorité des exports reçus.
 */
export function detectSeparator(firstLine: string): string {
  const counts = [';', ',', '\t', '|'].map((sep) => {
    let n = 0
    let inQuotes = false
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === sep && !inQuotes) n++
    }
    return { sep, n }
  })
  const best = counts.reduce((a, b) => (b.n > a.n ? b : a))
  return best.n > 0 ? best.sep : ';'
}

/** Découpe une ligne en respectant les guillemets et les `""` échappés. */
export function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

/**
 * Dates. On accepte ce qui sort réellement des PMS français :
 * 14/07/2027, 14-07-2027, 14.07.2027, 2027-07-14, et les années sur deux
 * chiffres (27 → 2027). Le format américain mm/dd n'est pas géré : un export
 * français ne le produit pas, et le deviner à partir de « 03/04 » est
 * impossible — mieux vaut rejeter la ligne que se tromper de semaine.
 */
export function parseDate(value: string): string | null {
  const v = value.trim()
  if (!v) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const fr = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(v)
  if (fr) {
    const day = Number(fr[1])
    const month = Number(fr[2])
    let year = Number(fr[3])
    if (year < 100) year += 2000
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const d = new Date(Date.UTC(year, month - 1, day))
    // Rejette le 31 février : Date « corrige » silencieusement, on le détecte
    // en relisant le jour.
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
    return d.toISOString().slice(0, 10)
  }

  return null
}

export function parseStaysCsv(input: string): ParseResult {
  const text = input.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n').filter((l) => l.trim() !== '')

  if (lines.length === 0) {
    return { rows: [], rejected: [], mapping: {}, ignoredColumns: [], separator: ';' }
  }

  const separator = detectSeparator(lines[0]!)
  const headers = splitLine(lines[0]!, separator)

  const index: Partial<Record<keyof ParsedStay, number>> = {}
  const mapping: Record<string, string> = {}
  const ignoredColumns: string[] = []

  headers.forEach((header, i) => {
    const field = matchHeader(header)
    // Première colonne gagnante : un export qui contient « Nom » puis
    // « Nom du camping » ne doit pas voir la seconde écraser la première.
    if (field && index[field] === undefined) {
      index[field] = i
      mapping[header] = field
    } else if (header.trim()) {
      ignoredColumns.push(header.trim())
    }
  })

  const rows: ParsedStay[] = []
  const rejected: RejectedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!
    const cells = splitLine(raw, separator)
    const at = (field: keyof ParsedStay): string =>
      index[field] === undefined ? '' : (cells[index[field]!] ?? '').trim()

    const stayRef = at('stayRef')
    const lastName = at('lastName')

    // +1 parce que la ligne 1 est l'entête : le numéro affiché doit être celui
    // que le gérant verra en ouvrant son fichier.
    const line = i + 1

    if (!stayRef) { rejected.push({ line, reason: 'missing_stay_ref', raw }); continue }
    if (!lastName) { rejected.push({ line, reason: 'missing_last_name', raw }); continue }

    const arrivesOn = parseDate(at('arrivesOn'))
    if (!arrivesOn) { rejected.push({ line, reason: 'bad_arrival_date', raw }); continue }

    const departsOn = parseDate(at('departsOn'))
    if (!departsOn) { rejected.push({ line, reason: 'bad_departure_date', raw }); continue }

    if (departsOn < arrivesOn) {
      rejected.push({ line, reason: 'departure_before_arrival', raw })
      continue
    }

    const firstName = at('firstName')
    rows.push({
      stayRef: stayRef.slice(0, 32),
      lastName: lastName.slice(0, 120),
      firstName: firstName ? firstName.slice(0, 120) : null,
      arrivesOn,
      departsOn,
    })
  }

  return { rows, rejected, mapping, ignoredColumns, separator }
}
