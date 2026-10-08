import { describe, expect, it } from 'vitest'
import {
  dealGroups,
  drawMembers,
  GROUPS,
  groupSessionSlots,
  MIN_SESSION_ATTENDEES,
  TEAM_SESSIONS_PER_WEEK
} from '@shared/groups'
import { isLocationOpen } from '@shared/locations'

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
