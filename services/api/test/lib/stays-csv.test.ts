/**
 * Lecture des exports PMS.
 *
 * Chaque cas ici correspond à une forme qu'un export de camping prend
 * réellement : point-virgule d'un Excel français, BOM d'un « Enregistrer sous
 * UTF-8 », dates en jj/mm/aaaa, colonnes nommées « Empl. » ou « Titulaire »,
 * lignes de total en bas de fichier. Un parseur qui ne tient pas ces cas oblige
 * le gérant à retoucher son fichier — c'est-à-dire à ne pas s'en servir.
 */
import { describe, expect, it } from 'vitest'

import { detectSeparator, parseDate, parseStaysCsv, splitLine } from '../../src/lib/stays-csv.js'

describe('detectSeparator', () => {
  it('reconnaît le point-virgule d\'un Excel français', () => {
    expect(detectSeparator('Emplacement;Nom;Arrivée;Départ')).toBe(';')
  })

  it('reconnaît la virgule', () => {
    expect(detectSeparator('Emplacement,Nom,Arrivée,Départ')).toBe(',')
  })

  it('reconnaît la tabulation', () => {
    expect(detectSeparator('Emplacement\tNom\tArrivée\tDépart')).toBe('\t')
  })

  it('ignore les séparateurs à l\'intérieur des guillemets', () => {
    // Une seule vraie virgule : « Martin, Jean » est un champ, pas deux.
    expect(detectSeparator('"Martin, Jean";214')).toBe(';')
  })

  it('retombe sur le point-virgule quand il n\'y a qu\'une colonne', () => {
    expect(detectSeparator('Emplacement')).toBe(';')
  })
})

describe('splitLine', () => {
  it('respecte les guillemets', () => {
    expect(splitLine('214;"Martin, Jean";14/07/2027', ';'))
      .toEqual(['214', 'Martin, Jean', '14/07/2027'])
  })

  it('gère les guillemets échappés', () => {
    expect(splitLine('1;"L""Escale";x', ';')).toEqual(['1', 'L"Escale', 'x'])
  })

  it('conserve les champs vides', () => {
    expect(splitLine('214;;Martin', ';')).toEqual(['214', '', 'Martin'])
  })
})

describe('parseDate', () => {
  it('lit le format français', () => {
    expect(parseDate('14/07/2027')).toBe('2027-07-14')
    expect(parseDate('4/7/2027')).toBe('2027-07-04')
    expect(parseDate('14-07-2027')).toBe('2027-07-14')
    expect(parseDate('14.07.2027')).toBe('2027-07-14')
  })

  it('lit le format ISO', () => {
    expect(parseDate('2027-07-14')).toBe('2027-07-14')
    expect(parseDate('2027-07-14 15:30:00')).toBe('2027-07-14')
  })

  it('complète une année sur deux chiffres', () => {
    expect(parseDate('14/07/27')).toBe('2027-07-14')
  })

  it('rejette une date qui n\'existe pas', () => {
    // Sans ce contrôle, Date « corrige » le 31 février en 3 mars et le séjour
    // part sur la mauvaise semaine.
    expect(parseDate('31/02/2027')).toBeNull()
    expect(parseDate('32/01/2027')).toBeNull()
    expect(parseDate('14/13/2027')).toBeNull()
  })

  it('rejette ce qui n\'est pas une date', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('à confirmer')).toBeNull()
  })
})

