import type { NpcRomanceLogEntry, NpcWingmanEvent } from '@shared/npcRomance'
import { NPC_ROMANCE_HEADING } from '../prompts/npcRelationship'
import { loopState } from './loop/state'

/**
 * What the development build's roster-romance read-out shows beyond the save: the latest romance
 * events applied, held in memory only and only in the development build, and the romance section
 * of a scene request.
 */

/** How many applied events the read-out keeps. */
const LOG_CAP = 50

let log: NpcRomanceLogEntry[] = []

/** Adds the events a boundary just applied, keeping the latest {@link LOG_CAP}. */
export function recordRomanceEvents(entries: readonly NpcRomanceLogEntry[]): void {
  if (!import.meta.env.DEV || entries.length === 0) return
  log = [...log, ...entries].slice(-LOG_CAP)
}

/** The latest applied events, oldest first. */
export function romanceEventLog(): readonly NpcRomanceLogEntry[] {
  return log
}

/** The crush holder the test button has the next ending's gossip leak, or null. */
export function pendingGossipLeak(): string | null {
  return loopState.debugGossipLeak
}

/** The wingman actions the test buttons queued for the next ending. */
export function pendingWingman(): readonly NpcWingmanEvent[] {
  return loopState.debugWingman
}

/** The meetings the test button queued for the next ending. */
export function pendingMeetings(): ReadonlyArray<readonly [string, string]> {
  return loopState.debugMeetings
}

/** The romance section of a scene request's user message, one line per entry; empty without one. */
export function romanceSectionOf(prompt: string | null): string[] {
  const lines = (prompt ?? '').split('\n')
  const start = lines.indexOf(NPC_ROMANCE_HEADING)
  if (start === -1) return []
  const end = lines.indexOf('', start)
  return lines.slice(start + 1, end === -1 ? undefined : end)
}
