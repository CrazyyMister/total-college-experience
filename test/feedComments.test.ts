import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { charKeyOf, type GameSave, type ReaderComment, type SocialPost } from '@shared/types'
import { commentsThisSlot, withAnsweredComment } from '@shared/feedReplies'
import { emptyFlags } from '@shared/relationship'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { character, charInfo, playthroughRecord, restoreApi, stubApi } from './fixtures'

// The loop's modules subscribe to the bridge as they load.
stubApi({ jobs: { onProgress: () => () => {} } })
const { startReaderFeedAnswers } = await import('../src/renderer/stores/loop/readerPosts')

/** A post of hers, as her feed keeps it. */
function post(id: string, over: Partial<SocialPost> = {}): SocialPost {
  return { id, text: 'finally done with midterms', date: 4, time: 0, likes: 3, ...over }
}

/** His comment, waiting on her reply. */
function comment(id: string, over: Partial<ReaderComment> = {}): ReaderComment {
  return { id, text: 'congrats!!', date: 4, time: 1, ...over }
}

/** A contact of his whose feed holds `feed`. */
function contactInfo(feed: SocialPost[], over: Parameters<typeof charInfo>[0] = {}) {
  return charInfo({
    nameKnown: true,
    flags: { ...emptyFlags(), gaveContactInfo: true },
    feed,
    ...over
  })
}

describe("the cap on the reader's comments in one half of the day", () => {
  it('is counted off the comments on the posts, so taking one back frees its place', () => {
    const first = [post('a', { comment: comment('c1') }), post('b', { comment: comment('c2') })]
    const second = [post('c', { comment: comment('c3', { date: 3 }) }), post('d')]
    expect(commentsThisSlot([first, second, undefined], 4, 1)).toBe(2)
    expect(commentsThisSlot([[post('a', { comment: comment('c1') }), post('b')], second], 4, 1)).toBe(1)
  })
})

describe("applying what an ending decided of the reader's comments", () => {
  const answer = { charId: 'x', postId: 'a', commentId: 'c1', reply: 'thank youuu' }

  it('stamps the comment named with the slot and her reply', () => {
    const answered = withAnsweredComment(post('a', { comment: comment('c1') }), answer, 5, 0, true)
    expect(answered.comment).toEqual({
      ...comment('c1'),
      answered: { date: 5, time: 0 },
      reply: 'thank youuu'
    })
  })

  it('changes nothing on a replayed boundary, nor on a comment the answer does not name', () => {
    const once = withAnsweredComment(post('a', { comment: comment('c1') }), answer, 5, 0, true)
    expect(withAnsweredComment(once, { ...answer, reply: 'other' }, 6, 1, true)).toBe(once)
    const other = post('a', { comment: comment('c9') })
    expect(withAnsweredComment(other, answer, 5, 0, true)).toBe(other)
  })
})

describe("the reader's comments through the store and the save", () => {
  beforeEach(() => useGameStore.getState().reset())

  it('drops the reply of a contact who has blocked him, answering the comment all the same', () => {
    useGameStore.setState({
      date: 5,
      time: 0,
      charInfo: {
        x: contactInfo([post('a', { comment: comment('c1') })], {
          flags: { ...emptyFlags(), gaveContactInfo: true, blocked: true }
        })
      }
    })
    useGameStore
      .getState()
      .answerReaderComments([{ charId: 'x', postId: 'a', commentId: 'c1', reply: 'ok' }])
    expect(useGameStore.getState().charInfo.x.feed?.[0].comment).toEqual({
      ...comment('c1'),
      answered: { date: 5, time: 0 }
    })
  })

  it('keeps a comment and her reply whole, applied once however often the boundary replays', () => {
    useGameStore.setState({
      date: 5,
      time: 0,
      charInfo: { x: contactInfo([post('a', { comment: comment('c1') })]) }
    })
    const answers = [{ charId: 'x', postId: 'a', commentId: 'c1', reply: 'thank youuu' }]
    useGameStore.getState().answerReaderComments(answers)
    useGameStore.getState().answerReaderComments(answers)
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().charInfo.x.feed?.[0].comment).toEqual({
      ...comment('c1'),
      answered: { date: 5, time: 0 },
      reply: 'thank youuu'
    })
  })
})

describe('who answers a comment of his', () => {
  it('asks a contact for her reply and never a hostile one, answered with none', async () => {
    const hated = Array.from({ length: 12 }, () => ({ date: 4, type: 'hated' as const, desc: 'x' }))
    useGameStore.getState().reset()
    useGameStore.setState({
      date: 4,
      time: 1,
      chars: ['h', 'n'],
      characters: {
        h: character({ charId: 'h', firstName: 'Hana', lastName: 'Lee' }),
        n: character({ charId: 'n', firstName: 'Nia', lastName: 'Cole' })
      },
      charInfo: {
        h: contactInfo([post('ph', { comment: comment('ch') })], { memories: hated }),
        n: contactInfo([post('pn', { comment: comment('cn') })])
      }
    })
    const completeFeedReplies = vi.fn(async () => ({
      ok: true as const,
      data: { replies: [{ who: charKeyOf('Nia', 'Cole'), text: 'haha thanks' }] }
    }))
    stubApi({
      llm: { completeFeedReplies },
      jobs: { cancelGroup: vi.fn(async () => ({ ok: true as const, data: undefined })) }
    })

    const game = useGameStore.getState()
    const { comments } = await startReaderFeedAnswers(game.charInfo, game.stats, {
      group: 'test',
      stale: () => false
    }).settle()

    expect(completeFeedReplies).toHaveBeenCalledTimes(1)
    expect(comments).toEqual([
      { charId: 'h', postId: 'ph', commentId: 'ch' },
      { charId: 'n', postId: 'pn', commentId: 'cn', reply: 'haha thanks' }
    ])
  })
})

afterAll(() => restoreApi())
