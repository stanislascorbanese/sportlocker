/**
 * Tests ClickableRow — primitive `<tr role="link">` cliquable utilisée
 * dans les tables des pages liste (réservations, etc.).
 *
 * Couverture :
 *  - role="link" exposé pour l'a11y
 *  - tabIndex=0 (focusable)
 *  - onClick → router.push(href, { scroll: false })
 *  - Enter / Space → router.push (mêmes args)
 *  - Autres touches → no-op
 *  - selected=true → application de la classe d'état visuel (ring emerald)
 *
 * Le composant rend un <tr>, on l'embarque donc dans <table><tbody> pour
 * un DOM valide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const routerPushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import { ClickableRow } from './ClickableRow'

function wrap(children: React.ReactNode) {
  return render(
    <table>
      <tbody>{children}</tbody>
    </table>,
  )
}

beforeEach(() => {
  routerPushMock.mockReset()
})

afterEach(cleanup)

describe('ClickableRow', () => {
  it("expose role=link et est focusable", () => {
    wrap(
      <ClickableRow href="/reservations/abc">
        <td>cell</td>
      </ClickableRow>,
    )
    const row = screen.getByRole('link')
    expect(row).toBeInTheDocument()
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it("click : appelle router.push avec href + scroll:false", () => {
    wrap(
      <ClickableRow href="/reservations/abc">
        <td>cell</td>
      </ClickableRow>,
    )
    fireEvent.click(screen.getByRole('link'))
    expect(routerPushMock).toHaveBeenCalledWith('/reservations/abc', { scroll: false })
  })

  it("Enter key : déclenche router.push", () => {
    wrap(
      <ClickableRow href="/reservations/abc">
        <td>cell</td>
      </ClickableRow>,
    )
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' })
    expect(routerPushMock).toHaveBeenCalledOnce()
  })

  it("Space key : déclenche router.push", () => {
    wrap(
      <ClickableRow href="/reservations/abc">
        <td>cell</td>
      </ClickableRow>,
    )
    fireEvent.keyDown(screen.getByRole('link'), { key: ' ' })
    expect(routerPushMock).toHaveBeenCalledOnce()
  })

  it("autre touche (Tab) : no-op", () => {
    wrap(
      <ClickableRow href="/reservations/abc">
        <td>cell</td>
      </ClickableRow>,
    )
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Tab' })
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it("selected=true : applique la classe d'état emerald", () => {
    wrap(
      <ClickableRow href="/reservations/abc" selected>
        <td>cell</td>
      </ClickableRow>,
    )
    const row = screen.getByRole('link')
    expect(row.className).toMatch(/emerald/)
  })

  it("selected=false (défaut) : pas de classe emerald", () => {
    wrap(
      <ClickableRow href="/reservations/abc">
        <td>cell</td>
      </ClickableRow>,
    )
    const row = screen.getByRole('link')
    expect(row.className).not.toMatch(/bg-emerald-500/)
  })

  it("rend les children dans la rangée", () => {
    wrap(
      <ClickableRow href="/x">
        <td>contenu cellule</td>
      </ClickableRow>,
    )
    expect(screen.getByText('contenu cellule')).toBeInTheDocument()
  })
})
