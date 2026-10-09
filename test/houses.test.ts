import { describe, expect, it } from 'vitest'

import { dealHouses, HOUSE_IDS, HOUSES, type HousesChoice } from '@shared/houses'
import type { StatKey } from '@shared/playerStats'
import type { Gender } from '@shared/types'

const STATS: StatKey[] = ['brain', 'body', 'heart']

/** A roster of `women` women then `men` men, the stats they look for spread over the three. */
function roster(women: number, men: number) {
  const make = (gender: Gender, count: number, prefix: string) =>
    Array.from({ length: count }, (_, at) => ({
      charId: `${prefix}${at}`,
      gender,
      preferredStat: STATS[at % STATS.length]
    }))
  return [...make('woman', women, 'w'), ...make('man', men, 'm')]
}

function deal(women: number, men: number, seed: string, choice: HousesChoice = {}, barred: string[] = []) {
  return dealHouses({ choice, roster: roster(women, men), barred: new Set(barred), seed })
}

describe('dealing the Greek houses', () => {
  it('keeps every house to its count, every person to one house, and every house to its own gender', () => {
    for (const [women, men] of [[12, 0], [11, 1], [9, 3], [11, 5], [7, 5], [16, 0]]) {
      for (let run = 0; run < 40; run++) {
        const members = deal(women, men, `${women}-${men}-${run}`)
        const everyone = HOUSE_IDS.flatMap((id) => members[id] ?? [])
        expect(new Set(everyone).size).toBe(everyone.length)
        for (const id of HOUSE_IDS) {
          const named = members[id] ?? []
          const def = HOUSES[id]
          expect(named.length).toBeLessThanOrEqual(def.maxMembers)
          if (named.length > 0) expect(named.length).toBeGreaterThanOrEqual(def.minMembers)
          expect(named.every((charId) => charId.startsWith(def.gender === 'man' ? 'm' : 'w'))).toBe(true)
        }
        // With two or more of a gender, every house of it has somebody.
        if (men >= 2) expect(members.kappa_row?.length).toBeGreaterThan(0)
        if (men >= 2) expect(members.xi_delt?.length).toBeGreaterThan(0)
        expect(members.sig_lam?.length).toBeGreaterThanOrEqual(2)
        expect(members.pi_theta?.length).toBeGreaterThanOrEqual(2)
        // One man is in one house, and the other is only the unnamed.
        if (men === 1) expect((members.kappa_row?.length ?? 0) + (members.xi_delt?.length ?? 0)).toBe(1)
        if (men === 0) expect(members.kappa_row ?? []).toEqual([])
      }
    }
  })

  it('deals the same houses from the same seed, and never takes a barred person', () => {
    expect(deal(12, 3, 'same')).toEqual(deal(12, 3, 'same'))
    for (let run = 0; run < 40; run++) {
      const members = deal(8, 3, `barred-${run}`, {}, ['w0', 'w1', 'm0'])
      const everyone = HOUSE_IDS.flatMap((id) => members[id] ?? [])
      expect(everyone).not.toContain('w0')
      expect(everyone).not.toContain('w1')
      expect(everyone).not.toContain('m0')
    }
  })

  it('takes the people picked by name, and a count of none leaves a house to the unnamed', () => {
    const picked = deal(12, 3, 'picked', {
      sig_lam: { count: 3, picked: ['w1', 'w2'] },
      kappa_row: { count: 0, picked: [] }
    })
    expect(picked.sig_lam).toHaveLength(3)
    expect(picked.sig_lam).toEqual(expect.arrayContaining(['w1', 'w2']))
    expect(picked.kappa_row).toBeUndefined()
  })

  it('leaves a house the roster cannot fill to its least with nobody of the roster', () => {
    const members = deal(1, 0, 'thin')
    expect(members.sig_lam).toBeUndefined()
    expect(members.pi_theta).toBeUndefined()
  })
})
