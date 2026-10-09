import { describe, expect, it } from 'vitest'
import {
  coachText,
  dealGroups,
  drawMembers,
  gameResult,
  GROUPS,
  groupSessionSlots,
  initiationSlot,
  menWinChance,
  MIN_SESSION_ATTENDEES,
  placeGroupEvents,
  practiceHeld,
  practiceShareOf,
  settleSessions,
  TEAM_SESSIONS_PER_WEEK,
  teamStrength,
  TRYOUT_CHANCES,
  tryoutVerdict,
  type GroupTeam,
  type PracticeContext
} from '@shared/groups'
import { MAX_STRIKES } from '@shared/jobs'
import { pointsForTier } from '@shared/playerStats'
import { isLocationOpen } from '@shared/locations'
import type { Occasion, ShiftSlot } from '@shared/types'

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

describe('a team of the unnamed', () => {
  const members = ['a', 'b']
  // Everyone is busy in every period but the weekend's, so the two-free rule finds no period.
  const busy = Object.fromEntries(members.map((charId) => [charId, new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])]))

  it('still meets its full count, and a team of the named does not bend its rule', () => {
    const input = {
      location: 'palaestra_field',
      members,
      busy,
      playerClassSlots: new Set<number>(),
      count: TEAM_SESSIONS_PER_WEEK,
      seed: 'x'
    }
    expect(groupSessionSlots({ ...input, lenient: true }).slots).toHaveLength(TEAM_SESSIONS_PER_WEEK)
    const strict = groupSessionSlots(input)
    expect(strict.slots.every((slot) => slot >= 10)).toBe(true)
    // Four periods have both free, so the lenient team takes those first.
    expect(groupSessionSlots({ ...input, lenient: true }).slots.every((slot) => slot >= 10)).toBe(true)
  })

  it('reaches its count wherever the reader has most of his week in class', () => {
    const none = Object.fromEntries(members.map((charId) => [charId, new Set<number>([...Array(14).keys()])]))
    const { slots, leftOut } = groupSessionSlots({
      location: 'palaestra_court',
      members,
      busy: none,
      playerClassSlots: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
      count: TEAM_SESSIONS_PER_WEEK,
      taken: new Set([10, 11]),
      lenient: true,
      seed: 'y'
    })
    expect(slots).toHaveLength(TEAM_SESSIONS_PER_WEEK)
    expect(leftOut).toBe(0)
    expect(slots.some((slot) => slot < 8 || slot === 10 || slot === 11)).toBe(false)
  })
})

