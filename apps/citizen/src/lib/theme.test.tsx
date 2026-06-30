import { act, renderHook } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { ThemeProvider, useTheme } from './theme'

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('ThemeProvider', () => {
  it('démarre en mode dark par défaut (pas de localStorage, matchMedia = light)', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.mode).toBe('dark')
    expect(result.current.resolved).toBe('dark')
  })

  it('toggle bascule dark ↔ light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.resolved).toBe('dark')

    act(() => {
      result.current.toggle()
    })

    expect(result.current.resolved).toBe('light')

    act(() => {
      result.current.toggle()
    })

    expect(result.current.resolved).toBe('dark')
  })

  it('toggle applique la classe `dark` sur <html>', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    // démarre en dark → la classe doit être là après mount
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => {
      result.current.toggle()
    })

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persiste le mode dans localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.toggle()
    })

    expect(window.localStorage.getItem('sl-theme')).toBe('light')
  })

  it('setMode("system") n\'efface pas localStorage et persiste "system"', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setMode('system')
    })

    expect(result.current.mode).toBe('system')
    expect(window.localStorage.getItem('sl-theme')).toBe('system')
  })

  it('useTheme() throw hors d\'un ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/useTheme must be used inside/)
  })
})
