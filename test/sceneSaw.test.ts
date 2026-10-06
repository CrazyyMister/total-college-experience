import { beforeEach, describe, expect, it } from 'vitest'
import { castWhoSawAll } from '@shared/encounters'
import type { LedgerResponse, SceneLine } from '@shared/types'
import { buildCharKeyToId, useGameStore } from '../src/renderer/stores/gameStore'
import { sceneLeavers, sceneSawAll } from '../src/renderer/stores/loop/rumors'
import { ledgerActs } from '../src/renderer/stores/sceneSanitizer'
import { character, charactersById } from './fixtures'

/**
 * Who took in a finished scene is read before the boundary's question and filed with the
 * encounter: it has to be what the encounter has always been filed with.
 */

const people = charactersById(
  character({ charId: 'a', firstName: 'Ann', lastName: 'Aa' }),
  character({ charId: 'b', firstName: 'Bea', lastName: 'Bb' }),
  character({ charId: 'c', firstName: 'Cara', lastName: 'Cc' }),
  character({ charId: 'd', firstName: 'Dee', lastName: 'Dd' })
)

const leaves: SceneLine[] = [
  { speaker: '', text: 'Cara leaves.', actions: ['hide:cara_cc'] },
  { speaker: 'ann_aa', text: 'Alone at last.' }
]

const privateKiss: LedgerResponse = {
  acts: [{ kind: 'kiss', inPublic: false, chars: ['ann_aa', 'bea_bb'] }]
}

beforeEach(() => {
  useGameStore.getState().reset()
  useGameStore.setState({
    date: 3,
    time: 1,
    chars: ['a', 'b', 'c', 'd'],
    characters: people,
    charKeyToId: buildCharKeyToId(people),
    cast: ['a', 'b', 'c', 'd'],
    sceneLog: leaves,
    sceneSummary: 'They talked.'
  })
})

describe('sceneSawAll', () => {
  it('leaves out whoever left and whoever a private act went on without', () => {
    expect(sceneSawAll(privateKiss)).toEqual(['a', 'b'])
  })

  it('leaves out only whoever left when the ledger reported no act', () => {
    expect(sceneSawAll(null)).toEqual(['a', 'b', 'd'])
    expect(sceneSawAll({})).toEqual(['a', 'b', 'd'])
  })

  it('is what the boundary has always filed: the cast less the leavers, off the reported acts', () => {
    const { cast } = useGameStore.getState()
    for (const ledger of [privateKiss, {}, null]) {
      expect(sceneSawAll(ledger)).toEqual(castWhoSawAll(cast, sceneLeavers(), ledgerActs(ledger, false)))
    }
  })

  it('answers the same when read again, and files that with the encounter', () => {
    const first = sceneSawAll(privateKiss)
    useGameStore.getState().commitSceneToHistory(3, 1, first)
    expect(sceneSawAll(privateKiss)).toEqual(first)
    expect(useGameStore.getState().encounters[3]?.[1]?.saw).toEqual(['a', 'b'])
  })
})