describe('the practices of a team', () => {
  const sessions: ShiftSlot[] = [2, 13]
  const team = (over: Partial<GroupTeam> = {}): GroupTeam => ({
    id: 'basketball',
    since: 10,
    strikes: 0,
    settledThrough: 9,
    attendedSlots: [],
    held: 0,
    attended: 0,
    ...over
  })
  const open: PracticeContext = {
    shiftSlotAt: (slotId) => (slotId % 14) as never,
    closedOn: () => false,
    eventAt: () => false,
    otherCommitmentAt: () => false
  }
  const held = (t: GroupTeam, context: PracticeContext = open) => (slotId: number): boolean =>
    practiceHeld(t, sessions, slotId, context)
  // The sessions are the periods 2 and 13 of a week, so the practices fall in slots 13, 16, 27, 30.
  const FIRST = 13
  const SECOND = 16

  it('counts a practice he missed, tells the strike apart, and puts him out on the third', () => {
    const t = team()
    const one = settleSessions(t, FIRST, held(t))
    expect(one.strikes).toEqual([{ slotId: FIRST, kind: 'missed' }])
    expect(one.total).toBe(1)
    expect(one.settledThrough).toBe(FIRST)

    const all = settleSessions(t, 14 * 4, held(t))
    expect(all.strikes.map((s) => s.kind)).toEqual(['missed', 'missed2', 'expelled'])
    expect(all.expelled).toBe(true)
    expect(all.total).toBe(MAX_STRIKES)
    // The pass stops where he is put out.
    expect(all.settledThrough).toBe(all.strikes[2].slotId)
  })

  it('spares the practices he went to, and judges nothing twice', () => {
    const t = team({ attendedSlots: [FIRST] })
    const pass = settleSessions(t, SECOND, held(t))
    expect(pass.strikes.map((s) => s.slotId)).toEqual([SECOND])

    const settledAlready = team({ settledThrough: SECOND, strikes: 1 })
    const again = settleSessions(settledAlready, SECOND, held(settledAlready))
    expect(again.strikes).toEqual([])
    expect(again.settledThrough).toBe(SECOND)
    expect(again.total).toBe(1)
  })

  it('holds no practice on a closed day, before he joined, after classes, or under an event, a class or a shift', () => {
    const t = team({ since: SECOND })
    // Before he joined.
    expect(practiceHeld(t, sessions, FIRST, open)).toBe(false)
    expect(practiceHeld(t, sessions, SECOND, open)).toBe(true)
    // A holiday or spring break, and an event of his own team, a class or a shift of his.
    expect(practiceHeld(t, sessions, SECOND, { ...open, closedOn: () => true })).toBe(false)
    expect(practiceHeld(t, sessions, SECOND, { ...open, eventAt: () => true })).toBe(false)
    expect(practiceHeld(t, sessions, SECOND, { ...open, otherCommitmentAt: () => true })).toBe(false)
    // Nothing on a period that is not one of the team's.
    expect(practiceHeld(t, sessions, SECOND + 1, open)).toBe(false)
    // After the last day of classes (day 108), nothing at all.
    const late = 108 * 2 + 1
    expect(practiceHeld(team({ since: 0 }), [(late % 14) as ShiftSlot], late, open)).toBe(true)
    expect(practiceHeld(team({ since: 0 }), [((late + 2) % 14) as ShiftSlot], late + 2, open)).toBe(false)
    expect(settleSessions(team({ settledThrough: late }), 123 * 2, held(t)).strikes).toEqual([])
  })

  it('writes the words of the coach from the table, with the hours and the limit', () => {
    expect(coachText(GROUPS.basketball, 'intro', [2, 13])).toBe(
      "Coach here. You're on the roster. Practice is Tuesday Day and Sunday Night at the indoor courts. Be there, every time."
    )
    expect(coachText(GROUPS.basketball, 'missed', [2, 13], 1)).toBe(
      "You weren't at practice. That's one. Three misses and you're off the team."
    )
    expect(coachText(GROUPS.football, 'missed2', [2, 13], 2)).toBe("Two. One more and you're done here.")
    expect(coachText(GROUPS.football, 'expelled', [2, 13], MAX_STRIKES)).toBe(
      "Three. You're off the team. Turn in your gear."
    )
    expect(coachText(GROUPS.swimming, 'intro', [2])).toBeNull()
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
  const isTryout = (o: Occasion): boolean => o.id.endsWith('-tryout')
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
    expect(open.placed.filter(isTryout).map((o) => [o.id, o.startDate, o.time])).toEqual([
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
    expect(second.placed.filter(isTryout).map((o) => [o.id, o.startDate])).toEqual([
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
    expect(placed.filter(isTryout)).toEqual([])
    expect(leftOut.basketball?.[0]).toEqual({ id: 'basketball-tryout', reason: 'no_date' })
    expect(leftOut.football?.[0]).toEqual({ id: 'football-tryout', reason: 'no_date' })
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

describe('the games of the men\'s teams', () => {
  const rate = (play: Parameters<typeof gameResult>[3]): number => {
    let won = 0
    for (let run = 0; run < 4000; run++) {
      if (gameResult(GROUPS.basketball, 1, `rate-${run}`, play).won) won += 1
    }
    return won / 4000
  }

  it('adds the reader\'s Body and practices to the odds only when he plays, up to ninety percent', () => {
    expect(menWinChance(1)).toBeCloseTo(0.6)
    expect(menWinChance(1, { tier: 1, practiceShare: 1 })).toBeCloseTo(0.6)
    expect(menWinChance(1, { tier: 5, practiceShare: 0.5 })).toBeCloseTo(0.75)
    expect(menWinChance(1, { tier: 5, practiceShare: 1 })).toBeCloseTo(0.9)
    expect(menWinChance(1, { tier: 5, practiceShare: 2 })).toBeCloseTo(0.9)
    expect(menWinChance(0, { tier: 3, practiceShare: 0.9 })).toBeCloseTo(0.45 + 0.3 * 0.5 * 0.9)
    // A women's event is as it was: base 0.4, 0.3 for the whole team, nothing of the reader's.
    expect(gameResult(GROUPS.volleyball, 1, 'x', { tier: 5, practiceShare: 1 })).toEqual(
      gameResult(GROUPS.volleyball, 1, 'x')
    )
  })

  it('wins more often with more Body and more practices, and ends the same way for the same seed', () => {
    const tier1 = rate({ tier: 1, practiceShare: 1 })
    const tier5 = rate({ tier: 5, practiceShare: 1 })
    const tier5Skipping = rate({ tier: 5, practiceShare: 0.5 })
    expect(tier5).toBeGreaterThan(tier5Skipping)
    expect(tier5Skipping).toBeGreaterThan(tier1)
    expect(tier5 - tier1).toBeGreaterThan(0.2)
    expect(gameResult(GROUPS.basketball, 1, 'same', { tier: 4, practiceShare: 0.8 })).toEqual(
      gameResult(GROUPS.basketball, 1, 'same', { tier: 4, practiceShare: 0.8 })
    )
  })

  it('scores a football game in threes and sevens and a basketball game in a college range', () => {
    const reachable = new Set<number>()
    for (const sevens of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const threes of [0, 1, 2, 3, 4, 5, 6]) reachable.add(7 * sevens + 3 * threes)
    }
    for (let run = 0; run < 400; run++) {
      const football = gameResult(GROUPS.football, 0.5, `f-${run}`)
      const [high, low] = [Math.max(football.home, football.away), Math.min(football.home, football.away)]
      expect(reachable.has(high) && reachable.has(low)).toBe(true)
      expect(high).toBeGreaterThan(low)
      expect(football.home > football.away).toBe(football.won)

      const hoops = gameResult(GROUPS.basketball, 0.5, `b-${run}`)
      const [top, bottom] = [Math.max(hoops.home, hoops.away), Math.min(hoops.home, hoops.away)]
      expect(top).toBeGreaterThanOrEqual(64)
      expect(top).toBeLessThanOrEqual(95)
      expect(bottom).toBeGreaterThanOrEqual(40)
      expect(top).toBeGreaterThan(bottom)
      expect(hoops.home > hoops.away).toBe(hoops.won)
    }
  })

  it('takes a men\'s team with nobody of the roster as all there, and a team that has not practiced as all gone to', () => {
    expect(teamStrength(GROUPS.basketball, [], () => false)).toBe(1)
    expect(teamStrength(GROUPS.basketball, ['a', 'b'], (id) => id === 'a')).toBe(0.5)
    expect(teamStrength(GROUPS.swimming, [], () => false)).toBe(0)
    expect(practiceShareOf({ held: 0, attended: 0 })).toBe(1)
    expect(practiceShareOf({ held: 10, attended: 9 })).toBeCloseTo(0.9)
  })

  it('dates a men\'s game for a team with nobody named, and for one whose men are all busy', () => {
    const nobody = placeGroupEvents({ members: {}, occasions: [], avoid: [], freeCount: () => 0 })
    const games = nobody.placed.filter((o) => o.id.includes('-game-'))
    expect(games.map((o) => o.id)).toEqual([
      'basketball-game-1',
      'basketball-game-2',
      'football-game-1',
      'football-game-2'
    ])
    expect(games.every((o) => o.time === 1 && o.kind === 'campus')).toBe(true)
    expect(nobody.leftOut.basketball ?? []).toEqual([])

    // One man who is never free: the first night is the last choice, not none.
    const busy = placeGroupEvents({
      members: { basketball: ['m1'] },
      occasions: [],
      avoid: [],
      freeCount: () => 0
    })
    expect(busy.placed.filter((o) => o.id.startsWith('basketball-game'))).toHaveLength(2)

    // A women's team that cannot field two is still left out, as before.
    const thin = placeGroupEvents({
      members: { swimming: ['a', 'b', 'c'] },
      occasions: [],
      avoid: [],
      freeCount: () => 1
    })
    expect(thin.leftOut.swimming?.map((e) => e.reason)).toEqual(['too_few_free', 'too_few_free'])
  })

  it('counts the practices held and the ones he went to along with the strikes', () => {
    const t: GroupTeam = {
      id: 'basketball',
      since: 10,
      strikes: 0,
      settledThrough: 9,
      attendedSlots: [13],
      held: 0,
      attended: 0
    }
    const heldSlots = new Set([13, 16, 27])
    const settled = settleSessions(t, 30, (slotId) => heldSlots.has(slotId))
    expect(settled.held).toBe(3)
    expect(settled.attended).toBe(1)
    expect(settled.total).toBe(2)
  })
})

describe('the night of the initiation', () => {
  // Day 46 is a Friday, so its night is slot 93; each earlier night is two slots before.
  const night = (day: number): number => day * 2 + 1
  const busyOn =
    (...days: number[]) =>
    (slotId: number): string | null =>
      days.some((day) => night(day) === slotId) ? 'a class' : null

  it('takes the latest free night of the week and says why', () => {
    expect(initiationSlot({ fromSlot: 82, busyAt: busyOn() })).toEqual({
      slot: night(46),
      why: 'Friday night free',
      lastResort: false
    })
    const pick = initiationSlot({ fromSlot: 82, busyAt: busyOn(46, 45) })
    expect(pick.slot).toBe(night(44))
    expect(pick.why).toBe('Friday night has a class, Thursday night has a class, Wednesday free')
  })

  it('falls back through the week to Monday, and to the Sunday that ends the pledge only when nothing is free', () => {
    expect(initiationSlot({ fromSlot: 82, busyAt: busyOn(46, 45, 44, 43) }).slot).toBe(night(42))
    const last = initiationSlot({ fromSlot: 82, busyAt: busyOn(46, 45, 44, 43, 42) })
    expect(last).toEqual({ slot: night(41), why: 'no night of week 7 free', lastResort: true })
  })

  it('never picks a busy night outside the last resort', () => {
    for (let mask = 0; mask < 32; mask++) {
      const days = [46, 45, 44, 43, 42].filter((_, at) => mask & (1 << at))
      const pick = initiationSlot({ fromSlot: 82, busyAt: busyOn(...days) })
      if (!pick.lastResort) expect(days).not.toContain(Math.floor(pick.slot / 2))
    }
  })

  it('picks late from what is left of the week, then from the first free night after the break', () => {
    expect(initiationSlot({ fromSlot: night(44) - 1, busyAt: busyOn(46, 45) }).slot).toBe(night(44))
    const closed = [{ startDate: 47, endDate: 54 }]
    const past = initiationSlot({ fromSlot: night(47) - 1, busyAt: busyOn(), closed })
    expect(Math.floor(past.slot / 2)).toBe(55)
  })
})
