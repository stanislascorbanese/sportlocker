/**
 * Parseur SQL maison — splitte un fichier en statements individuels sur les
 * `;` *en fin de statement*, en évitant les `;` à l'intérieur des contextes
 * "non-terminables" : strings, identifiers quotés, dollar-quotes, commentaires.
 *
 * POURQUOI MAISON ?
 *   - Zéro dépendance : règle interne du repo.
 *   - Suffisant pour notre flavor de SQL Postgres (cf. database/migrations/*).
 *   - Comportement déterministe → testable unitairement (cf. test/scripts/migrate.test.ts).
 *
 * Contextes trackés :
 *   - Commentaire ligne `-- ... \n`
 *   - Commentaire bloc `/* ... *\/` (Postgres autorise le nesting → on track le depth)
 *   - String single-quote `'...'` avec échappement standard SQL `''`
 *   - Identifier double-quote `"..."` avec échappement `""`
 *   - Dollar-quote `$tag$ ... $tag$` (le tag peut être vide ou nommé)
 *
 * Le splitteur ne touche pas au contenu des statements : les commentaires et
 * espaces sont conservés à l'intérieur. On filtre simplement les statements
 * vides (whitespace + commentaires uniquement) car postgres-js rejette les
 * Simple Queries vides.
 *
 * NB : on reconnaît le séparateur uniquement comme `;` au top-level. Les
 * fonctions PL/pgSQL contiennent des `;` internes mais ils vivent dans une
 * dollar-quote (`AS $$ ... $$`), donc le parseur les ignore correctement.
 *
 * @param {string} text  Contenu brut d'un fichier .sql
 * @returns {string[]}   Liste des statements (sans `;` final), filtrés non-vides.
 */
