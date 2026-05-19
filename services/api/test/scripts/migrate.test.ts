/**
 * Tests unitaires du parseur SQL utilisé par scripts/migrate.mjs pour splitter
 * un fichier de migration en statements indépendants (roundtrips séparés).
 *
 * Cible : services/api/scripts/sql-split.mjs (parseStatements)
 *
 * On NE tient PAS à exécuter du vrai SQL ici — la couverture est purement
 * lexicale. Les cas tordus visés :
 *   - Commentaires ligne `--` et bloc `/* *\/` (nesting Postgres compris)
 *   - Strings single-quote avec échappement `''`
 *   - Identifiers double-quote
 *   - Dollar-quotes `$$`, `$body$`, etc.
 *   - Placeholders `$1`, `$2` (ne doivent PAS être confondus avec dollar-quotes)
 *   - Semicolons à l'intérieur de strings / dollar-quotes / commentaires
 *   - Statements vides (whitespace + commentaires only)
 *   - Reconstitution de la migration 0004 originale (ALTER TYPE + UPDATE)
 *     qui crashait en transaction batch.
 */
import { describe, expect, it } from 'vitest'
// On importe directement le module .mjs — vitest le résout via Node ESM.
// @ts-expect-error pas de types pour le .mjs maison, c'est du JS pur testé via comportement.
import { parseStatements } from '../../scripts/sql-split.mjs'

const split = (s: string): string[] => parseStatements(s) as string[]

