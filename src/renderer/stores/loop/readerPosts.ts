import { readerPostLikes, unansweredPosts, type LikingContact } from '@shared/feedReplies'
import { tierOf, type PlayerStats } from '@shared/playerStats'
import { affectionFor, dispositionOf } from '@shared/relationship'
import type { CharInfo, ReaderPostAnswer } from '@shared/types'
import { useGameStore } from '../gameStore'

/** The reader's own posts on the feed where they meet the store. */

/** The development build's read-out of his posts, newest first: each one waiting or its likes. */
export function readerPostDebugRows(): { key: string; text: string }[] {
  const posts = useGameStore.getState().readerPosts
  if (posts.length === 0) return [{ key: 'none', text: 'The reader has not posted.' }]
  return [...posts].reverse().map((post) => ({
    key: post.id,
    text:
      `Day ${post.date} ${post.time === 0 ? 'day' : 'night'}: "${post.text.slice(0, 40)}" · ` +
      (post.answered === undefined
        ? 'waiting on its likes'
        : `${post.likes ?? 0} likes, landed day ${post.answered.date} ${post.answered.time === 0 ? 'day' : 'night'}`)
  }))
}

/**
 * What the opening being asked for decides of every post of his still waiting: its likes, off
 * his contacts as `charInfo` leaves them — none who has him blocked — and his Heart in `stats`.
 */
export function readerPostAnswersFor(
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  stats: PlayerStats
): ReaderPostAnswer[] {
  const game = useGameStore.getState()
  const waiting = unansweredPosts(game.readerPosts)
  if (waiting.length === 0) return []
  const contacts: LikingContact[] = game.chars.flatMap((charId) => {
    const info = charInfo[charId]
    const flags = info?.flags
    if (!info || !flags?.gaveContactInfo || flags.blocked) return []
    const affection = affectionFor(info, game.date, game.characters[charId])
    return [{ disposition: dispositionOf(affection), isLover: flags.isLover }]
  })
  const heart = tierOf(stats.heart)
  return waiting.map((post) => ({
    postId: post.id,
    likes: readerPostLikes(post.id, contacts, heart)
  }))
}
