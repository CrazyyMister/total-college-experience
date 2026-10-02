/**
 * The reader's own posts on the feed: how long one may be, how many a slot holds, and what the
 * game decides of each — its likes — fixed by the post's id and applied once.
 */

import { seededRand } from './hash'
import type { Disposition } from './relationship'
import type { ReaderPost, ReaderPostAnswer, TimeSlot } from './types'

/** The most a post of his may run to, in characters. */
export const READER_POST_MAX = 280

/** How likely a contact is to like his post, by how she feels about him. */
const LIKE_CHANCE: Readonly<Record<Disposition, number>> = {
  devoted: 0.95,
  trusted: 0.85,
  friendly: 0.65,
  neutral: 0.35,
  annoyed: 0.1,
  hostile: 0
}

/** The most strangers who like a post of his before his Heart adds any. */
const STRANGER_LIKES = 4

/** Whether he has already posted in this slot; one post a slot. */
export function postedThisSlot(
  posts: readonly ReaderPost[],
  date: number,
  time: TimeSlot
): boolean {
  return posts.some((post) => post.date === date && post.time === time)
}

/** His posts still waiting on their likes, oldest first. */
export function unansweredPosts(posts: readonly ReaderPost[]): ReaderPost[] {
  return posts.filter((post) => post.answered === undefined)
}

/** One contact as the likes read her: how she feels about him, and whether she is his lover. */
export interface LikingContact {
  disposition: Disposition
  isLover: boolean
}

/**
 * How many like one post of his: each contact by how she feels about him, his lover always, and
 * strangers by his Heart tier. Drawn off the post's id, so the same post and the same contacts
 * always come to the same count.
 */
export function readerPostLikes(
  postId: string,
  contacts: readonly LikingContact[],
  heartTier: number
): number {
  const rand = seededRand(`likes:${postId}`)
  let likes = 0
  for (const contact of contacts) {
    const roll = rand()
    if (contact.isLover || roll < LIKE_CHANCE[contact.disposition]) likes++
  }
  return likes + Math.floor(rand() * (STRANGER_LIKES + 1)) + Math.max(0, heartTier - 1)
}

/**
 * His posts with `answers` applied, each stamped with the slot it was answered in; a post already
 * answered, or one no answer names, is left as it is, so applying twice changes nothing.
 */
export function withAnsweredPosts(
  posts: readonly ReaderPost[],
  answers: readonly ReaderPostAnswer[],
  date: number,
  time: TimeSlot
): ReaderPost[] {
  return posts.map((post) => {
    if (post.answered !== undefined) return post
    const answer = answers.find((one) => one.postId === post.id)
    return answer ? { ...post, answered: { date, time }, likes: answer.likes } : post
  })
}
