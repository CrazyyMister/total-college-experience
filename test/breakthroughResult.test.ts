import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BREAKTHROUGH_MEMORY_TYPE,
  breakthroughMeterOf,
  breakthroughResults,
  lastBreakthroughUse,
  withBreakthroughUse
} from '@shared/breakthrough'
import {
  BREAKTHROUGH_OUTCOMES,
  memoryAt,
  type GameSave,
  type LedgerResponse,
  type Result,
  type SceneState,
  type TimeSlot
} from '@shared/types'
import { buildLedgerPrompt } from '../src/renderer/prompts/scenePrompt'
import { buildCharKeyToId, useGameStore } from '../src/renderer/stores/gameStore'
import { memoryEditRows, memoryEditsOf } from '../src/renderer/stores/loop/memoryEdit'
import { queuedScene } from '../src/renderer/stores/loop/saves'
import { loopState, resetLoopState } from '../src/renderer/stores/loop/state'
import {
  applyLedger,
  bondedCharIds,
  breakthroughOutcomesOf,
  ledgerMemories,
  likedCharIds
} from '../src/renderer/stores/sceneSanitizer'
import { character, charactersById, charInfo, playthroughRecord, restoreApi, stubApi } from './fixtures'

/**
 * The Breakthrough's result: what the ledger's reply is held to, the memory the code files from
 * it, and that the memory survives every way the scene can be reloaded before the boundary files it.
 */

stubApi({ jobs: { onProgress: () => () => {} } })
const { enterGame } = await import('../src/renderer/stores/gameLoop')

const sarah = character({ charId: 'a', firstName: 'Sarah', lastName: 'Rose' })
const mina = character({ charId: 'b', firstName: 'Mina', lastName: 'Kwon' })
const roster = charactersById(sarah, mina)

const DESC = 'the reader leaned in and she met him halfway'

/** A ledger that answers for Sarah alone. */
function ledgerFor(outcome: string, desc = DESC): LedgerResponse {
  return {
    memories: [],
    breakthroughs: [{ charKey: 'sarah_rose', outcome: outcome as 'worked', desc }]
  }
}

/** The store as it stands at the end of a scene in which the reader used Sarah's Breakthrough. */
function usedOnSarah(): void {
  useGameStore.getState().reset()
  useGameStore.setState({
    date: 7,
    time: 1 as TimeSlot,
    chars: ['a', 'b'],
    characters: roster,
    charKeyToId: buildCharKeyToId(roster),
    charInfo: { a: charInfo({ nameKnown: true }), b: charInfo({ nameKnown: true }) },
    cast: ['a'],
    currentSceneTranscript: [
      { speaker: 'reader', text: 'I wave.' },
      { speaker: 'reader', text: 'I lean in.' }
    ],
    sceneBreakthroughs: [{ charId: 'a', direction: 'closer', at: 1 }]
  })
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  resetLoopState()
  const nothing = vi.fn(async (): Promise<Result<Record<string, never>>> => ({ ok: true, data: {} }))
  stubApi({
    chars: { cgs: nothing, outfits: nothing, room: nothing },
    saves: {
      readProfilePicture: vi.fn(
        async (): Promise<Result<Uint8Array<ArrayBuffer> | null>> => ({ ok: true, data: null })
      )
    }
  })
  usedOnSarah()
})

afterEach(() => {
  restoreApi()
  vi.restoreAllMocks()
})

