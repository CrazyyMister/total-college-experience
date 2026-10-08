import { describe, expect, it } from 'vitest'
import {
  dealGroups,
  drawMembers,
  gameResult,
  GROUPS,
  groupSessionSlots,
  MIN_SESSION_ATTENDEES,
  placeGroupEvents,
  TEAM_SESSIONS_PER_WEEK,
  TRYOUT_CHANCES,
  tryoutVerdict
} from '@shared/groups'
import { pointsForTier } from '@shared/playerStats'
import { isLocationOpen } from '@shared/locations'
import type { Occasion } from '@shared/types'

/**
 * A team is drawn and given its sessions once, at New Game, and the record keeps the answer for
 * good: a person on two teams or a session on a reader's class cannot be repaired afterwards.
 */

const swimming = GROUPS.swimming
const roster = Array.from({ length: 9 }, (_, i) => ({ charId: `w${i}`, gender: 'woman' as const }))
const eligible = roster.map((entry) => entry.charId)

describe('drawMembers', () => {
  it('keeps the count between the least and the most, and honours the picks', () => {
    for (let count = 0; count <= 9; count++) {
      const team = drawMembers(swimming, eligible, { count, picked: ['w7', 'w2'] }, new Set(), `s${count}`)
      expect(team.length).toBeGreaterThanOrEqual(swimming.minMembers)
      expect(team.length).toBeLessThanOrEqual(swimming.maxMembers)
      expect(team).toEqual(expect.arrayContaining(['w7', 'w2']))
    }
  })

  it('takes nobody who is on another team, and the same seed draws the same team', () => {
    const taken = new Set(['w0', 'w1', 'w2'])
    const once = drawMembers(swimming, eligible, { count: 5, picked: ['w0'] }, taken, 'seed')
    expect(once.some((charId) => taken.has(charId))).toBe(false)
    expect(drawMembers(swimming, eligible, { count: 5, picked: ['w0'] }, taken, 'seed')).toEqual(once)
  })

  it('draws nobody where too few are left to make a team', () => {
    const taken = new Set(eligible.slice(0, eligible.length - (swimming.minMembers - 1)))
    expect(drawMembers(swimming, eligible, { count: 4, picked: [] }, taken, 'seed')).toEqual([])
  })
})

describe('groupSessionSlots', () => {
  const members = ['a', 'b', 'c', 'd']
  const everyoneFree = Object.fromEntries(members.map((charId) => [charId, new Set<number>()]))

  it('never lands on a class of the reader or outside the hours of the place', () => {
    const playerClassSlots = new Set([0, 1, 2, 3, 4, 5])
    for (let run = 0; run < 40; run++) {
      const { slots } = groupSessionSlots({
        location: 'apogee_club',
        members,
        busy: everyoneFree,
        playerClassSlots,
        count: TEAM_SESSIONS_PER_WEEK,
        seed: `run${run}`
      })
      expect(slots.length).toBe(TEAM_SESSIONS_PER_WEEK)
      for (const slot of slots) {
        expect(playerClassSlots.has(slot)).toBe(false)
        expect(isLocationOpen('apogee_club', slot)).toBe(true)
      }
    }
  })

  it('takes the periods with the most members free, on different days', () => {
    // Slots 10 and 12 have all four free; slot 11 too, but on the day of 10. Elsewhere only two.
    const busy = Object.fromEntries(
      members.map((charId, at) => [
        charId,
        new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13].filter(() => at >= 2))
      ])
    )
    const { slots } = groupSessionSlots({
      location: swimming.location,
      members,
      busy,
      playerClassSlots: new Set(),
      count: 2,
      seed: 'x'
    })
    expect(slots).toHaveLength(2)
    expect(Math.floor(slots[0] / 2)).not.toBe(Math.floor(slots[1] / 2))
    for (const slot of slots) expect(members.filter((id) => !busy[id].has(slot)).length).toBe(4)
  })

  it('reports a session it cannot hold instead of dropping it', () => {
    const busy = Object.fromEntries(
      members.map((charId, at) => [charId, new Set(at === 0 ? [] : [...Array(14).keys()])])
    )
    expect(MIN_SESSION_ATTENDEES).toBeGreaterThan(1)
    const result = groupSessionSlots({
      location: swimming.location,
      members,
      busy,
      playerClassSlots: new Set(),
      count: 2,
      seed: 'x'
    })
    expect(result).toEqual({ slots: [], leftOut: 2 })
  })

  it('gives the same sessions for the same seed', () => {
    const input = {
      location: swimming.location,
      members,
      busy: everyoneFree,
      playerClassSlots: new Set<number>(),
      count: 2,
      seed: 'same'
    }
    expect(groupSessionSlots(input)).toEqual(groupSessionSlots(input))
  })
})

