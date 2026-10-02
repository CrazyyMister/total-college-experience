import { beforeEach, describe, expect, it } from 'vitest'

import { readerPostLikes, withAnsweredPosts, type LikingContact } from '@shared/feedReplies'
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
    const posts = withAnsweredPosts([post('a'), post('b')], [{ postId: 'a', likes: 6 }], 4, 1)
    expect(posts[0]).toEqual({ ...post('a'), answered: { date: 4, time: 1 }, likes: 6 })
    expect(posts[1]).toEqual(post('b'))
  })

  it('changes nothing on a replayed boundary', () => {
    const once = withAnsweredPosts([post('a')], [{ postId: 'a', likes: 6 }], 4, 1)
    const twice = withAnsweredPosts(once, [{ postId: 'a', likes: 9 }], 5, 0)
    expect(twice).toEqual(once)
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
})
