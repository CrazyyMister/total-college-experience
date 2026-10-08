import { describe, expect, it } from 'vitest'
import {
  dealGroups,
  drawMembers,
  gameResult,
  GROUPS,
  groupSessionSlots,
  MIN_SESSION_ATTENDEES,
  placeGroupEvents,
  TEAM_SESSIONS_PER_WEEK
} from '@shared/groups'
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

    expect(dealGroups({ ...base, choice: {} })).toEqual({ members: {}, agendas: {} })
    expect(dealGroups({ ...base, choice: { swimming: { count: 0, picked: [] } } }).agendas).toEqual({})
  })

  it('takes only the women of the roster', () => {
    const mixed = [...roster.slice(0, 2), { charId: 'm1', gender: 'man' as const }]
    const deal = dealGroups({ ...base, roster: mixed, choice: { swimming: { count: 3, picked: ['m1'] } } })
    expect(deal.members).toEqual({})
  })
})

describe('placeGroupEvents', () => {
  const members = { swimming: ['a', 'b', 'c'] }
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
    expect(placed.map((o) => [o.id, o.startDate, o.time, o.group, o.where])).toEqual([
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
    // 33 and 40 are both lost for meet 1; 82 and 89 for meet 2, so 75 is the one left.
    expect(placed.map((o) => o.startDate)).toEqual([75])
  })

  it('sends an event that no day can hold to the left-out list with the reason', () => {
    const closed = placeGroupEvents({
      members,
      occasions: [held(33), held(40)],
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
    expect(quiet.placed.map((o) => o.startDate)).toEqual([40, 82])
    const none = placeGroupEvents({
      members,
      occasions: [],
      avoid: [],
      freeCount: () => 0
    })
    expect(none.placed).toEqual([])
    expect(none.leftOut.swimming?.map((e) => e.reason)).toEqual(['too_few_free', 'too_few_free'])
  })

  it('places the same days for the same input', () => {
    const input = { members, occasions: [held(33)], avoid: [], freeCount: everyoneFree }
    expect(placeGroupEvents(input)).toEqual(placeGroupEvents(input))
  })
})

describe('gameResult', () => {
  it('ends an event the same way for the same seed, and scores the whole of its points', () => {
    for (let run = 0; run < 30; run++) {
      const first = gameResult(swimming, 0.6, `seed-${run}`)
      expect(gameResult(swimming, 0.6, `seed-${run}`)).toEqual(first)
      expect(first.home + first.away).toBe(swimming.pointsTotal)
      expect(first.home > first.away).toBe(first.won)
    }
  })
})