describe('breakthroughResults holds the reply to the scene', () => {
  const idOf = (key: string): string | undefined => ({ sarah_rose: 'a', mina_kwon: 'b' })[key]
  const used = new Set(['a'])
  const row = (charKey: string, outcome: string, desc = DESC) => ({
    charKey,
    outcome: outcome as 'worked',
    desc
  })

  it('keeps a result for somebody who used it', () => {
    expect(breakthroughResults([row('sarah_rose', 'partly')], used, idOf)).toEqual([
      { charId: 'a', outcome: 'partly', desc: DESC }
    ])
  })

  it('drops a result for somebody who made no use, and one for nobody', () => {
    const warn = vi.fn()
    const rows = [row('mina_kwon', 'worked'), row('nobody_here', 'worked')]
    expect(breakthroughResults(rows, used, idOf, warn)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('drops a result off the list', () => {
    expect(breakthroughResults([row('sarah_rose', 'triumph')], used, idOf)).toEqual([])
  })

  it('drops a repeat and keeps the first', () => {
    const rows = [row('sarah_rose', 'worked'), row('sarah_rose', 'failed')]
    expect(breakthroughResults(rows, used, idOf)).toEqual([
      { charId: 'a', outcome: 'worked', desc: DESC }
    ])
  })

  it('keeps the result of an empty sentence, with no sentence', () => {
    expect(breakthroughResults([row('sarah_rose', 'failed', '   ')], used, idOf)).toEqual([
      { charId: 'a', outcome: 'failed', desc: '' }
    ])
  })

  it('gives nothing for a use the reply says nothing about, and says so', () => {
    const warn = vi.fn()
    expect(breakthroughResults(undefined, used, idOf, warn)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('the memory a result files', () => {
  it('takes its verb from the result, never from the reply', () => {
    for (const outcome of BREAKTHROUGH_OUTCOMES) {
      const [memory] = ledgerMemories(ledgerFor(outcome), false)
      expect(memory).toEqual({
        charId: 'a',
        type: BREAKTHROUGH_MEMORY_TYPE[outcome],
        desc: DESC,
        mark: 'breakthrough'
      })
    }
    expect(BREAKTHROUGH_MEMORY_TYPE).toEqual({ worked: 'loved', partly: 'liked', failed: 'disliked' })
  })

  it('files no memory where the reply gave no sentence, but the use keeps its result', () => {
    const ledger = ledgerFor('worked', '')
    expect(ledgerMemories(ledger, false)).toEqual([])
    expect(breakthroughOutcomesOf(ledger)).toEqual({ a: 'worked' })
  })

  it('counts for her affection but opens neither the crush roll nor the bonded list', () => {
    const ledger = ledgerFor('worked')
    expect(likedCharIds(ledger)).toEqual([])
    expect(bondedCharIds(ledger)).toEqual([])
    // An ordinary memory beside it still does both.
    const withOrdinary = {
      ...ledger,
      memories: [{ charKey: 'sarah_rose', type: 'liked' as const, desc: 'the reader was kind' }]
    }
    expect(likedCharIds(withOrdinary)).toEqual(['a'])
    expect(bondedCharIds(withOrdinary)).toEqual(['a'])
  })
})

describe('a boundary run twice', () => {
  /** What the boundary does with the ledger that this part owns. */
  function boundary(ledger: LedgerResponse): void {
    applyLedger(ledger)
    useGameStore.getState().recordBreakthroughs(breakthroughOutcomesOf(ledger))
  }

  it('files the marked memory and the use once, as many times as the save before it is loaded', () => {
    const ledger = ledgerFor('partly')
    const before = useGameStore.getState().charInfo
    boundary(ledger)
    const once = useGameStore.getState().charInfo

    expect(once.a.memories).toEqual([
      { date: 7, time: 1, type: 'liked', desc: DESC, mark: 'breakthrough' }
    ])
    expect(once.a.breakthroughUses).toEqual([
      { date: 7, time: 1, direction: 'closer', outcome: 'partly' }
    ])

    // The replay starts from the save before the boundary, so it lands the same values.
    useGameStore.setState({ charInfo: before })
    boundary(ledger)
    expect(useGameStore.getState().charInfo).toEqual(once)
  })

  it('leaves the use filed once where the boundary files it again on the same state', () => {
    const ledger = ledgerFor('failed')
    useGameStore.getState().recordBreakthroughs(breakthroughOutcomesOf(ledger))
    useGameStore.getState().recordBreakthroughs(breakthroughOutcomesOf(ledger))
    expect(useGameStore.getState().charInfo.a.breakthroughUses).toHaveLength(1)
    expect(useGameStore.getState().charInfo.a.breakthroughUses?.[0].outcome).toBe('failed')
  })

  it('does not rewrite a use already filed with another result', () => {
    const filed = withBreakthroughUse(undefined, { date: 7, time: 1, direction: 'closer' })
    expect(filed).not.toBeNull()
    useGameStore.setState({
      charInfo: { ...useGameStore.getState().charInfo, a: charInfo({ breakthroughUses: filed ?? [] }) }
    })
    useGameStore.getState().recordBreakthroughs({ a: 'worked' })
    expect(useGameStore.getState().charInfo.a.breakthroughUses).toEqual(filed)
  })

  it('leaves her meter empty: the marked memory is of the use’s own half of the day', () => {
    boundary(ledgerFor('worked'))
    const info = useGameStore.getState().charInfo.a
    expect(breakthroughMeterOf(info, lastBreakthroughUse(info.breakthroughUses))).toBe(0)
  })
})

describe('a reload before the boundary files the result', () => {
  const when = { date: 7, time: 1 as TimeSlot }

  /** A save of the store at the scene's ending, the ledger carried, as the ending's autosave is composed. */
  function endingSave(): GameSave {
    const base = useGameStore.getState().captureScene()
    const scene: SceneState = queuedScene(base, [], { endPending: true, ledger: ledgerFor('worked') })
    useGameStore.getState().reset()
    return {
      ...useGameStore.getState().toGameSave(),
      playthroughId: 'p1',
      saveId: 'autosave',
      saveDate: 7,
      charInfo: { a: charInfo({ nameKnown: true }), b: charInfo({ nameKnown: true }) },
      scene
    }
  }

  it('carries the uses into the ending’s autosave', () => {
    const base = useGameStore.getState().captureScene()
    // The base was taken before the use, as a turn's snapshot can be in a save from before it.
    const stale = base ? { ...base, breakthroughs: undefined } : null
    const scene = queuedScene(stale, [], { endPending: true })
    expect(scene.breakthroughs).toEqual([{ charId: 'a', direction: 'closer', at: 1 }])
  })

  it('loads the autosave of the scene’s end with the use and the memory both there, once', () => {
    const save = endingSave()
    const record = playthroughRecord({ chars: ['a', 'b'] })
    enterGame(save, record, roster)

    expect(useGameStore.getState().sceneBreakthroughs).toEqual([
      { charId: 'a', direction: 'closer', at: 1 }
    ])
    const ledger = loopState.pendingLedgerResult
    expect(ledger).not.toBeNull()
    expect(ledgerMemories(ledger!, false)).toEqual([
      { charId: 'a', type: 'loved', desc: DESC, mark: 'breakthrough' }
    ])
  })

  it('asks the memory question again, with the marked row, after a second reload', () => {
    const save = endingSave()
    const record = playthroughRecord({ chars: ['a', 'b'] })
    const rowsOf = (): unknown =>
      memoryEditRows(
        ['a'],
        ledgerMemories(loopState.pendingLedgerResult!, false),
        when
      )

    enterGame(save, record, roster)
    const first = rowsOf()
    // Reloading the same save, with the question still unanswered, asks it the same.
    enterGame(save, record, roster)
    expect(rowsOf()).toEqual(first)
    expect(first).toEqual([{ charId: 'a', applied: memoryAt(when, 'loved', DESC, 'breakthrough') }])
  })
})

describe('editing the marked memory', () => {
  const when = { date: 7, time: 1 as TimeSlot }
  const marked = memoryAt(when, 'loved', DESC, 'breakthrough')
  const rows = [{ charId: 'a', applied: marked }]

  it('keeps the mark and the half of the day when the review rewrites it', () => {
    const [edit] = memoryEditsOf(rows, [{ type: 'liked', desc: 'she smiled and said no' }], when)
    expect(edit.next).toEqual({ ...marked, type: 'liked', desc: 'she smiled and said no' })
  })

  it('drops it when the review blanks it', () => {
    const [edit] = memoryEditsOf(rows, [{ type: 'loved', desc: '' }], when)
    expect(edit.next).toBeNull()
  })

  it('keeps the mark when the contact page rewrites it', () => {
    useGameStore.setState({
      charInfo: { ...useGameStore.getState().charInfo, a: charInfo({ memories: [marked] }) }
    })
    useGameStore
      .getState()
      .replaceMemory('a', marked, { ...marked, type: 'hated', desc: 'she walked away' })
    expect(useGameStore.getState().charInfo.a.memories).toEqual([
      { ...marked, type: 'hated', desc: 'she walked away' }
    ])
  })
})

describe('the ledger request for a scene that used a Breakthrough', () => {
  const state = {
    playthroughId: 'p1',
    date: 7,
    time: 1 as TimeSlot,
    seedWord: 'aspen',
    backgrounds: { interior: ['library'], exterior: ['quad'] },
    charInfo: {},
    homeMoves: {},
    npcRelationships: {},
    roster: [],
    classes: {},
    playerSchedule: {},
    occasions: [],
    bg: null,
    classCode: null,
    projectClass: null,
    playerJob: null,
    jobId: null,
    visitJobId: null,
    giftNotes: [],
    emotions: {},
    onStage: [],
    lessNsfwText: false,
    cgReady: {},
    outfitReady: {},
    roomReady: {}
  }
  const schedule = { date: 7, time: 1 as TimeSlot, threads: [], characters: roster, planned: [] }

  function fieldOf(uses: Array<{ character: typeof sarah; direction: string; quote: string }>) {
    const { schema } = buildLedgerPrompt([sarah, mina], [], state, 'READER', schedule, uses)
    const props = schema.schema.properties as Record<string, { items?: { properties: Record<string, { enum?: string[] }> } }>
    return { props, required: schema.schema.required as string[] }
  }

  it('asks for the field only when a use was made, and for nobody else', () => {
    const asked = fieldOf([{ character: sarah, direction: 'closer', quote: 'I lean in.' }])
    expect(asked.required).toContain('breakthroughs')
    const items = asked.props.breakthroughs.items?.properties
    expect(items?.charKey.enum).toEqual(['sarah_rose'])
    expect(items?.outcome.enum).toEqual([...BREAKTHROUGH_OUTCOMES])

    const none = fieldOf([])
    expect(none.required).not.toContain('breakthroughs')
    expect(none.props.breakthroughs).toBeUndefined()
  })
})
