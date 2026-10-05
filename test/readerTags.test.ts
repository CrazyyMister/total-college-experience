import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  pickReaderTagger,
  sceneTagBars,
  tagSkipOf,
  type TagCandidate,
  type TagScene
} from '@shared/feedReplies'
import { emptyFlags } from '@shared/relationship'
import type { GameSave, LedgerResponse, ReaderTag } from '@shared/types'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { character, charInfo, playthroughRecord, restoreApi, stubApi } from './fixtures'

// The loop's modules subscribe to the bridge as they load.
stubApi({ jobs: { onProgress: () => () => {} } })
const { readerTagFor, readerTagSceneOf } = await import('../src/renderer/stores/loop/readerPosts')
const { loopState } = await import('../src/renderer/stores/loop/state')

/** A public scene that held nothing a post would expose. */
const CLEAN: TagScene = { inPublic: true, acts: 0, romance: 0, milestones: 0, dates: [] }

/** Somebody the scene held who may tag him. */
const MAY: TagCandidate = {
  charId: 'a',
  left: false,
  contact: true,
  blocked: false,
  disposition: 'friendly',
  posting: false
}

/** A contact of his who likes him well enough to tag him. */
function fondContact(over: Parameters<typeof charInfo>[0] = {}) {
  const loved = Array.from({ length: 12 }, () => ({ date: 4, type: 'loved' as const, desc: 'x' }))
  return charInfo({
    nameKnown: true,
    flags: { ...emptyFlags(), gaveContactInfo: true },
    memories: loved,
    ...over
  })
}

describe('which scenes may tag the reader', () => {
  it('lets a public scene that held nothing private through', () => {
    expect(sceneTagBars(CLEAN)).toEqual([])
    expect(sceneTagBars({ ...CLEAN, dates: [{ charId: 'a', isLover: true }] })).toEqual([])
  })

  it('bars a private scene, a kiss or a night, romance or wingman rows, his milestones and a date', () => {
    expect(sceneTagBars({ ...CLEAN, inPublic: false })).toHaveLength(1)
    expect(sceneTagBars({ ...CLEAN, acts: 1 })).toHaveLength(1)
    expect(sceneTagBars({ ...CLEAN, romance: 1 })).toHaveLength(1)
    expect(sceneTagBars({ ...CLEAN, milestones: 1 })).toHaveLength(1)
    expect(sceneTagBars({ ...CLEAN, dates: [{ charId: 'a', isLover: false }] })).toHaveLength(1)
  })
})

describe('who of the scene may tag the reader', () => {
  it('is a contact still in it at the end, unblocked, friendly or better and not posting for sure', () => {
    expect(tagSkipOf(MAY)).toBeNull()
    expect(tagSkipOf({ ...MAY, disposition: 'devoted' })).toBeNull()
    expect(tagSkipOf({ ...MAY, left: true })).not.toBeNull()
    expect(tagSkipOf({ ...MAY, contact: false })).not.toBeNull()
    expect(tagSkipOf({ ...MAY, blocked: true })).not.toBeNull()
    expect(tagSkipOf({ ...MAY, disposition: 'neutral' })).not.toBeNull()
    expect(tagSkipOf({ ...MAY, posting: true })).not.toBeNull()
  })

  it('takes the forced one past the chance only while she may, and nobody when none may', () => {
    const never = (): number => 0.99
    expect(pickReaderTagger(['a', 'b'], 'b', never).tagger).toBe('b')
    expect(pickReaderTagger(['a'], 'b', never).tagger).toBeNull()
    expect(pickReaderTagger([], 'b', () => 0).tagger).toBeNull()
    expect(pickReaderTagger(['a', 'b'], null, () => 0).tagger).not.toBeNull()
  })
})

describe('the scene the tag reads, off the store and the ledger as it came back', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({
      date: 4,
      time: 0,
      chars: ['a', 'm'],
      cast: ['a', 'm'],
      characters: {
        a: character({ charId: 'a', firstName: 'Ana', lastName: 'Diaz' }),
        m: character({ charId: 'm', firstName: 'Max', lastName: 'Hart', gender: 'man' })
      },
      charInfo: { a: fondContact(), m: fondContact() },
      sceneSummary: 'The reader and Ana studied at the library.'
    })
  })

  it('counts a kiss with somebody who is no romance of his and every romance or wingman row', () => {
    const ledger: LedgerResponse = {
      acts: [{ kind: 'kiss', inPublic: true, chars: ['max_hart'] }],
      romance: [{ kind: 'talked_up', from: 'ana_diaz', to: 'max_hart' }]
    }
    const scene = readerTagSceneOf(ledger)
    expect(scene.acts).toBe(1)
    expect(scene.romance).toBe(1)
    expect(readerTagFor(scene, useGameStore.getState().charInfo, new Set(), {})).toBeNull()
  })

  it('reads a scene arranged by text, and a plan for the slot with somebody cast, as a date', () => {
    useGameStore.setState({
      sceneTextLedgerSkip: 'a',
      events: [
        {
          id: 'e',
          date: 4,
          time: 0,
          title: 'Lunch',
          description: 'Lunch with Max.',
          charIds: ['m'],
          madeOn: { date: 3, time: 1 }
        }
      ]
    })
    expect(readerTagSceneOf({}).dates.map(({ charId }) => charId).sort()).toEqual(['a', 'm'])
  })

  it('never has somebody posting for sure tag him, and asks for the forced one with the cast', () => {
    const scene = readerTagSceneOf({})
    const { charInfo: info } = useGameStore.getState()
    loopState.debugReaderTagger = 'a'
    expect(readerTagFor(scene, info, new Set(['a']), {}, () => 0.99)).toBeNull()
    const ask = readerTagFor(scene, info, new Set(), {}, () => 0.99)
    expect(ask).toMatchObject({ charId: 'a', castIds: ['a', 'm'], summary: scene.summary })
    loopState.debugReaderTagger = null
  })
})

describe('filing a post that tags the reader', () => {
  const tag: ReaderTag = { charId: 'a', postId: 't1', text: 'library grind w/ the crew', likes: 4 }

  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({ date: 5, time: 1, chars: ['a'], charInfo: { a: fondContact() } })
  })

  it('files it once however often the boundary replays, and keeps it whole through the save', () => {
    useGameStore.getState().deliverReaderTag(tag)
    useGameStore.getState().deliverReaderTag(tag)
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().charInfo.a.feed).toEqual([
      { id: 't1', text: 'library grind w/ the crew', date: 5, time: 1, likes: 4, tagsReader: true }
    ])
  })

  it('files nothing for a contact who has blocked him by then', () => {
    useGameStore.setState({
      charInfo: {
        a: fondContact({ flags: { ...emptyFlags(), gaveContactInfo: true, blocked: true } })
      }
    })
    useGameStore.getState().deliverReaderTag(tag)
    expect(useGameStore.getState().charInfo.a.feed ?? []).toEqual([])
  })
})

afterAll(() => restoreApi())