export function parseStatements(text) {
  /** @type {string[]} */
  const out = []
  let buf = ''
  const len = text.length
  let i = 0

  // Contextes mutuellement exclusifs (sauf comment-bloc qui s'imbrique).
  let inLineComment = false
  let blockCommentDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  /** @type {string | null} Tag complet incluant les `$`, ex: "$$" ou "$body$" */
  let dollarTag = null

  while (i < len) {
    const c = text[i]
    const next = i + 1 < len ? text[i + 1] : ''

    // Sortie d'un commentaire ligne sur fin de ligne (\n ou \r).
    if (inLineComment) {
      buf += c
      if (c === '\n' || c === '\r') {
        inLineComment = false
      }
      i++
      continue
    }

    // Sortie / nesting d'un commentaire bloc.
    if (blockCommentDepth > 0) {
      buf += c
      if (c === '*' && next === '/') {
        buf += next
        i += 2
        blockCommentDepth--
        continue
      }
      if (c === '/' && next === '*') {
        buf += next
        i += 2
        blockCommentDepth++
        continue
      }
      i++
      continue
    }

    // À l'intérieur d'une dollar-quote → on cherche la séquence fermante
    // identique au tag d'ouverture (case-sensitive d'après la doc Postgres).
    if (dollarTag !== null) {
      // Match littéral du tag fermant.
      if (c === '$' && text.startsWith(dollarTag, i)) {
        buf += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      buf += c
      i++
      continue
    }

    // À l'intérieur d'une string single-quote.
    if (inSingleQuote) {
      buf += c
      if (c === "'") {
        // Échappement SQL standard : '' représente un quote littéral.
        if (next === "'") {
          buf += next
          i += 2
          continue
        }
        inSingleQuote = false
      }
      i++
      continue
    }

    // À l'intérieur d'un identifier double-quote.
    if (inDoubleQuote) {
      buf += c
      if (c === '"') {
        if (next === '"') {
          // "" → quote littéral dans un identifier.
          buf += next
          i += 2
          continue
        }
        inDoubleQuote = false
      }
      i++
      continue
    }

    // Top-level : on examine les ouvertures de contextes.

    // Commentaire ligne `--`
    if (c === '-' && next === '-') {
      buf += c + next
      i += 2
      inLineComment = true
      continue
    }

    // Commentaire bloc `/* ... */` (avec nesting Postgres).
    if (c === '/' && next === '*') {
      buf += c + next
      i += 2
      blockCommentDepth = 1
      continue
    }

    // Ouverture d'une dollar-quote. Le tag est une suite [A-Za-z_][A-Za-z0-9_]*
    // (ou vide pour `$$`) suivie d'un `$` fermant. Si rien ne matche on
    // considère le `$` comme un caractère banal (ex: paramètre `$1`).
    if (c === '$') {
      const tag = tryReadDollarTag(text, i)
      if (tag !== null) {
        buf += tag
        i += tag.length
        dollarTag = tag
        continue
      }
      buf += c
      i++
      continue
    }

    // Ouverture d'une string single-quote.
    if (c === "'") {
      buf += c
      i++
      inSingleQuote = true
      continue
    }

    // Ouverture d'un identifier double-quote.
    if (c === '"') {
      buf += c
      i++
      inDoubleQuote = true
      continue
    }

    // Séparateur top-level → on flush le statement courant.
    if (c === ';') {
      // On n'inclut PAS le `;` dans le buffer pushé : Postgres l'accepte
      // mais le driver le voit comme une fin de simple query sans contenu
      // additionnel. Plus propre.
      pushIfNonEmpty(out, buf)
      buf = ''
      i++
      continue
    }

    // Caractère banal.
    buf += c
    i++
  }

  // Statement trailing sans `;` final (ex: fichier qui se termine par un
  // CREATE FUNCTION sans point-virgule terminal — peu courant mais légal).
  pushIfNonEmpty(out, buf)

  return out
}

/**
 * Tente de lire un tag de dollar-quote à la position `i` (qui doit pointer
 * sur un `$`). Retourne le tag *complet* (incluant les deux `$`) ou null si
 * le `$` ne démarre pas une dollar-quote (typiquement un placeholder `$1`).
 *
 * @param {string} text
 * @param {number} i  Position du `$` initial
 * @returns {string | null}
 */
function tryReadDollarTag(text, i) {
  // Lit la suite de caractères de tag autorisés après le `$` initial.
  let j = i + 1
  while (j < text.length) {
    const ch = text[j]
    const isTagChar =
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '_'
    if (!isTagChar) break
    j++
  }
  // Premier caractère du tag ne peut PAS être un chiffre (sinon `$1`, `$2`
  // sont des placeholders et pas des dollar-quotes).
  const tagBody = text.slice(i + 1, j)
  if (tagBody.length > 0) {
    const first = tagBody.charCodeAt(0)
    const isDigit = first >= 48 && first <= 57
    if (isDigit) return null
  }
  // Fermeture du tag par un `$`.
  if (text[j] !== '$') return null
  return text.slice(i, j + 1) // inclut les deux `$`
}

/**
 * @param {string[]} out
 * @param {string} stmt
 */
function pushIfNonEmpty(out, stmt) {
  // Considéré "vide" si après strip des commentaires/whitespace, il ne reste
  // rien. On ne fait pas ce strip nous-même : on délègue à une regex simple
  // qui retire les commentaires ligne et bloc, plus le whitespace.
  const stripped = stripCommentsAndWhitespace(stmt)
  if (stripped.length === 0) return
  out.push(stmt)
}

/**
 * Strip naïf de commentaires + whitespace pour détecter les statements vides.
 * Ne pas utiliser pour autre chose : le full parsing reste celui de parseStatements.
 *
 * @param {string} s
 * @returns {string}
 */
function stripCommentsAndWhitespace(s) {
  let out = ''
  let i = 0
  let inLine = false
  let blockDepth = 0
  while (i < s.length) {
    const c = s[i]
    const n = i + 1 < s.length ? s[i + 1] : ''
    if (inLine) {
      if (c === '\n' || c === '\r') inLine = false
      i++
      continue
    }
    if (blockDepth > 0) {
      if (c === '*' && n === '/') {
        i += 2
        blockDepth--
        continue
      }
      if (c === '/' && n === '*') {
        i += 2
        blockDepth++
        continue
      }
      i++
      continue
    }
    if (c === '-' && n === '-') {
      i += 2
      inLine = true
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      blockDepth = 1
      continue
    }
    out += c
    i++
  }
  return out.trim()
}
