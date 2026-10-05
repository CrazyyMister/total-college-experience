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
