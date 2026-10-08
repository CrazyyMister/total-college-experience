import { beforeEach, describe, expect, it } from 'vitest'
import { placeGroupEvents, tryoutVerdict, type GroupResult } from '@shared/groups'
import { classSlotForShift, globalSlotOf, JOB_CATALOG, newJobState } from '@shared/jobs'
import type { GameSave, Occasion, ShiftSlot } from '@shared/types'
import { groupNewsClause } from '../src/renderer/prompts/groupPrompt'
import { SPRING_BREAK } from '../src/renderer/prompts/occasions'
import { playerGroupNow } from '../src/renderer/stores/timetable'
import { useGameStore } from '../src/renderer/stores/gameStore'
import {
  canTryOut,
  leaveTeamNow,
  planGroupEvent,
  resultOfEvent,
  settleGroupResults,
  settleSessions,
  tryoutRefusal
} from '../src/renderer/stores/loop/groups'
import { character, charactersById, charInfo, playthroughRecord } from './fixtures'

/**
 * A group event's score is decided once and kept in the save. The scene and the boundary both
 * decide it, whichever comes first, and the second must find the first's answer and leave it.
 */

const MEET_NIGHT = 33
const NIGHT = 1

/** Three swimmers, one of whom is staying in on the night of the first meet. */
function seed(): Occasion {
  useGameStore.getState().reset()
  const team = ['a', 'b', 'c']
  const { placed } = placeGroupEvents({
    members: { swimming: team },
    occasions: [],
    avoid: [],
    freeCount: () => team.length
  })
  const meets = placed.filter((o) => o.group === 'swimming')
  useGameStore.setState({
    playthroughId: 'p1',
    date: MEET_NIGHT,
    time: NIGHT,
    chars: team,
    characters: charactersById(
      character({ charId: 'a' }),
      character({ charId: 'b', firstName: 'Mina', lastName: 'Okafor' }),
      character({ charId: 'c', firstName: 'Kira', lastName: 'Weber' })
    ),
    charInfo: Object.fromEntries(
      team.map((charId) => [
        charId,
        // 27 puts the third day of her cycle on the night of the meet.
        charInfo({ groups: ['swimming'], moodCycleOffset: charId === 'c' ? 27 : 10 })
      ])
    ),
    occasions: meets
  })
  return meets[0]
}

describe('how a group event ends', () => {
  let meet: Occasion
  beforeEach(() => {
    meet = seed()
  })

  it('reaches the same score whether its scene or the boundary decides it', () => {
    const fromScene = resultOfEvent(meet) as GroupResult
    expect(useGameStore.getState().groupResults[meet.id]).toEqual(fromScene)

    useGameStore.setState({ groupResults: {}, date: MEET_NIGHT + 1, time: 0 })
    settleGroupResults()
    expect(useGameStore.getState().groupResults[meet.id]).toEqual(fromScene)
  })

  it('leaves a result that is already filed as it is', () => {
    const filed: GroupResult = { won: false, home: 100, away: 200 }
    useGameStore.setState({ groupResults: { [meet.id]: filed }, date: MEET_NIGHT + 1, time: 0 })
    settleGroupResults()
    expect(useGameStore.getState().groupResults[meet.id]).toEqual(filed)
    expect(resultOfEvent(meet)).toEqual(filed)
  })

  it('decides nothing until its night is over', () => {
    for (const [date, time] of [
      [MEET_NIGHT - 1, 1],
      [MEET_NIGHT, 0],
      [MEET_NIGHT, 1]
    ] as const) {
      useGameStore.setState({ date, time })
      settleGroupResults()
      expect(useGameStore.getState().groupResults).toEqual({})
    }
    useGameStore.setState({ date: MEET_NIGHT + 1, time: 0 })
    settleGroupResults()
    expect(Object.keys(useGameStore.getState().groupResults)).toEqual([meet.id])
  })

  it('goes through the save and back, and an older save reads as none decided', () => {
    const result = resultOfEvent(meet) as GroupResult
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.groups).toEqual({ results: { [meet.id]: result } })

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupResults).toEqual({ [meet.id]: result })

    delete save.groups
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupResults).toEqual({})
    expect(useGameStore.getState().toGameSave()).not.toHaveProperty('groups')
  })

  it('tells the team of the result only once the night is over', () => {
    const result = resultOfEvent(meet) as GroupResult
    const told = (date: number, time: 0 | 1): string =>
      groupNewsClause(['swimming'], {
        date,
        time,
        occasions: [meet],
        groupResults: { [meet.id]: result }
      })
    expect(told(MEET_NIGHT, 0)).toBe('')
    expect(told(MEET_NIGHT, 1)).toBe('')
    expect(told(MEET_NIGHT + 1, 0)).toContain(result.won ? 'beat' : 'lost to')
  })
})

