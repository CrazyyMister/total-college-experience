import { describe, expect, it } from 'vitest'
import { feedHandlePool } from '../src/shared/supporters'

/** How a supporter's marbles are spread through the feed's handle bag. */

describe('feedHandlePool', () => {
  const generated = Array.from({ length: 20 }, (_, i) => `g${i}`)
  const handles = [
    { name: 'Alpha', marbles: 4 },
    { name: 'Beta', marbles: 2 }
  ]

  it('spreads every supporter across both halves of the bag', () => {
    const pool = feedHandlePool(generated, handles)
    const split = Math.ceil(pool.length / 2)
    for (const one of handles) {
      const at = pool.flatMap((entry, index) => (entry.handle === one.name ? [index] : []))
      expect(at).toHaveLength(one.marbles)
      expect(at.some((index) => index < split)).toBe(true)
      expect(at.some((index) => index >= split)).toBe(true)
    }
    expect(pool).toHaveLength(generated.length + 4 + 2)
  })

  it('keys a generated handle by its own text and drops one a supporter has taken', () => {
    const pool = feedHandlePool([...generated, 'ALPHA'], handles)
    const plain = pool.filter((entry) => !entry.supporter)
    expect(plain.map((entry) => entry.key)).toEqual(generated)
    expect(plain.map((entry) => entry.handle)).toEqual(generated)
    expect(pool).toHaveLength(generated.length + 4 + 2)
  })
})
