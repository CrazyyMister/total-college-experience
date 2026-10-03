import { beforeEach, describe, expect, it } from 'vitest'

import {
  pickReplyingContacts,
  pickReplyStrangers,
  readerPostLikes,
  withAnsweredPosts,
  type LikingContact,
  type ReplyingContact
} from '@shared/feedReplies'
import type { GameSave, ReaderPost } from '@shared/types'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { playthroughRecord } from './fixtures'

/** A post of his, waiting on its likes. */
function post(id: string, over: Partial<ReaderPost> = {}): ReaderPost {
  return { id, text: 'first day of class lol', date: 3, time: 0, ...over }
}

describe("the likes on the reader's posts", () => {
  const contacts: LikingContact[] = [
    { disposition: 'friendly', isLover: false },
    { disposition: 'neutral', isLover: false },
    { disposition: 'hostile', isLover: true }
  ]

  it('come to the same count for the same post and the same contacts', () => {
    expect(readerPostLikes('p1', contacts, 3)).toBe(readerPostLikes('p1', contacts, 3))
  })

  it('always count his lover, and never somebody who hates him', () => {
    for (let at = 0; at < 50; at++) {
      const id = `p${at}`
      const lover = readerPostLikes(id, [{ disposition: 'hostile', isLover: true }], 1)
      const hater = readerPostLikes(id, [{ disposition: 'hostile', isLover: false }], 1)
      expect(lover).toBe(hater + 1)
    }
  })
})

describe("applying what an ending decided of the reader's posts", () => {
  it('stamps each named post with the slot and its likes, and leaves the rest waiting', () => {
    const posts = withAnsweredPosts([post('a'), post('b')], [{ postId: 'a', likes: 6 }], 4, 1, everyone)
    expect(posts[0]).toEqual({ ...post('a'), answered: { date: 4, time: 1 }, likes: 6 })
    expect(posts[1]).toEqual(post('b'))
  })

  it('changes nothing on a replayed boundary', () => {
    const once = withAnsweredPosts(
      [post('a')],
      [{ postId: 'a', likes: 6, replies: [{ charId: 'c1', text: 'nice' }] }],
      4,
      1,
      everyone
    )
    const twice = withAnsweredPosts(
      once,
      [{ postId: 'a', likes: 9, replies: [{ charId: 'c2', text: 'lol' }] }],
      5,
      0,
      everyone
    )
    expect(twice).toEqual(once)
  })

  it('drops the reply of a contact who is no longer one, and keeps the rest', () => {
    const [answered] = withAnsweredPosts(
      [post('a')],
      [
        {
          postId: 'a',
          likes: 2,
          replies: [
            { charId: 'gone', text: 'cute' },
            { charId: 'kept', text: 'nice' },
            { handle: 'quadcat', emoji: '🐱', text: 'real' }
          ]
        }
      ],
      4,
      1,
      (charId) => charId !== 'gone'
    )
    expect(answered.replies).toEqual([
      { charId: 'kept', text: 'nice' },
      { handle: 'quadcat', emoji: '🐱', text: 'real' }
    ])
  })
})

/** Every contact counts as still his. */
function everyone(): boolean {
  return true
}

/** A contact as the replies read her. */
function contact(charId: string, over: Partial<ReplyingContact> = {}): ReplyingContact {
  return { charId, disposition: 'neutral', affection: 0, isLover: false, ...over }
}

describe("who replies to the reader's posts", () => {
  const ids = Array.from({ length: 200 }, (_, at) => `post-${at}`)

  it('picks the same people for the same post, whatever order the contacts come in', () => {
    const contacts = [contact('a'), contact('b', { disposition: 'friendly', affection: 20 })]
    for (const id of ids.slice(0, 20)) {
      expect(pickReplyingContacts(id, contacts).picked).toEqual(
        pickReplyingContacts(id, [...contacts].reverse()).picked
      )
    }
  })

  it('takes at most three, keeping the ones who like him most', () => {
    const contacts = ['a', 'b', 'c', 'd', 'e', 'f'].map((charId, at) =>
      contact(charId, { disposition: 'devoted', affection: 60 + at })
    )
    for (const id of ids) {
      const { picked, log } = pickReplyingContacts(id, contacts)
      expect(picked.length).toBeLessThanOrEqual(3)
      // Nobody capped likes him more than somebody kept.
      const capped = log.filter((one) => one.reason === 'capped').map((one) => one.charId)
      for (const one of capped) {
        for (const kept of picked) expect(one < kept).toBe(true)
      }
    }
  })

  it('owes one reply when somebody friendly or his lover is there, and never picks who hates him', () => {
    for (const id of ids) {
      expect(pickReplyingContacts(id, [contact('f', { disposition: 'friendly' })]).picked).toEqual(['f'])
      expect(pickReplyingContacts(id, [contact('l', { disposition: 'hostile', isLover: true })]).picked).toEqual(['l'])
      expect(pickReplyingContacts(id, [contact('h', { disposition: 'hostile' })]).picked).toEqual([])
    }
  })

  it('always includes a forced contact', () => {
    for (const id of ids.slice(0, 20)) {
      expect(pickReplyingContacts(id, [contact('h', { disposition: 'hostile' })], ['h']).picked).toEqual(['h'])
    }
  })
})

describe("the anonymous students who reply to the reader's posts", () => {
  const handles = ['a', 'b', 'c', 'd']
  const emojis = ['🐱', '🐶']

  it('are the same for the same post, one or two, never the same handle twice', () => {
    for (let at = 0; at < 100; at++) {
      const strangers = pickReplyStrangers(`p${at}`, handles, emojis)
      expect(strangers).toEqual(pickReplyStrangers(`p${at}`, handles, emojis))
      expect(strangers.length === 1 || strangers.length === 2).toBe(true)
      expect(new Set(strangers.map((one) => one.handle)).size).toBe(strangers.length)
    }
  })
})

describe("the reader's posts through the save", () => {
  beforeEach(() => useGameStore.getState().reset())

  it('loads a save written before he could post as none', () => {
    const save = useGameStore.getState().toGameSave() as GameSave
    delete save.readerPosts
    useGameStore.setState({ readerPosts: [post('stale')] })

    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().readerPosts).toEqual([])
  })

  it('keeps a post and its likes whole, applied once however often the boundary replays', () => {
    useGameStore.setState({ date: 4, time: 1, readerPosts: [post('a')] })
    useGameStore.getState().answerReaderPosts([{ postId: 'a', likes: 6 }])
    useGameStore.getState().answerReaderPosts([{ postId: 'a', likes: 6 }])
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().readerPosts).toEqual([
      { ...post('a'), answered: { date: 4, time: 1 }, likes: 6 }
    ])
  })

  it('keeps the replies whole and in order', () => {
    const replies = [
      { handle: 'quadcat', emoji: '🐱', text: 'real' },
      { handle: 'nightowl', emoji: '🦉', text: 'same tbh' }
    ]
    useGameStore.setState({ date: 4, time: 1, readerPosts: [post('a')] })
    useGameStore.getState().answerReaderPosts([{ postId: 'a', likes: 3, replies }])
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().readerPosts[0].replies).toEqual(replies)
  })
})