describe('a tryout', () => {
  const DAY = 5

  /** The basketball tryout on its day, and a reader of the given Body in a game of that id. */
  function tryoutDay(playthroughId: string, body: number): Occasion {
    useGameStore.getState().reset()
    const { placed } = placeGroupEvents({
      members: {},
      occasions: [],
      avoid: [],
      freeCount: () => 0
    })
    useGameStore.setState({
      playthroughId,
      date: DAY,
      time: 0,
      stats: { brain: 0, body, heart: 0 },
      occasions: placed,
      groups: { basketball: { sessions: [2, 13] }, football: { sessions: [3, 12] } }
    })
    return placed[0]
  }

  /** A game id whose seed makes the team, or does not, at that Body. */
  function gameWhere(made: boolean, body: number): string {
    for (let at = 0; at < 200; at++) {
      const id = `g${at}`
      if (tryoutVerdict(body, `${id}:basketball-tryout:tryout`).made === made) return id
    }
    throw new Error('no such seed')
  }

  it('is judged once when its scene opens, and making it puts him on the team in the same write', () => {
    const tryout = tryoutDay(gameWhere(true, 60), 60)
    const plan = planGroupEvent(tryout.id)
    expect(plan?.scene).toEqual({ groupId: 'basketball', groupEvent: tryout.id })
    const game = useGameStore.getState()
    expect(game.groupTryouts[tryout.id]).toEqual({ made: true, tier: 4 })
    const since = globalSlotOf(DAY, 0) + 1
    expect(game.groupTeam).toEqual({
      id: 'basketball',
      since,
      strikes: 0,
      settledThrough: since - 1,
      attendedSlots: []
    })
    // The welcome of the coach is filed in the write that put him on the team.
    const welcome = game.bunnyboard.conversations['team:basketball']?.messages ?? []
    expect(welcome.map((m) => m.text)).toEqual([
      "Coach here. You're on the roster. Practice is Tuesday Day and Sunday Night at the indoor courts. Be there, every time."
    ])

    // Opening it again in the same half-day is the same scene, and changes nothing.
    useGameStore.setState({ stats: { brain: 0, body: 0, heart: 0 } })
    expect(planGroupEvent(tryout.id)).not.toBeNull()
    expect(useGameStore.getState().groupTryouts[tryout.id]).toEqual({ made: true, tier: 4 })
  })

  it('leaves him on no team when he misses, and lets him try the other one', () => {
    const tryout = tryoutDay(gameWhere(false, 0), 0)
    planGroupEvent(tryout.id)
    expect(useGameStore.getState().groupTryouts[tryout.id]?.made).toBe(false)
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(canTryOut('football-tryout')).toBe(true)
  })

  it('is closed to a reader who is on a team, and a tryout already judged does not run twice', () => {
    const tryout = tryoutDay(gameWhere(true, 60), 60)
    planGroupEvent(tryout.id)
    expect(canTryOut('football-tryout')).toBe(false)
    // The next day the filed one is behind him.
    useGameStore.setState({ date: DAY + 1 })
    expect(canTryOut(tryout.id)).toBe(false)
  })

  it('refuses, naming the time to free, while a class or a shift of his is on a practice', () => {
    const tryout = tryoutDay('g0', 60)
    expect(tryoutRefusal(tryout.id)).toBeNull()
    // The first practice is shift slot 2, a Tuesday morning: a class there is in the way.
    const classSlot = classSlotForShift(2) as number
    useGameStore.setState({
      playerSchedule: { [classSlot]: 'MATH101' },
      classes: { MATH101: { name: 'Calculus' } } as never
    })
    expect(tryoutRefusal(tryout.id)).toMatch(/Tuesday Day.*Calculus.*Free that time/)
    expect(planGroupEvent(tryout.id)).toBeNull()
    expect(useGameStore.getState().groupTryouts).toEqual({})
  })

  it('goes through the save and back, leaving the team keeps the verdict, and an older save has none', () => {
    const tryout = tryoutDay(gameWhere(true, 60), 60)
    planGroupEvent(tryout.id)
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.groups?.tryouts).toEqual({ [tryout.id]: { made: true, tier: 4 } })
    expect(save.groups?.team?.id).toBe('basketball')

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupTeam?.id).toBe('basketball')
    useGameStore.getState().leaveTeam()
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(useGameStore.getState().groupTryouts[tryout.id]?.made).toBe(true)
    expect(useGameStore.getState().toGameSave().groups?.team).toBeUndefined()

    delete save.groups
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(useGameStore.getState().groupTryouts).toEqual({})
  })
})

