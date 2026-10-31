type Cell = string | number | null | undefined

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV with a UTF-8 BOM so Excel opens accented names correctly. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Extracts emails from a CSV/text upload: one per cell, header rows ignored. */
export function parseEmailList(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .split(/[\r\n,;\t]+/)
    .map((cell) => cell.trim().replace(/^"|"$/g, '').trim().toLowerCase())
    .filter((cell) => cell.length > 0 && cell !== 'email')
}
