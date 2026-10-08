import { beforeEach, describe, expect, it } from 'vitest'
import { placeGroupEvents, tryoutVerdict, type GroupResult } from '@shared/groups'
import { classSlotForShift, globalSlotOf } from '@shared/jobs'
import type { GameSave, Occasion } from '@shared/types'
import { groupNewsClause } from '../src/renderer/prompts/groupPrompt'
import { useGameStore } from '../src/renderer/stores/gameStore'
import {
  canTryOut,
  planGroupEvent,
  resultOfEvent,
  settleGroupResults,
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
    expect(game.groupTeam).toEqual({ id: 'basketball', since: globalSlotOf(DAY, 0) + 1 })

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
