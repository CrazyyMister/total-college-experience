import { beforeEach, describe, expect, it } from 'vitest'

import { homeOf, READER, STARTING_HOME, withHomeMove, type HomeSource } from '@shared/homes'
import type { GameSave } from '@shared/types'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { playthroughRecord } from './fixtures'

/** A source where Sarah's record files her in Lowrise 2 and nobody has moved. */
function source(over: Partial<HomeSource> = {}): HomeSource {
  return { homeMoves: {}, charInfo: { sarah: { dorm: 'lowrise_2' } }, ...over }
}

describe('where somebody lives', () => {
  it('reads the save over the record, for the reader and for a character alike, and the record without one', () => {
    const moved = source({ homeMoves: { [READER]: 'lowrise_1', sarah: 'elysium' } })
    expect(homeOf(moved, READER)).toBe('lowrise_1')
    expect(homeOf(moved, 'sarah')).toBe('elysium')

    expect(homeOf(source(), READER)).toBe(STARTING_HOME)
    expect(homeOf(source(), 'sarah')).toBe('lowrise_2')
    expect(homeOf(source(), 'nobody')).toBeUndefined()
  })

  it('reads the house a character belongs to over the dorm her record files, and a move over both', () => {
    const housed = source({ charInfo: { sarah: { dorm: 'lowrise_2', house: 'pi_theta' } } })
    expect(homeOf(housed, 'sarah')).toBe('pi_theta')
    expect(homeOf({ ...housed, homeMoves: { sarah: 'lowrise_1' } }, 'sarah')).toBe('lowrise_1')
    // Nothing moves the reader into a house but a move.
    expect(homeOf(housed, READER)).toBe(STARTING_HOME)
    expect(homeOf({ ...housed, homeMoves: { [READER]: 'kappa_row' } }, READER)).toBe('kappa_row')
  })

  it('passes over a move that names no place', () => {
    const broken = source({ homeMoves: { [READER]: 'the_moon', sarah: '' } as never })
    expect(homeOf(broken, READER)).toBe(STARTING_HOME)
    expect(homeOf(broken, 'sarah')).toBe('lowrise_2')
  })
})

describe('filing a move', () => {
  it('leaves the same record however often the boundary files it', () => {
    const once = withHomeMove({ sarah: 'elysium' }, READER, 'lowrise_1')
    expect(withHomeMove(once, READER, 'lowrise_1')).toBe(once)
    expect(once).toEqual({ sarah: 'elysium', [READER]: 'lowrise_1' })
  })
})

describe('the moves through the save', () => {
  beforeEach(() => useGameStore.getState().reset())

  it('loads a save written before anybody could move as no move, and writes none back', () => {
    useGameStore.setState({ homeMoves: { [READER]: 'lowrise_1' } })
    const save = useGameStore.getState().toGameSave() as GameSave
    delete save.homeMoves

    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    const game = useGameStore.getState()
    expect(game.homeMoves).toEqual({})
    expect(homeOf(game, READER)).toBe(STARTING_HOME)
    expect(game.toGameSave()).not.toHaveProperty('homeMoves')
  })

  it('keeps a move whole, filed once however often the boundary replays', () => {
    useGameStore.getState().moveHome(READER, 'lowrise_1')
    useGameStore.getState().moveHome(READER, 'lowrise_1')
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.homeMoves).toEqual({ [READER]: 'lowrise_1' })

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(homeOf(useGameStore.getState(), READER)).toBe('lowrise_1')
  })
})