describe('parseStatements', () => {
  it('splitte un SQL trivial sur les semicolons', () => {
    const out = split('SELECT 1; SELECT 2; SELECT 3;')
    expect(out).toHaveLength(3)
    expect(out[0].trim()).toBe('SELECT 1')
    expect(out[1].trim()).toBe('SELECT 2')
    expect(out[2].trim()).toBe('SELECT 3')
  })

  it('gère un statement sans `;` final', () => {
    const out = split('SELECT 1')
    expect(out).toHaveLength(1)
    expect(out[0].trim()).toBe('SELECT 1')
  })

  it('filtre les statements vides (whitespace + commentaires)', () => {
    const out = split(`
      -- header comment
      ;
      ;
      SELECT 1;
      -- trailing
      ;
    `)
    expect(out).toHaveLength(1)
    expect(out[0].trim()).toContain('SELECT 1')
  })

  it("ignore les `;` dans une string single-quote", () => {
    const out = split(`SELECT 'foo; bar; baz'; SELECT 2;`)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain("'foo; bar; baz'")
    expect(out[1].trim()).toBe('SELECT 2')
  })

  it("gère l'échappement standard '' à l'intérieur d'une string", () => {
    // 'it''s; tricky' → littéral "it's; tricky" — le `;` est à l'intérieur.
    const out = split(`SELECT 'it''s; tricky'; SELECT 2;`)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain("'it''s; tricky'")
  })

  it("ignore les `;` dans un identifier double-quote", () => {
    const out = split(`SELECT 1 AS "weird;name"; SELECT 2;`)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('"weird;name"')
  })

  it("gère l'échappement '' dans un identifier double-quote", () => {
    const out = split(`SELECT 1 AS "a""b;c"; SELECT 2;`)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('"a""b;c"')
  })

  it("ignore les `;` dans un commentaire ligne `--`", () => {
    const out = split(`SELECT 1; -- inline; comment\nSELECT 2;`)
    expect(out).toHaveLength(2)
    expect(out[0].trim()).toBe('SELECT 1')
    expect(out[1]).toContain('SELECT 2')
  })

  it("ignore les `;` dans un commentaire bloc `/* */`", () => {
    const out = split(`SELECT 1 /* foo; bar; baz */; SELECT 2;`)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('/* foo; bar; baz */')
  })

  it('supporte le nesting des commentaires bloc (Postgres autorise)', () => {
    const out = split(`SELECT 1 /* outer /* inner; */ still-comment; */; SELECT 2;`)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('inner;')
    expect(out[1].trim()).toBe('SELECT 2')
  })

  it("ignore les `;` dans une dollar-quote $$ ... $$", () => {
    const src = `
      CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$
        SELECT 1; SELECT 2;
      $$;
      SELECT 99;
    `
    const out = split(src)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('SELECT 1; SELECT 2;')
    expect(out[0]).toContain('$$')
    expect(out[1].trim()).toBe('SELECT 99')
  })

  it('ignore les `;` dans une dollar-quote nommée $body$', () => {
    const src = `
      DO $body$
      BEGIN
        RAISE NOTICE 'hi;there';
        PERFORM 1;
      END
      $body$;
      SELECT 42;
    `
    const out = split(src)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain("RAISE NOTICE 'hi;there'")
    expect(out[1].trim()).toBe('SELECT 42')
  })

  it('NE traite PAS $1, $2 comme des dollar-quotes (placeholders)', () => {
    const out = split(`SELECT $1; SELECT $2;`)
    expect(out).toHaveLength(2)
    expect(out[0].trim()).toBe('SELECT $1')
    expect(out[1].trim()).toBe('SELECT $2')
  })

  it("reconnaît un tag dollar-quote vide ($$) côté ouverture ET fermeture", () => {
    // Pas de mélange : $$ ouvre, $$ ferme. $body$ n'ouvre ni ne ferme un $$.
    const src = `
      SELECT $$start $body$ inside $body$ end$$;
      SELECT 2;
    `
    const out = split(src)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('$$start $body$ inside $body$ end$$')
  })

  it("matche le tag de fermeture exact (case-sensitive)", () => {
    // $A$ n'est PAS fermé par $a$ — donc le `;` au milieu reste dans la dollar-quote.
    const src = `SELECT $A$ foo $a$ bar; baz $A$; SELECT 2;`
    const out = split(src)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('bar; baz')
  })

  it('reconstitue la migration 0004 originale (ALTER TYPE + UPDATE) en 3 statements', () => {
    // Avant le split d'urgence en 0004 + 0005, le contenu de 0004 était :
    const sqlOriginal = `
      -- 0004_admin_multi_tenant.sql (version originale, avant split)
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
      UPDATE users SET role = 'super_admin' WHERE role = 'admin';
      UPDATE users SET role = 'admin' WHERE role = 'operator';
    `
    const out = split(sqlOriginal)
    expect(out).toHaveLength(3)
    expect(out[0]).toMatch(/ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'/)
    expect(out[1]).toMatch(/UPDATE users SET role = 'super_admin' WHERE role = 'admin'/)
    expect(out[2]).toMatch(/UPDATE users SET role = 'admin' WHERE role = 'operator'/)
  })

  it('parse un fichier mixant tous les cas tordus', () => {
    const src = `
      -- top-level comment with ; semicolon
      /* block /* nested; */ done */
      ALTER TABLE foo ADD COLUMN bar TEXT;
      INSERT INTO foo VALUES ('a;b', 'c''d');
      CREATE OR REPLACE FUNCTION g(p int) RETURNS int LANGUAGE plpgsql AS $func$
      DECLARE
        s text := 'hello; world';
      BEGIN
        RETURN p + 1;
      END;
      $func$;
      ;
      -- terminé
    `
    const out = split(src)
    expect(out).toHaveLength(3)
    expect(out[0]).toContain('ALTER TABLE foo')
    expect(out[1]).toContain(`'a;b'`)
    expect(out[1]).toContain(`'c''d'`)
    expect(out[2]).toContain('$func$')
    expect(out[2]).toContain(`'hello; world'`)
  })

  it("conserve l'idempotence du tracking : output = input minus séparateurs", () => {
    // Sanité : la concaténation des statements (avec `;` ré-ajoutés) doit
    // contenir tout le SQL pertinent — on ne perd pas de contenu.
    const src = `CREATE TABLE x (a int); INSERT INTO x VALUES (1);`
    const out = split(src)
    const rejoined = out.map((s) => s.trim()).join('; ')
    expect(rejoined).toContain('CREATE TABLE x (a int)')
    expect(rejoined).toContain('INSERT INTO x VALUES (1)')
  })
})
