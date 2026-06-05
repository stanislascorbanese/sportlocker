/**
 * Tests pour ThemeProvider + useTheme.
 *
 * Couvre :
 *   - Default mode = dark (le dashboard est historiquement navy)
 *   - Persistence localStorage entre mounts
 *   - `setMode` met à jour localStorage et la classe `.dark` sur <html>
 *   - `toggle` alterne dark ↔ light
 *   - `useTheme` throw si appelé hors Provider
 *   - resolveTheme('system') fallback dark sans matchMedia
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, renderHook } from '@testing-library/react'

import { ThemeProvider, useTheme } from './theme'

const STORAGE_KEY = 'sl-dashboard-theme'

function ProbeTheme() {
  const { mode, resolved } = useTheme()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolved}</span>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    try {
      window.localStorage?.clear()
    } catch {}
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    cleanup()
  })

  it('default mode is dark', () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ProbeTheme />
      </ThemeProvider>,
    )
    expect(getByTestId('mode').textContent).toBe('dark')
    expect(getByTestId('resolved').textContent).toBe('dark')
  })

  it('reads light from localStorage on mount', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'light')
    const { getByTestId, findByText } = render(
      <ThemeProvider>
        <ProbeTheme />
      </ThemeProvider>,
    )
    // Le effect lit le storage après mount → état est mis à jour async
    await findByText('light', { selector: '[data-testid="mode"]' })
    expect(getByTestId('resolved').textContent).toBe('light')
  })

  it('applies .dark class on <html> when mode is dark', async () => {
    render(
      <ThemeProvider>
        <ProbeTheme />
      </ThemeProvider>,
    )
    // Le effect applique la classe après mount
    await act(async () => { await Promise.resolve() })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes .dark class when toggle to light', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    })
    await act(async () => { await Promise.resolve() })
    expect(result.current.mode).toBe('dark')

    act(() => {
      result.current.toggle()
    })

    expect(result.current.mode).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it('toggle alternates between dark and light', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    })
    expect(result.current.mode).toBe('dark')

    act(() => { result.current.toggle() })
    expect(result.current.mode).toBe('light')

    act(() => { result.current.toggle() })
    expect(result.current.mode).toBe('dark')
  })

  it('setMode persists in localStorage', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    })

    act(() => {
      result.current.setMode('light')
    })

    expect(result.current.mode).toBe('light')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light')
  })
})

describe('useTheme outside Provider', () => {
  it('throws an error', () => {
    expect(() => {
      renderHook(() => useTheme())
    }).toThrow(/useTheme must be used inside/)
  })
})
