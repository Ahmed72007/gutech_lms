/** Server clock. Wrapped so lateness and expiry rules can be tested deterministically. */
export function now(): Date {
  return new Date()
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
