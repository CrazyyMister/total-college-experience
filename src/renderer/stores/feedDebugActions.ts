import { unansweredPosts } from '@shared/feedReplies'
import { useGameStore } from './gameStore'
import { loopState } from './loop/state'
import type { DebugResult } from './npcRomanceDebugActions'

/**
 * What the development build's buttons for the reader's posts and the post tagging him do to the
 * next opening. Each answers with what it did or why it would not; all are forgotten at the
 * boundary.
 */

const refused = (text: string): DebugResult => ({ ok: false, text })
const done = (text: string): DebugResult => ({ ok: true, text })
const NOT_DEV: DebugResult = refused('Only in the development build.')

/** Has X reply to the reader's latest waiting post at the next opening, past the dice and the cap. */
export function debugFeedReplier(charId: string): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const character = game.characters[charId]
  if (!character) return refused('Pick a character.')
  const flags = game.charInfo[charId]?.flags
  if (!flags?.gaveContactInfo) return refused(`${character.firstName} is not a contact.`)
  if (flags.blocked) return refused(`${character.firstName} has blocked the reader.`)
  if (unansweredPosts(game.readerPosts).length === 0) return refused('No post of his is waiting.')
  loopState.debugFeedReplier = charId
  return done(`${character.firstName} replies to the reader's latest post at the next opening.`)
}

/**
 * Has the next opening's replies calls fail as a transient error would: the posts and comments
 * they were for wait, and the tag is dropped.
 */
export function debugFailFeedReplies(): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  loopState.debugFeedRepliesFail = true
  return done(
    'The next replies calls fail; the posts and comments they were for keep waiting, and a tag is lost.'
  )
}

/**
 * Has X tag the reader at the next scene ending, past the chance but never the rules: the ending
 * says why she could not where she cannot.
 */
export function debugReaderTagger(charId: string): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const character = useGameStore.getState().characters[charId]
  if (!character) return refused('Pick a character.')
  loopState.debugReaderTagger = charId
  return done(`${character.firstName} tags the reader at the next ending, if the rules let her.`)
}

/**
 * Has X comment under Y's latest post of this slot at the next scene ending, past the dice and
 * the cap but never the rules: the ending says why she could not where she cannot.
 */
export function debugNpcComment(charId: string, posterId: string): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const { characters } = useGameStore.getState()
  const writer = characters[charId]
  const poster = characters[posterId]
  if (!writer || !poster) return refused('Pick two characters.')
  if (charId === posterId) return refused('Pick two different characters.')
  loopState.debugNpcComment = { charId, posterId }
  return done(
    `${writer.firstName} comments under ${poster.firstName}'s post at the next ending, if the rules let her.`
  )
}

/** Files a test post on Y's feed in this slot, so a comment has something to land under. */
export function debugTestPost(posterId: string): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const poster = game.characters[posterId]
  if (!poster) return refused('Pick a character.')
  game.appendFeedPost(posterId, {
    id: crypto.randomUUID(),
    text: 'Quiet evening, thinking about getting some ramen.',
    date: game.date,
    time: game.time,
    likes: 0
  })
  return done(`${poster.firstName} has posted a test line this slot.`)
}
