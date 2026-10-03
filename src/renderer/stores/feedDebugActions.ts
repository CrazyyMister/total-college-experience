import { unansweredPosts } from '@shared/feedReplies'
import { useGameStore } from './gameStore'
import { loopState } from './loop/state'
import type { DebugResult } from './npcRomanceDebugActions'

/**
 * What the development build's buttons for the reader's posts do to the next opening. Each answers
 * with what it did or why it would not; both are forgotten at the boundary.
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

/** Has the next replies call fail as a transient error would, so the posts keep waiting. */
export function debugFailFeedReplies(): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  loopState.debugFeedRepliesFail = true
  return done('The next replies call fails; the posts it was for keep waiting.')
}
