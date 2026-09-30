import { rollPostLikes } from '@shared/feed'
import type { NpcRomanceMap, ReaderBreakup } from '@shared/npcRomance'
import {
  pickGossipTopic,
  unknownNameIn,
  withGossip,
  type GossipPost,
  type GossipTopic
} from '@shared/npcRomanceGossip'
import type { CharInfo, SlotOpening, TimeSlot } from '@shared/types'
import {
  FEED_EMOJI,
  FEED_EMOJI_BAG,
  GOSSIP_HANDLE_BAG,
  GOSSIP_HANDLE_POOL
} from '../../prompts/feedRandoms'
import type { IntroGossip } from '../../prompts/slotIntroPrompt'
import { useGameStore } from '../gameStore'
import { useGrabBagStore } from '../grabBagStore'
import { loopState } from './state'

/** The anonymous gossip about the roster's romance where it meets the store. */

/**
 * The topic of the gossip the opening of `date` carries, off the map the ending settled into, and
 * the lovers this settle left who could not be texted: no contact, or blocked. `charInfo` is the
 * ending's projection.
 */
export function slotGossipOf(
  romance: NpcRomanceMap,
  readerBreakups: readonly ReaderBreakup[],
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  date: number
): { topic: GossipTopic | null; silent: string[] } {
  const silent = readerBreakups
    .map(({ charId }) => charId)
    .filter((charId) => {
      const flags = charInfo[charId]?.flags
      return !flags?.gaveContactInfo || flags.blocked === true
    })
  const topic = pickGossipTopic({
    romance,
    owed: [...(useGameStore.getState().npcGossip.owed ?? []), ...silent],
    date,
    nameKnown: (charId) => charInfo[charId]?.nameKnown === true,
    ...(loopState.debugGossipLeak ? { forcedLeak: loopState.debugGossipLeak } : {})
  })
  return { topic, silent }
}

/** The topic as the opening's prompt tells it, by first names the reader knows; null if it cannot be told. */
export function introGossipOf(
  topic: GossipTopic,
  charInfo: Readonly<Record<string, CharInfo | undefined>>
): IntroGossip | null {
  const { characters } = useGameStore.getState()
  const known = (charId: string): string | undefined =>
    charInfo[charId]?.nameKnown ? characters[charId]?.firstName : undefined
  if (topic.kind === 'single') {
    const lover = known(topic.lover)
    const gender = characters[topic.lover]?.gender
    return lover && gender ? { kind: 'single', lover, gender } : null
  }
  if (topic.kind === 'drift') {
    const lover = known(topic.lover)
    const suitorGender = characters[topic.suitor]?.gender
    if (!lover || !suitorGender) return null
    const suitor = known(topic.suitor)
    return { kind: 'drift', lover, suitorGender, ...(suitor ? { suitor } : {}) }
  }
  const from = known(topic.from)
  const to = known(topic.to)
  return from && to ? { kind: 'crush', from, to } : null
}

/** Who posts the slot's gossip: a generated name, never a supporter's, an emoji and its likes. */
export function drawGossipAuthor(): { handle: string; emoji: string; likes: number } {
  const bag = useGrabBagStore.getState()
  return {
    handle: bag.draw(GOSSIP_HANDLE_BAG, GOSSIP_HANDLE_POOL, (one) => one.key).handle,
    emoji: bag.draw(FEED_EMOJI_BAG, FEED_EMOJI),
    likes: rollPostLikes(0)
  }
}

/**
 * The gossip post the reply came back with, dated the slot it goes up in; null when it came back
 * empty or naming somebody the reader cannot name.
 */
export function gossipPostOf(
  text: string | undefined,
  author: { handle: string; emoji: string; likes: number },
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  date: number,
  time: TimeSlot
): GossipPost | null {
  const written = text?.trim()
  if (!written) return null
  const game = useGameStore.getState()
  const roster = game.chars.flatMap((charId) => {
    const character = game.characters[charId]
    return character
      ? [
          {
            firstName: character.firstName,
            lastName: character.lastName,
            known: charInfo[charId]?.nameKnown === true
          }
        ]
      : []
  })
  if (unknownNameIn(written, roster)) {
    console.warn('[gossip] dropped a post naming somebody the reader cannot name:', written)
    return null
  }
  return { id: `gossip:${date}:${time}`, ...author, text: written, date, time }
}

/**
 * Files the opening's gossip and what it counts for, and owes a post for each lover who left the
 * reader in silence. Run after the boundary has stored the map; idempotent.
 */
export function deliverSlotGossip(opening: SlotOpening): void {
  const silent = opening.silentBreakups ?? []
  if (!opening.gossip && silent.length === 0) return
  const game = useGameStore.getState()
  const { romance, gossip } = withGossip(
    game.npcRomance,
    game.npcGossip,
    { silent, ...(opening.gossip ?? {}) },
    game.date
  )
  if (romance !== game.npcRomance) game.setNpcRomance(romance)
  game.setNpcGossip(gossip)
}