describe('dealGroups', () => {
  const base = {
    roster,
    busy: Object.fromEntries(eligible.map((charId) => [charId, new Set<number>()])),
    playerClassSlots: new Set<number>(),
    seed: 'new-game'
  }

  it('forms a team where one was asked for, and none where it was not', () => {
    const deal = dealGroups({ ...base, choice: { swimming: { count: 4, picked: ['w3'] } } })
    expect(deal.members.swimming).toHaveLength(4)
    expect(deal.members.swimming).toContain('w3')
    expect(deal.agendas.swimming?.sessions).toHaveLength(TEAM_SESSIONS_PER_WEEK)

    // The women's teams are only what was asked for; the men's exist whoever is on them.
    const none = dealGroups({ ...base, choice: {} })
    expect(none.members).toEqual({})
    expect(Object.keys(none.agendas).sort()).toEqual(['basketball', 'football'])
    const declined = dealGroups({ ...base, choice: { swimming: { count: 0, picked: [] } } })
    expect(declined.agendas.swimming).toBeUndefined()
  })

  it('takes only the women of the roster', () => {
    const mixed = [...roster.slice(0, 2), { charId: 'm1', gender: 'man' as const }]
    const deal = dealGroups({ ...base, roster: mixed, choice: { swimming: { count: 3, picked: ['m1'] } } })
    expect(deal.members.swimming).toBeUndefined()
  })

  it('draws the men of the roster into the men\'s teams, and gives a team with none a schedule', () => {
    const menOf = (n: number): Array<{ charId: string; gender: 'man' }> =>
      Array.from({ length: n }, (_, i) => ({ charId: `m${i}`, gender: 'man' as const }))
    for (const n of [0, 1, 2, 3, 5]) {
      for (let run = 0; run < 40; run++) {
        const men = menOf(n)
        const deal = dealGroups({
          ...base,
          roster: [...roster, ...men],
          busy: { ...base.busy, ...Object.fromEntries(men.map((m) => [m.charId, new Set<number>()])) },
          seed: `n${n}r${run}`,
          choice: {}
        })
        const b = deal.members.basketball ?? []
        const f = deal.members.football ?? []
        expect(b.filter((charId) => f.includes(charId))).toEqual([])
        for (const team of [b, f]) {
          expect(team.length).toBeLessThanOrEqual(3)
          expect(team.every((charId) => charId.startsWith('m'))).toBe(true)
        }
        expect(b.length + f.length).toBeLessThanOrEqual(n)
        // Two men or more leave nobody out; with fewer, the one man (or none) is all there is.
        if (n >= 2) expect(Math.min(b.length, f.length)).toBeGreaterThanOrEqual(1)
        else expect(b.length + f.length).toBe(n)
        // A team of nobody from the roster still meets, twice, and only on its own.
        expect(deal.agendas.basketball?.sessions).toHaveLength(TEAM_SESSIONS_PER_WEEK)
        expect(deal.agendas.football?.sessions).toHaveLength(TEAM_SESSIONS_PER_WEEK)
      }
    }
  })

  it('keeps what was asked of the men by hand, and a count of none means nobody', () => {
    const men = Array.from({ length: 4 }, (_, i) => ({ charId: `m${i}`, gender: 'man' as const }))
    const deal = dealGroups({
      ...base,
      roster: [...roster, ...men],
      busy: { ...base.busy, ...Object.fromEntries(men.map((m) => [m.charId, new Set<number>()])) },
      choice: {
        basketball: { count: 2, picked: ['m3'] },
        football: { count: 0, picked: [] }
      }
    })
    expect(deal.members.basketball).toHaveLength(2)
    expect(deal.members.basketball).toContain('m3')
    expect(deal.members.football).toBeUndefined()
  })

  it('never holds the courts for the volleyball and the basketball team in the same period', () => {
    const men = Array.from({ length: 3 }, (_, i) => ({ charId: `m${i}`, gender: 'man' as const }))
    for (let run = 0; run < 60; run++) {
      const deal = dealGroups({
        ...base,
        roster: [...roster, ...men],
        busy: { ...base.busy, ...Object.fromEntries(men.map((m) => [m.charId, new Set<number>()])) },
        seed: `court${run}`,
        choice: { volleyball: { count: 4, picked: [] } }
      })
      const volley = deal.agendas.volleyball?.sessions ?? []
      const ball = deal.agendas.basketball?.sessions ?? []
      expect(volley.filter((slot) => ball.includes(slot))).toEqual([])
    }
  })

  it('keeps two teams apart, honours both sets of picks, and records the one it could not form', () => {
    for (let run = 0; run < 20; run++) {
      const deal = dealGroups({
        ...base,
        seed: `run${run}`,
        choice: {
          swimming: { count: 4, picked: ['w0'] },
          volleyball: { count: 4, picked: ['w8', 'w7'] }
        }
      })
      const swimming = deal.members.swimming ?? []
      const volleyball = deal.members.volleyball ?? []
      expect(swimming.filter((charId) => volleyball.includes(charId))).toEqual([])
      expect(volleyball).toEqual(expect.arrayContaining(['w8', 'w7']))
      expect(swimming).toContain('w0')
    }

    const small = dealGroups({
      ...base,
      roster: roster.slice(0, 7),
      choice: { swimming: { count: 5, picked: [] }, volleyball: { count: 5, picked: [] } }
    })
    expect(small.members.volleyball).toBeUndefined()
    expect(small.agendas.volleyball).toEqual({ sessions: [], unformed: { asked: 5, left: 2 } })
  })
})

