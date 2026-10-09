import {
  coachChatIdOf,
  coachText,
  houseChatIdOf,
  pledgeText,
  type CoachKind,
  type GroupDef,
  type PledgeKind
} from '@shared/groups'
import type { HouseId } from '@shared/houses'
import type { ChatMessage, ShiftSlot } from '@shared/types'
import { useBunnyboardStore } from '../bunnyboardStore'
import { useGameStore } from '../gameStore'

/**
 * Whether the player is already looking at this conversation — the Chats list
 * or the thread itself. A message landing there needs no notification.
 */
export function isViewing(charId: string): boolean {
  const ui = useBunnyboardStore.getState()
  if (!ui.open || ui.tab !== 'chats') return false
  // A contact page covers the whole stage, list and thread both.
  if (ui.pageCharId !== null) return false
  return ui.viewingCharId === null || ui.viewingCharId === charId
}

/** The texts a store action files in a coach's thread, with how many of them light its badge. */
export interface CoachTexts {
  messages: ChatMessage[]
  unread: number
}

/**
 * The texts his coach sends now, in order, stamped with the clock; \`strikes\` is the count each
 * one is sent at. Built before the store action that files them, so the action is one write.
 */
export function coachTexts(
  group: GroupDef,
  sessions: readonly ShiftSlot[],
  sends: ReadonlyArray<{ kind: CoachKind; strikes?: number }>
): CoachTexts {
  const game = useGameStore.getState()
  const messages = sends.flatMap(({ kind, strikes }) => {
    const text = coachText(group, kind, sessions, strikes)
    return text
      ? [
          {
            id: crypto.randomUUID(),
            sender: 'contact' as const,
            text,
            date: game.date,
            time: game.time
          }
        ]
      : []
  })
  return { messages, unread: isViewing(coachChatIdOf(group.id)) ? 0 : messages.length }
}

/**
 * The texts a house sends its pledge now, in order, stamped with the clock; `strikes` is the
 * count each one is sent at. Built before the store action that files them, like the coach's.
 */
export function houseTexts(
  house: HouseId,
  sessions: readonly ShiftSlot[],
  sends: ReadonlyArray<{ kind: PledgeKind; strikes?: number }>
): CoachTexts {
  const game = useGameStore.getState()
  const messages: ChatMessage[] = sends.map(({ kind, strikes }) => ({
    id: crypto.randomUUID(),
    sender: 'contact' as const,
    text: pledgeText(house, kind, sessions, strikes),
    date: game.date,
    time: game.time
  }))
  return { messages, unread: isViewing(houseChatIdOf(house)) ? 0 : messages.length }
}
