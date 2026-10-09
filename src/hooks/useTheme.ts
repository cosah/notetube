import { useEffect, useState } from 'react'
import { readString, writeString } from '../lib/storage'

export type ThemeChoice = 'system' | 'light' | 'dark'

const ORDER: ThemeChoice[] = ['system', 'light', 'dark']

export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const saved = readString('theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    writeString('theme', theme === 'system' ? null : theme)
  }, [theme])

  const cycle = () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length])
  return { theme, cycle }
}
