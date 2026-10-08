import { homeLabel, homeOf, READER, type HomeId } from '@shared/homes'
import { useGameStore } from './gameStore'
import { loopState } from './loop/state'
import type { DebugResult } from './npcRomanceDebugActions'

/**
 * What the development build's button for moving the reader does to the next ending. It answers
 * with what it did or why it would not; the move waits in the loop, unsaved, until the boundary
 * after the next scene files it.
 */

/** Has the reader move to `home` at the boundary the next scene's ending leads into. */
export function debugMoveReader(home: HomeId): DebugResult {
  if (!import.meta.env.DEV) return { ok: false, text: 'Only in the development build.' }
  const label = homeLabel(home)
  if (homeOf(useGameStore.getState(), READER) === home) {
    return { ok: false, text: `The reader already lives in ${label}.` }
  }
  loopState.debugHomeMove = home
  return { ok: true, text: `The reader moves to ${label} at the boundary after the next scene.` }
}
