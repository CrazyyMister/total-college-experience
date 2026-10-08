import { beforeEach, describe, expect, it } from 'vitest'
import { placeGroupEvents, type GroupResult } from '@shared/groups'
import type { GameSave, Occasion } from '@shared/types'
import { groupNewsClause } from '../src/renderer/prompts/groupPrompt'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { resultOfEvent, settleGroupResults } from '../src/renderer/stores/loop/groups'
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
    occasions: placed
  })
  return placed[0]
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
