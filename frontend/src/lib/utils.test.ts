import { describe, expect, it } from 'vitest'
import { formatBytes, formatMarks, initials, passwordStrength } from './utils'

describe('utils', () => {
  it('formats file sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB')
  })

  it('formats marks without trailing zeros', () => {
    expect(formatMarks(8.5)).toBe('8.5')
    expect(formatMarks(10)).toBe('10')
    expect(formatMarks(null)).toBe('—')
  })

  it('builds initials', () => {
    expect(initials('Noor Said Al Habsi')).toBe('NS')
  })

  it('caps strength when the policy (letter + number) is not met', () => {
    expect(passwordStrength('abcdefghijklmnop').score).toBeLessThanOrEqual(1)
    expect(passwordStrength('Lagoon-Falcon-2026!').score).toBe(4)
  })
})
