import { emptyFlags, leftTheReader } from '@shared/relationship'
import { upsertJealousyMemory, type RumorPassOutcome } from '@shared/rumors'
import type { NpcRelationshipMap } from '@shared/npcRelationships'
import { rivalMemoryOf, type ReaderBreakup } from '@shared/npcRomance'
import type { PlayerStats } from '@shared/playerStats'
import type { CalendarEvent, CharInfo, CharMemory } from '@shared/types'
import { blankCharInfo, useGameStore } from '../gameStore'

/** The slot opening's view of a world the boundary has not written yet. */
export interface PostLedgerView {
  /** The roster's entries as {@link projectLedger} will leave them. */
  charInfo: Readonly<Record<string, CharInfo>>
  /** The reader's stats with the finished scene's deltas already in them. */
  stats: PlayerStats
  /** The calendar plus the plans the finished scene just settled. */
  events: readonly CalendarEvent[]
  /** The roster's affinities as the ending's settle left them. */
  npcRelationships: NpcRelationshipMap
}

/**
 * The view for an opening no scene precedes — a new playthrough's first slot and a save loaded
 * between scenes.
 */
export function liveView(): PostLedgerView {
  const game = useGameStore.getState()
  return {
    charInfo: game.charInfo,
    stats: game.stats,
    events: game.events,
    npcRelationships: game.npcRelationships
  }
}

/**
 * A projected `charInfo` with a rolled rumor pass folded into it: what each girl now suspects,
 * and the permanent memories seeing or hearing it cost him.
 */
export function withRumorPass(
  charInfo: Readonly<Record<string, CharInfo>>,
  outcome: RumorPassOutcome,
  date: number = useGameStore.getState().date
): Record<string, CharInfo> {
  const projected: Record<string, CharInfo> = { ...charInfo }
  for (const [charId, records] of Object.entries(outcome.suspicions)) {
    const info = projected[charId] ?? blankCharInfo()
    // An emptied list is dropped rather than stored, which is what the store's write does too.
    if (records.length === 0) {
      const { suspicions: _emptied, ...rest } = info
      projected[charId] = rest
      continue
    }
    projected[charId] = { ...info, suspicions: records }
  }
  for (const { charId, memory } of outcome.memories) {
    const info = projected[charId] ?? blankCharInfo()
    projected[charId] = {
      ...info,
      jealousyMemories: upsertJealousyMemory(info.jealousyMemories, memory)
    }
  }
  for (const charId of outcome.betrayed ?? []) {
    projected[charId] = { ...(projected[charId] ?? blankCharInfo()), betrayedOn: date }
  }
  return projected
}

/**
 * A projected `charInfo` with the lovers who leave the reader at this boundary already gone, the
 * way `applyReaderBreakups` leaves them, and the grudge memory each man he displaced is owed.
 */
export function withReaderLosses(
  charInfo: Readonly<Record<string, CharInfo>>,
  breakups: readonly ReaderBreakup[],
  rivals: readonly string[],
  wingmanMemories: ReadonlyArray<{ charId: string; memory: CharMemory }> = []
): Record<string, CharInfo> {
  const game = useGameStore.getState()
  const projected: Record<string, CharInfo> = { ...charInfo }
  for (const { charId, forCharId, reason } of breakups) {
    const info = projected[charId]
    if (!info) continue
    projected[charId] = leftTheReader(
      info,
      { date: game.date, time: game.time },
      game.characters[charId]?.gender ?? 'woman',
      game.characters[forCharId]?.firstName,
      reason
    )
  }
  for (const charId of rivals) {
    const info = projected[charId] ?? blankCharInfo()
    projected[charId] = {
      ...info,
      jealousyMemories: upsertJealousyMemory(
        info.jealousyMemories,
        rivalMemoryOf(game.characters[charId], { date: game.date, time: game.time })
      )
    }
  }
  for (const { charId, memory } of wingmanMemories) {
    const info = projected[charId] ?? blankCharInfo()
    projected[charId] = {
      ...info,
      jealousyMemories: upsertJealousyMemory(info.jealousyMemories, memory)
    }
  }
  return projected
}

/**
 * The same for a rolled crush pass; the opening's cast prose reads `hasCrush`,
 * so a girl who fell tonight is described that way in the morning.
 */
export function withCrushes(
  charInfo: Readonly<Record<string, CharInfo>>,
  charIds: readonly string[]
): Record<string, CharInfo> {
  if (charIds.length === 0) return { ...charInfo }
  const projected: Record<string, CharInfo> = { ...charInfo }
  for (const charId of charIds) {
    const info = projected[charId]
    if (info) projected[charId] = { ...info, flags: { ...(info.flags ?? emptyFlags()), hasCrush: true } }
  }
  return projected
}
