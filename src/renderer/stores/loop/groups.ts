import {
  eventStrength,
  GROUP_EVENT_TIME,
  gameResult,
  groupEventOf,
  type GroupId,
  type GroupResult
} from '@shared/groups'
import { shuffle } from '@shared/shuffle'
import { wornSetOf } from '@shared/wardrobe'
import type { Occasion, OutfitSet, TimeSlot } from '@shared/types'
import { isMoodHomebound } from '../../prompts/moods'
import { PORTRAIT_SLOTS, useGameStore, type SceneKind } from '../gameStore'
import { charTeamSessionNow, charUnavailableNow, groupEventAt } from '../timetable'
import type { Verdict } from './classify'
import { resolveLocationId } from './casting'

/**
 * The impure edge of the groups: who is free for an event, how it ended, and the scene it
 * opens. The pure half is `shared/groups.ts`.
 */

/** The prefix of the action type that opens a group event's scene. */
const EVENT_ACTION = 'group:'

/** The charIds who belong to a group, in roster order. */
export function groupMembersOf(groupId: GroupId): string[] {
  const game = useGameStore.getState()
  return game.chars.filter((charId) => game.charInfo[charId]?.groups?.includes(groupId))
}

/**
 * The set her team puts her in for a scene set at `sceneLocation`, or null: she is in her
 * team's session now and the scene is at the session's place. A scene somewhere else, or one
 * with no place, is not her team's, whoever she is.
 */
export function teamSetInScene(
  charId: string,
  sceneLocation: string | null | undefined,
  date?: number,
  time?: TimeSlot
): OutfitSet | null {
  const group = charTeamSessionNow(charId, date, time)
  if (!group || resolveLocationId(sceneLocation) !== group.location) return null
  return group.sessionSet
}

/**
 * What stands in place of her usual clothes in a photo taken at `place` on a half-day: her
 * team's set when the photo is taken at her session's place while she is in the session, else
 * what she would wear anyway.
 */
export function photoWornSet(
  charId: string,
  place: string,
  date: number,
  time: TimeSlot
): OutfitSet | null {
  const group = charTeamSessionNow(charId, date, time)
  const team = group && group.location === place ? group.sessionSet : null
  return wornSetOf(date, useGameStore.getState().outfitReady[charId], team)
}

/** Whether a member could be at a half-day: not in class, on shift, away, or staying in. */
export function memberFreeAt(charId: string, date: number, time: Occasion['time']): boolean {
  const game = useGameStore.getState()
  const half = time ?? GROUP_EVENT_TIME
  if (charUnavailableNow(charId, date, half)) return false
  const gender = game.characters[charId]?.gender ?? 'woman'
  return !isMoodHomebound(date, game.charInfo[charId]?.moodCycleOffset ?? 0, gender)
}

/**
 * How an event ended: the result already filed, or the one its night decides now and files. The
 * seed is the playthrough and the event, and the strength is how many of the team were free that
 * night, so the scene and the boundary reach the same score and the second never overwrites the
 * first.
 */
export function resultOfEvent(occasion: Occasion): GroupResult | null {
  const game = useGameStore.getState()
  const filed = game.groupResults[occasion.id]
  if (filed) return filed
  const found = groupEventOf(occasion.id)
  if (!found || occasion.group !== found.group.id) return null

  const strength = eventStrength(groupMembersOf(found.group.id), (charId) =>
    memberFreeAt(charId, occasion.startDate, occasion.time)
  )
  const result = gameResult(found.group, strength, `${game.playthroughId ?? 'game'}:${occasion.id}`)
  game.setGroupResult(occasion.id, result)
  return useGameStore.getState().groupResults[occasion.id] ?? result
}

/**
 * The boundary's pass: every event that is over and has no result gets the one its night
 * decides. Idempotent, and it fills only what is missing.
 */
export function settleGroupResults(): void {
  const game = useGameStore.getState()
  for (const occasion of game.occasions) {
    if (!occasion.group) continue
    const last = occasion.time ?? GROUP_EVENT_TIME
    const over =
      occasion.endDate < game.date || (occasion.endDate === game.date && last < game.time)
    if (over) resultOfEvent(occasion)
  }
}

/** The verdict that opens an event's scene, naming nobody and setting it at the event's place. */
export function groupEventVerdict(occasion: Occasion): Verdict {
  return {
    mentioned: [],
    mentionedOnly: [],
    actionType: `${EVENT_ACTION}${occasion.id}`,
    inPublic: true,
    sceneLocation: occasion.where ?? ''
  }
}

/** The event id a verdict opens, or null for any other verdict. */
export function groupEventIdOf(verdict: Verdict): string | null {
  return verdict.actionType.startsWith(EVENT_ACTION)
    ? verdict.actionType.slice(EVENT_ACTION.length)
    : null
}

/**
 * The event a verdict opens: the one it names, or the one held at the place it sets the scene in
 * while that event is on, so going to the pool on the night of the meet is the meet.
 */
export function groupEventIdFor(verdict: Verdict): string | null {
  const named = groupEventIdOf(verdict)
  if (named) return named
  const game = useGameStore.getState()
  const event = groupEventAt(game.date, game.time)
  if (!event?.where || !verdict.sceneLocation) return null
  return resolveLocationId(verdict.sceneLocation) === event.where ? event.id : null
}

/** What opening an event's scene settles. */
export interface GroupEventPlan {
  cast: string[]
  scene: SceneKind
}

/**
 * The scene an event opens now, or null when it is not on this half-day: its result decided and
 * filed, and up to three of the team who are free cast, the one who asked first.
 */
export function planGroupEvent(eventId: string, required?: string): GroupEventPlan | null {
  const game = useGameStore.getState()
  const occasion = game.occasions.find((entry) => entry.id === eventId)
  if (!occasion?.group || occasion.startDate !== game.date) return null
  if ((occasion.time ?? GROUP_EVENT_TIME) !== game.time) return null
  if (!resultOfEvent(occasion)) return null

  const free = shuffle(
    groupMembersOf(occasion.group).filter((charId) =>
      memberFreeAt(charId, game.date, game.time)
    )
  )
  const cast = [...new Set([...(required ? [required] : []), ...free])].slice(0, PORTRAIT_SLOTS)
  return { cast, scene: { groupId: occasion.group, groupEvent: occasion.id } }
}
