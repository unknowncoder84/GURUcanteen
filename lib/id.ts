// Permanent unique ID generation. IDs never change once assigned, even when
// a record (e.g. a canteen name) is edited later.
export function generateId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}_${random}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