describe('placeGroupEvents', () => {
  const members = { swimming: ['a', 'b', 'c'] }
  /** The swim team's own meets, which the tryouts placed beside them do not belong to. */
  const meetsOf = (placed: Occasion[]): Occasion[] => placed.filter((o) => o.group === 'swimming')
  const everyoneFree = (): number => 3
  const held = (date: number, time: 0 | 1 | null = 1): Occasion => ({
    id: `held-${date}`,
    title: 'Held',
    description: 'Held.',
    startDate: date,
    endDate: date,
    time,
    cancelsClasses: false,
    kind: 'campus'
  })

  it('gives each event its first candidate day, never twice the same half-day', () => {
    const { placed, leftOut } = placeGroupEvents({
      members,
      occasions: [],
      avoid: [],
      freeCount: everyoneFree
    })
    expect(meetsOf(placed).map((o) => [o.id, o.startDate, o.time, o.group, o.where])).toEqual([
      ['swimming-meet-1', 33, 1, 'swimming', 'palaestra_pool'],
      ['swimming-meet-2', 82, 1, 'swimming', 'palaestra_pool']
    ])
    expect(leftOut).toEqual({})
  })

  it('moves to the next candidate past an occasion on the half-day, the whole day or a week to avoid', () => {
    const { placed } = placeGroupEvents({
      members,
      occasions: [held(33), held(82, null), held(89)],
      avoid: [{ startDate: 40, endDate: 46 }],
      freeCount: everyoneFree
    })
    // 33 and 40 are both lost for meet 1, which takes 19; 82 and 89 are lost for meet 2, which takes 75.
    expect(meetsOf(placed).map((o) => o.startDate)).toEqual([19, 75])
  })

  it('sends an event that no day can hold to the left-out list with the reason', () => {
    const closed = placeGroupEvents({
      members,
      occasions: [held(33), held(40), held(19), held(27)],
      avoid: [],
      freeCount: everyoneFree
    })
    expect(closed.leftOut.swimming).toEqual([{ id: 'swimming-meet-1', reason: 'no_date' }])

    const quiet = placeGroupEvents({
      members,
      occasions: [],
      avoid: [],
      freeCount: (_members, date) => (date === 33 ? MIN_SESSION_ATTENDEES - 1 : 3)
    })
    expect(meetsOf(quiet.placed).map((o) => o.startDate)).toEqual([40, 82])
    const none = placeGroupEvents({
      members,
      occasions: [],
      avoid: [],
      freeCount: () => 0
    })
    expect(meetsOf(none.placed)).toEqual([])
    expect(none.leftOut.swimming?.map((e) => e.reason)).toEqual(['too_few_free', 'too_few_free'])
  })

  it('places a tryout by day with nobody free asked, around the reader\'s classes, a Saturday first', () => {
    const open = placeGroupEvents({ members: {}, occasions: [], avoid: [], freeCount: () => 0 })
    expect(open.placed.map((o) => [o.id, o.startDate, o.time])).toEqual([
      ['basketball-tryout', 5, 0],
      ['football-tryout', 6, 0]
    ])
    // The weekend is lost to occasions and the reader has class on the first week's days: the
    // second week takes over, in order.
    const second = placeGroupEvents({
      members: {},
      occasions: [held(5, 0), held(6, null)],
      avoid: [],
      freeCount: () => 0,
      readerBusy: (date) => date >= 1 && date <= 4
    })
    expect(second.placed.map((o) => [o.id, o.startDate])).toEqual([
      ['basketball-tryout', 12],
      ['football-tryout', 13]
    ])
  })

  it('sends a tryout no day can hold to the left-out list, never dropped', () => {
    const all = Array.from({ length: 14 }, (_, day) => held(day, 0))
    const { placed, leftOut } = placeGroupEvents({
      members: {},
      occasions: all,
      avoid: [],
      freeCount: () => 0
    })
    expect(placed).toEqual([])
    expect(leftOut.basketball).toEqual([{ id: 'basketball-tryout', reason: 'no_date' }])
    expect(leftOut.football).toEqual([{ id: 'football-tryout', reason: 'no_date' }])
  })

  it('places the same days for the same input', () => {
    const input = { members, occasions: [held(33)], avoid: [], freeCount: everyoneFree }
    expect(placeGroupEvents(input)).toEqual(placeGroupEvents(input))
  })
})