describe('parseStaysCsv', () => {
  it('lit un export classique en point-virgule', () => {
    const csv = [
      'Emplacement;Nom;Prénom;Arrivée;Départ',
      '214;Martin;Camille;14/07/2027;21/07/2027',
      'A12;Lefèvre;Jean;15/07/2027;22/07/2027',
    ].join('\r\n')

    const out = parseStaysCsv(csv)
    expect(out.separator).toBe(';')
    expect(out.rejected).toEqual([])
    expect(out.rows).toEqual([
      { stayRef: '214', lastName: 'Martin', firstName: 'Camille', arrivesOn: '2027-07-14', departsOn: '2027-07-21' },
      { stayRef: 'A12', lastName: 'Lefèvre', firstName: 'Jean', arrivesOn: '2027-07-15', departsOn: '2027-07-22' },
    ])
  })

  it('avale le BOM d\'un fichier enregistré en UTF-8 par Excel', () => {
    const csv = '﻿Emplacement;Nom;Arrivée;Départ\n7;Durand;01/08/2027;08/08/2027'
    const out = parseStaysCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]!.stayRef).toBe('7')
  })

  it('reconnaît les intitulés de colonnes d\'un PMS à l\'autre', () => {
    const csv = [
      'N° Empl.;Titulaire;Date d\'entrée;Date de sortie',
      '18;Bernard;03/08/2027;10/08/2027',
    ].join('\n')

    const out = parseStaysCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]).toMatchObject({
      stayRef: '18',
      lastName: 'Bernard',
      arrivesOn: '2027-08-03',
      departsOn: '2027-08-10',
    })
  })

  it('accepte un export en anglais', () => {
    const csv = 'Reservation,Last name,First name,Check-in,Check-out\nR-9,Smith,John,2027-07-01,2027-07-08'
    const out = parseStaysCsv(csv)
    expect(out.separator).toBe(',')
    expect(out.rows[0]).toMatchObject({ stayRef: 'R-9', lastName: 'Smith', firstName: 'John' })
  })

  it('signale les colonnes qu\'il n\'a pas su rattacher', () => {
    const csv = 'Emplacement;Nom;Arrivée;Départ;Montant TTC;Solde\n5;Petit;01/07/2027;05/07/2027;180,00;0'
    const out = parseStaysCsv(csv)
    expect(out.ignoredColumns).toEqual(['Montant TTC', 'Solde'])
    expect(out.mapping['Emplacement']).toBe('stayRef')
    expect(out.rows).toHaveLength(1)
  })

  it('rejette ligne par ligne, avec le numéro que le gérant verra dans Excel', () => {
    const csv = [
      'Emplacement;Nom;Arrivée;Départ',   // ligne 1
      ';Martin;14/07/2027;21/07/2027',    // ligne 2 — pas d'emplacement
      '3;;14/07/2027;21/07/2027',         // ligne 3 — pas de nom
      '4;Durand;pas une date;21/07/2027', // ligne 4
      '5;Petit;14/07/2027;',              // ligne 5
      '6;Roux;21/07/2027;14/07/2027',     // ligne 6 — départ avant arrivée
      '7;Blanc;14/07/2027;21/07/2027',    // ligne 7 — la seule bonne
    ].join('\n')

    const out = parseStaysCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]!.stayRef).toBe('7')
    expect(out.rejected.map((r) => [r.line, r.reason])).toEqual([
      [2, 'missing_stay_ref'],
      [3, 'missing_last_name'],
      [4, 'bad_arrival_date'],
      [5, 'bad_departure_date'],
      [6, 'departure_before_arrival'],
    ])
  })

  it('ignore les lignes vides et la ligne de total en bas de fichier', () => {
    const csv = [
      'Emplacement;Nom;Arrivée;Départ',
      '1;Martin;14/07/2027;21/07/2027',
      '',
      ';TOTAL;;',
    ].join('\n')

    const out = parseStaysCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rejected).toHaveLength(1)
    expect(out.rejected[0]!.reason).toBe('missing_stay_ref')
  })

  it('accepte un séjour d\'une seule nuit et un séjour d\'un seul jour', () => {
    const csv = [
      'Emplacement;Nom;Arrivée;Départ',
      '1;Martin;14/07/2027;15/07/2027',
      '2;Durand;14/07/2027;14/07/2027',
    ].join('\n')
    expect(parseStaysCsv(csv).rows).toHaveLength(2)
  })

  it('ne renvoie rien sur un fichier vide plutôt que de lever', () => {
    expect(parseStaysCsv('')).toEqual({
      rows: [], rejected: [], mapping: {}, ignoredColumns: [], separator: ';',
    })
  })

  it('tronque les valeurs trop longues au lieu de faire échouer l\'insertion', () => {
    const long = 'X'.repeat(200)
    const csv = `Emplacement;Nom;Arrivée;Départ\n${long};${long};14/07/2027;21/07/2027`
    const out = parseStaysCsv(csv)
    expect(out.rows[0]!.stayRef).toHaveLength(32)
    expect(out.rows[0]!.lastName).toHaveLength(120)
  })
})
