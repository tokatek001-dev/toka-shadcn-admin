import { describe, expect, it } from 'vitest'
import { ConflictError, assertUpdateApplied } from './use-update-test'

describe('assertUpdateApplied', () => {
  it('passes when rows were updated', () => {
    expect(() => assertUpdateApplied([{ id: 'x' }])).not.toThrow()
  })

  it('throws ConflictError when no rows matched (version moved)', () => {
    expect(() => assertUpdateApplied([])).toThrow(ConflictError)
    expect(() => assertUpdateApplied(null)).toThrow(ConflictError)
  })
})
