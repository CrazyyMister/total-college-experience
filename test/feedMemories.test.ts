import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { feedExchangesOf } from '@shared/feedReplies'
import { emptyFlags, phoneMemoryDesc } from '@shared/relationship'
import type { GameSave, LedgerResponse, ReaderPost, SocialPost, TimeSlot } from '@shared/types'
import { fittedTextLedger } from '../src/renderer/prompts/textLedgerPrompt'
import type { SchedulePromptInput } from '../src/renderer/prompts/schedulePrompt'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { character, charInfo, charactersById, playthroughRecord, restoreApi, stubApi } from './fixtures'

// `gameLoop` reaches `jobStore`, which subscribes to `jobs:progress` at module scope.
stubApi({ jobs: { onProgress: () => () => {} } })
const { textLedgerKeyOf } = await import('../src/renderer/stores/gameLoop')
const { applyLedger } = await import('../src/renderer/stores/sceneSanitizer')

const here = { date: 5, time: 0 as TimeSlot }

/** A post of his, answered in `at`, with the replies given. */
function mine(
  id: string,
  replies: ReaderPost['replies'],
  at: { date: number; time: TimeSlot } | undefined = here
): ReaderPost {
  return { id, text: 'aced my midterm', date: 4, time: 1, ...(at ? { answered: at } : {}), ...(replies ? { replies } : {}) }
}

/** A post of hers carrying his comment. */
function hers(id: string, comment: NonNullable<SocialPost['comment']>): SocialPost {
  return { id, text: 'library again', date: 4, time: 1, likes: 2, comment }
}

describe('which exchanges on the feed the phone summary reads', () => {
  const posts = [
    mine('p1', [
      { charId: 'a', text: 'proud of you!' },
      { handle: 'anon', emoji: '😀', text: 'nice' }
    ]),
    mine('p2', [{ charId: 'b', text: 'late reply' }], { date: 4, time: 1 }),
    mine('p3', undefined, undefined)
  ]

  it("takes a contact's reply to his post that landed this slot, and never a student's", () => {
    const found = feedExchangesOf(posts, [], here.date, here.time)
    expect(found).toEqual([
      { charId: 'a', id: 'p1', reader: 'aced my midterm', reply: 'proud of you!' }
    ])
  })

  it('takes a comment she answered this slot with her post as context, and never one she did not', () => {
    const feeds: Array<{ charId: string; feed: SocialPost[] }> = [
      {
        charId: 'a',
        feed: [
          hers('x', { id: 'c1', text: 'same', date: 4, time: 1, answered: here, reply: 'haha' }),
          hers('y', { id: 'c2', text: 'lol', date: 4, time: 1, answered: here }),
          hers('z', { id: 'c3', text: 'hm', date: 4, time: 1 })
        ]
      },
      // A tagged post nobody commented on is nothing he wrote.
      { charId: 'b', feed: [{ id: 't', text: 'with the crew', date: 4, time: 1 as TimeSlot, likes: 1, tagsReader: true as const }] }
    ]
    expect(feedExchangesOf([], feeds, here.date, here.time)).toEqual([
      { charId: 'a', id: 'c1', herPost: 'library again', reader: 'same', reply: 'haha' }
    ])
  })
})

describe('the key the phone summary is claimed under', () => {
  const base: SchedulePromptInput = {
    date: 5,
    time: 0,
    threads: [
      {
        charKey: 'mina_okafor',
        firstName: 'Mina',
        messages: [{ id: 'm1', sender: 'player', text: 'hey', date: 5, time: 0 }]
      }
    ],
    characters: {},
    planned: []
  }

  it('is what it was before the feed was read where the slot has no exchange', () => {
    expect(textLedgerKeyOf(base)).toBe('10|mina_okafor:m1')
    expect(textLedgerKeyOf({ ...base, feed: [] })).toBe('10|mina_okafor:m1')
  })

  it('changes with an exchange, and is the same for the same exchanges', () => {
    const feed = [{ charId: 'a', id: 'p1', reader: 'x', reply: 'y', charKey: 'ana_diaz', firstName: 'Ana' }]
    const keyed = textLedgerKeyOf({ ...base, feed })
    expect(keyed).not.toBe(textLedgerKeyOf(base))
    expect(textLedgerKeyOf({ ...base, feed })).toBe(keyed)
  })
})