describe('tryoutVerdict', () => {
  it('judges the same way for the same seed, and more Body makes the team more often', () => {
    const madeAt = (tier: number): number =>
      Array.from({ length: 400 }, (_, run) =>
        tryoutVerdict(pointsForTier(tier as 1 | 2 | 3 | 4 | 5), `game${run}:tryout`).made
      ).filter(Boolean).length
    expect(tryoutVerdict(0, 's')).toEqual(tryoutVerdict(0, 's'))
    expect(tryoutVerdict(pointsForTier(3), 's').tier).toBe(3)
    const counts = [1, 2, 3, 4, 5].map(madeAt)
    expect([...counts].sort((a, b) => a - b)).toEqual(counts)
    expect(counts[0]).toBeLessThan(counts[4])
    // Close to the table's odds, which the sample of 400 cannot miss by much.
    counts.forEach((made, at) => expect(Math.abs(made / 400 - TRYOUT_CHANCES[at])).toBeLessThan(0.1))
  })
})

describe('gameResult', () => {
  it('ends an event the same way for the same seed, and scores the whole of its points', () => {
    for (let run = 0; run < 30; run++) {
      const first = gameResult(swimming, 0.6, `seed-${run}`)
      expect(gameResult(swimming, 0.6, `seed-${run}`)).toEqual(first)
      expect(swimming.scoring.kind === 'points' && first.home + first.away).toBe(300)
      expect(first.home > first.away).toBe(first.won)
    }
  })

  it('scores a match in sets: three for the winner, none to two for the other side', () => {
    for (let run = 0; run < 30; run++) {
      const match = gameResult(GROUPS.volleyball, 0.6, `seed-${run}`)
      expect(Math.max(match.home, match.away)).toBe(3)
      expect(Math.min(match.home, match.away)).toBeLessThan(3)
      expect(match.home > match.away).toBe(match.won)
    }
  })
})
