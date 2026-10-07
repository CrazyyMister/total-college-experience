import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryAt, type TimeSlot } from '@shared/types'
import { buildCharKeyToId, useGameStore } from '../src/renderer/stores/gameStore'
import { character, charactersById, charInfo, restoreApi, stubApi } from './fixtures'

/**
 * The development build's worst-case summary button must leave a game exactly as it found it:
 * its replies are thrown away, and the tokens the transport credits for them are handed back.
 */

const completeLedger = vi.fn()
const completeFacts = vi.fn()
// Everything but the two calls the button makes throws, and so would a write to disk; the job
// store subscribes at import, so the bridge has to exist before the import and again each test.
const bridge = { llm: { completeLedger, completeFacts }, jobs: { onProgress: () => () => {} } }
stubApi(bridge)
const { sendWorstCaseRequests } = await import('../src/renderer/stores/worstCaseDebug')

const roster = charactersById(
  character({ charId: 'a', firstName: 'Sarah', lastName: 'Rose' }),
  character({ charId: 'b', firstName: 'Mina', lastName: 'Kwon' }),
  character({ charId: 'c', firstName: 'Hazel', lastName: 'Kim' }),
  character({ charId: 'd', firstName: 'Ivy', lastName: 'Park' })
)

/** What a cloud reply costs, credited the way the bridge's event credits it. */
const credit = (tokens: number): void => useGameStore.getState().recordTokens(tokens)

/** The game the button is pressed in: a roster with memories, a fact and 40 tokens already on the tally. */
function loadedGame(): void {
  useGameStore.getState().reset()
  useGameStore.setState({
    date: 9,
    time: 1 as TimeSlot,
    chars: ['a', 'b', 'c', 'd'],
    characters: roster,
    charKeyToId: buildCharKeyToId(roster),
    charInfo: {
      a: charInfo({ nameKnown: true, memories: [memoryAt({ date: 8, time: 0 }, 'liked', 'the reader was kind')] }),
      b: charInfo({ nameKnown: true }),
      c: charInfo({ nameKnown: false }),
      d: charInfo({ nameKnown: true })
    },
    facts: [
      {
        id: 'd8t0n0',
        about: 'a',
        category: 'family',
        text: 'has a younger brother',
        kind: 'happened',
        knownBy: ['a'],
        date: 8,
        time: 0
      }
    ],
    tallies: { ...useGameStore.getState().tallies, tokensGenerated: 40 }
  })
}

beforeEach(() => {
  completeLedger.mockReset()
  completeFacts.mockReset()
  stubApi(bridge)
  loadedGame()
})
afterEach(restoreApi)

describe('the worst-case summary button', () => {
  it('writes nothing and hands back the tokens the replies were credited, mid-way or late', async () => {
    completeLedger.mockImplementation(async () => {
      credit(500)
      return { ok: true, data: {} }
    })
    completeFacts.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      credit(300)
      return { ok: true, data: {} }
    })
    const before = useGameStore.getState()
    const snapshot = JSON.stringify({
      charInfo: before.charInfo,
      facts: before.facts,
      history: before.history,
      encounters: before.encounters,
      npcRomance: before.npcRomance,
      bunnyboard: before.bunnyboard
    })

    const result = await sendWorstCaseRequests()

    expect(result.ok).toBe(true)
    expect(result.text).toContain('Ledger')
    expect(completeLedger).toHaveBeenCalledTimes(1)
    expect(completeFacts).toHaveBeenCalledTimes(1)
    const after = useGameStore.getState()
    expect(after.tallies.tokensGenerated).toBe(40)
    expect(
      JSON.stringify({
        charInfo: after.charInfo,
        facts: after.facts,
        history: after.history,
        encounters: after.encounters,
        npcRomance: after.npcRomance,
        bunnyboard: after.bunnyboard
      })
    ).toBe(snapshot)
  })

  it('reports a failed reply by its code, sends nothing twice and still hands the tokens back', async () => {
    completeLedger.mockResolvedValue({ ok: false, error: { code: 'LLM_SCHEMA_REJECTED' } })
    completeFacts.mockImplementation(async () => {
      credit(120)
      return { ok: true, data: {} }
    })

    const result = await sendWorstCaseRequests()

    expect(result.ok).toBe(false)
    expect(result.text).toContain('LLM_SCHEMA_REJECTED')
    expect(completeLedger).toHaveBeenCalledTimes(1)
    expect(useGameStore.getState().tallies.tokensGenerated).toBe(40)
  })

  it('refuses while a reply is out, sending nothing', async () => {
    useGameStore.setState({ streaming: true })

    const result = await sendWorstCaseRequests()

    expect(result.ok).toBe(false)
    expect(completeLedger).not.toHaveBeenCalled()
    expect(completeFacts).not.toHaveBeenCalled()
  })
})