describe('what the texting ledger may file', () => {
  const ana = character({ charId: 'a', firstName: 'Ana', lastName: 'Diaz' })
  const mina = character({ charId: 'm', firstName: 'Mina', lastName: 'Okafor' })
  const lee = character({ charId: 'l', firstName: 'Lee', lastName: 'Park' })
  const schedule: SchedulePromptInput = {
    date: 5,
    time: 0,
    threads: [
      {
        charKey: 'mina_okafor',
        firstName: 'Mina',
        messages: [{ id: 'm1', sender: 'player', text: 'hey', date: 5, time: 0 }]
      }
    ],
    feed: [{ charId: 'a', id: 'p1', reader: 'x', reply: 'y', charKey: 'ana_diaz', firstName: 'Ana' }],
    characters: charactersById(ana, mina, lee),
    planned: []
  }
  const plan = (chars: string[]): NonNullable<LedgerResponse['plans']>[number] => ({
    slot: 12,
    title: 'Dinner',
    description: 'Dinner somewhere.',
    chars
  })

  it('drops an event or a plan from somebody he did not text, and says why', () => {
    const { reply, report } = fittedTextLedger(
      {
        events: [
          { charKey: 'ana_diaz', event: 'became_lovers' },
          { charKey: 'mina_okafor', event: 'broke_up' }
        ],
        textMemories: [],
        plans: [plan(['ana_diaz']), plan(['ana_diaz', 'mina_okafor'])]
      },
      schedule
    )
    expect(reply.events).toEqual([{ charKey: 'mina_okafor', event: 'broke_up' }])
    expect(reply.plans).toEqual([plan(['ana_diaz', 'mina_okafor'])])
    expect(report).toHaveLength(2)
  })

  it('keeps a memory for each who texted or met him on the feed and drops the rest', () => {
    const { reply } = fittedTextLedger(
      {
        textMemories: [
          { charKey: 'ana_diaz', source: 'feed', type: 'liked', desc: 'the reader posted' },
          { charKey: 'mina_okafor', source: 'texts', type: 'liked', desc: 'the reader texted' },
          { charKey: 'lee_park', source: 'texts', type: 'liked', desc: 'the reader never met' }
        ]
      },
      schedule
    )
    expect(reply.textMemories?.map((row) => row.charKey)).toEqual(['ana_diaz', 'mina_okafor'])
  })

  it('puts a wrong source down to where she was with him, and texts where it was both', () => {
    const both: SchedulePromptInput = {
      ...schedule,
      feed: [{ charId: 'm', id: 'p1', reader: 'x', reply: 'y', charKey: 'mina_okafor', firstName: 'Mina' }]
    }
    const { reply } = fittedTextLedger(
      {
        textMemories: [
          { charKey: 'ana_diaz', source: 'texts', type: 'liked', desc: 'a' },
          { charKey: 'mina_okafor', source: 'feed', type: 'liked', desc: 'b' }
        ]
      },
      schedule
    )
    expect(reply.textMemories?.map((row) => row.source)).toEqual(['feed', 'texts'])
    expect(both.feed).toHaveLength(1)
  })
})

describe('the phone memory through the store and the save', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({
      date: 5,
      time: 0,
      chars: ['a'],
      characters: { a: character({ charId: 'a', firstName: 'Ana', lastName: 'Diaz' }) },
      charKeyToId: { ana_diaz: 'a' },
      charInfo: { a: charInfo({ flags: { ...emptyFlags(), gaveContactInfo: true } }) }
    })
  })

  it('keeps where a memory came from, and reads an older save as his texts', () => {
    useGameStore.getState().setTextMemory('a', { date: 5, type: 'liked', desc: 'the reader posted' }, 'feed')
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().charInfo.a.textMemorySource).toBe('feed')

    useGameStore.getState().setTextMemory('a', { date: 6, type: 'liked', desc: 'the reader texted' }, 'texts')
    expect(useGameStore.getState().charInfo.a.textMemorySource).toBeUndefined()
    expect(phoneMemoryDesc('the reader posted.', 'feed')).toBe('the reader posted on Bunnyboard.')
    expect(phoneMemoryDesc('the reader texted')).toBe('the reader texted over text.')
  })

  it('files a ledger row with no source as his texts', () => {
    applyLedger({ textMemories: [{ charKey: 'ana_diaz', type: 'liked', desc: 'the reader texted' }] })
    expect(useGameStore.getState().charInfo.a.textMemorySource).toBeUndefined()
    applyLedger({
      textMemories: [{ charKey: 'ana_diaz', source: 'feed', type: 'liked', desc: 'the reader posted' }]
    })
    expect(useGameStore.getState().charInfo.a.textMemorySource).toBe('feed')
  })
})

afterAll(() => restoreApi())