describe('the practices of the team he is on', () => {
  // The team practices in periods 2 and 13 of the week, so its practices fall in slots 13, 16,
  // 27 and 30; he joined on day 5, Saturday, from the slot after the tryout.
  const SESSIONS: ShiftSlot[] = [2, 13]
  const CHAT = 'team:basketball'
  const AGENDAS = { basketball: { sessions: SESSIONS } }

  /** A reader on the basketball team, the clock at the given half-day and nothing judged yet. */
  function onTeam(date: number, time: 0 | 1, over: Record<string, unknown> = {}): void {
    useGameStore.getState().reset()
    useGameStore.setState({
      playthroughId: 'p1',
      date,
      time,
      groups: { basketball: { sessions: SESSIONS } },
      groupTryouts: { 'basketball-tryout': { made: true, tier: 3 } },
      groupTeam: {
        id: 'basketball',
        since: 11,
        strikes: 0,
        settledThrough: 10,
        attendedSlots: []
      },
      ...over
    })
  }
  const texts = (): string[] =>
    (useGameStore.getState().bunnyboard.conversations[CHAT]?.messages ?? []).map((m) => m.text)

  it('files the strike, the slot judged through and the text of the coach in one write', () => {
    onTeam(7, 0)
    const seen: Array<[number, number]> = []
    const unsubscribe = useGameStore.subscribe((state) => {
      seen.push([
        state.groupTeam?.strikes ?? -1,
        state.bunnyboard.conversations[CHAT]?.messages.length ?? 0
      ])
    })
    settleSessions()
    unsubscribe()
    // One change to the store, and it carries all three together.
    expect(seen).toEqual([[1, 1]])
    expect(useGameStore.getState().groupTeam?.settledThrough).toBe(13)
    expect(texts()).toEqual([
      "You weren't at practice. That's one. Three misses and you're off the team."
    ])

    // Asked again, nothing is judged or sent a second time.
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(1)
    expect(texts()).toHaveLength(1)
  })

  it('counts a replayed boundary once, from the save taken before it or after it', () => {
    onTeam(7, 0)
    const before = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    settleSessions()
    const after = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    for (const save of [before, after]) {
      useGameStore.getState().reset()
      useGameStore.getState().loadSave(save, playthroughRecord({ groups: AGENDAS }), {})
      settleSessions()
      expect(useGameStore.getState().groupTeam?.strikes).toBe(1)
      expect(texts()).toHaveLength(1)
    }
  })

  it('spares a practice he went to, filed at the boundary, and forgets it once judged', () => {
    onTeam(7, 0)
    useGameStore.getState().recordPracticeAttended(13)
    useGameStore.getState().recordPracticeAttended(13)
    expect(useGameStore.getState().groupTeam?.attendedSlots).toEqual([13])
    settleSessions()
    expect(useGameStore.getState().groupTeam).toMatchObject({
      strikes: 0,
      settledThrough: 13,
      attendedSlots: []
    })
    expect(texts()).toEqual([])
  })

  it('puts him out on the third miss, with a text for each, and keeps the tryout filed', () => {
    onTeam(14, 0)
    settleSessions()
    const game = useGameStore.getState()
    expect(game.groupTeam).toBeNull()
    expect(game.groupTryouts['basketball-tryout']?.made).toBe(true)
    expect(texts()).toEqual([
      "You weren't at practice. That's one. Three misses and you're off the team.",
      "That's two. One more and you're done here.",
      "That's three. You're off the team. Clear out your locker."
    ])
  })

  it('does not count a day the university is shut, a day after classes, or a shift of his', () => {
    // A practice on the first day of spring break, which closes the university.
    const day = SPRING_BREAK.startDate
    onTeam(day, 1, {
      groups: { basketball: { sessions: [(day % 7) * 2] } },
      groupTeam: {
        id: 'basketball',
        since: 11,
        strikes: 0,
        settledThrough: day * 2 - 1,
        attendedSlots: []
      }
    })
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(0)

    // The Friday after the last day of classes.
    onTeam(110, 0, {
      groups: { basketball: { sessions: [(109 % 7) * 2] } },
      groupTeam: {
        id: 'basketball',
        since: 11,
        strikes: 0,
        settledThrough: 216,
        attendedSlots: []
      }
    })
    settleSessions()
    expect(useGameStore.getState().groupTeam).toMatchObject({ strikes: 0, settledThrough: 219 })

    // A shift of his on the practice outranks it: no practice, no strike, and no button.
    onTeam(7, 0, { job: newJobState(JOB_CATALOG[0].id, [13], 0) })
    expect(playerGroupNow(6, 1)).toBeNull()
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(0)
    expect(texts()).toEqual([])
  })

  it('offers the practice only in its period, and the coach says goodbye when he leaves', () => {
    onTeam(6, 1)
    expect(playerGroupNow()?.group.id).toBe('basketball')
    expect(playerGroupNow(6, 0)).toBeNull()
    leaveTeamNow()
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(useGameStore.getState().groupTryouts['basketball-tryout']?.made).toBe(true)
    expect(texts()).toEqual(['Understood. Your spot goes to someone else. Good luck.'])
    expect(playerGroupNow()).toBeNull()
  })

  it('reads a team saved before practices counted as having judged nothing', () => {
    onTeam(40, 0, { groupTeam: { id: 'basketball', since: 11 } })
    const old = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(old.groups?.team).toEqual({ id: 'basketball', since: 11 })
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(old, playthroughRecord({ groups: AGENDAS }), {})
    expect(useGameStore.getState().groupTeam).toEqual({
      id: 'basketball',
      since: 11,
      strikes: 0,
      settledThrough: globalSlotOf(40, 0) - 1,
      attendedSlots: []
    })
    // Nothing is charged for the weeks before the save.
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(0)
  })
})
