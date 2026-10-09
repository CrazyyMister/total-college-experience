import {
  GROUP_EVENT_TIME,
  GROUPS,
  groupsAtPlace,
  groupEventOf,
  groupsOfChar,
  tryoutOf,
  type GroupDef,
  type GroupId,
  type GroupResult,
  type TryoutResult
} from '@shared/groups'
import {
  HOUSE_IDS,
  HOUSES,
  houseAccess,
  isHouse,
  OFFICE_NAMES,
  type HouseId,
  type HouseOffices
} from '@shared/houses'
import { locationLabel } from '@shared/locations'
import { andList } from '@shared/sentences'
import type { Occasion, TimeSlot } from '@shared/types'
import { formatGameDate } from './gameDate'
import { keyPattern, loreEntryById, loreTextForKey } from './lorebook'

/** What the prompts say about the groups a call touches. */

/**
 * The groups in play: the teams of whoever is named, and the team whose place `location` is.
 * Each group once, in the order it turns up.
 */
export function groupsInPlay(
  memberships: ReadonlyArray<readonly string[] | undefined>,
  location?: string | null,
  readerTeam?: GroupId | null
): GroupDef[] {
  const found = [
    ...memberships.flatMap((ids) => groupsOfChar(ids)),
    ...(readerTeam ? [GROUPS[readerTeam]] : []),
    ...(location ? groupsAtPlace(loreEntryById(location)?.id ?? location) : [])
  ]
  return found.filter(
    (def, at): def is GroupDef => def !== undefined && found.findIndex((one) => one === def) === at
  )
}

/** Whether the reader plays in the event: it is a game of the team he is on, not a tryout. */
export function readerPlaysEvent(
  eventId: string | null | undefined,
  team: GroupId | null | undefined
): boolean {
  return Boolean(eventId && team && groupEventOf(eventId)?.group.id === team)
}

/** The group whose event or tryout an occasion id names, or `undefined` for any other id. */
export function groupOfEvent(eventId: string | null | undefined): GroupDef | undefined {
  if (!eventId) return undefined
  return tryoutOf(eventId)?.group ?? groupEventOf(eventId)?.group
}

/**
 * The one line that keeps a team's coach and teammates nameless, or an empty string where no
 * group is in play. A defence in the prompt alone: nothing in the game finds an invented name.
 */
export function groupFigurantLine(groups: readonly GroupDef[]): string {
  if (groups.length === 0) return ''
  const teams = andList(groups.map((def) => def.nickname))
  return `The coach and every member of ${teams} who has not been named above are unnamed background: never give any of them a name, only "the coach" or "a teammate".`
}

/**
 * The Greek house the place a scene is set at names: its id, as the map's Go and the classifier's
 * list of occupied places give it, or its own words ("the Kappa Row house") where the classifier
 * left the place in plain words. Only that place is read, never the reader's action: a house
 * named in passing somewhere else is not the scene's place.
 */
export function houseAtPlace(location: string | null | undefined): HouseId | undefined {
  const words = location?.trim()
  if (!words) return undefined
  const id = loreEntryById(words)?.id ?? words
  if (isHouse(id)) return id
  return HOUSE_IDS.find((house) => {
    const keys = loreEntryById(house)?.keys ?? []
    return keys.length > 0 && new RegExp(keys.map((key) => keyPattern(key)).join('|'), 'iu').test(words)
  })
}

/**
 * The line that keeps the members of a Greek house nameless when the scene is set at the house,
 * or an empty string anywhere else. A defence in the prompt alone, like the team's.
 */
export function houseFigurantLine(location: string | null | undefined): string {
  const id = houseAtPlace(location)
  if (!id) return ''
  const def = HOUSES[id]
  const member = def.kind === 'fraternity' ? 'brother' : 'sister'
  return `Every ${member} of ${def.nickname} who has not been named above is unnamed background: never give any of them a name, only "a ${member}".`
}

/**
 * What a scene set at a Greek house is told about the door, with its blank line, or nothing
 * anywhere else: where the reader stands, and who holds an office of the house that no named
 * character does, so the writer gives them no name. Said below the cached prefix.
 */
export function houseDoorLines(
  location: string | null | undefined,
  offices: HouseOffices | undefined
): string[] {
  const id = houseAtPlace(location)
  if (!id || houseAccess(id) !== 'door') return []
  const def = HOUSES[id]
  const lines = [
    `The reader is outside ${def.nickname}, the ${def.kind} house on Laurel Row: this scene stays on the porch or in the street, and he does not go inside. Nothing in this scene takes place in the living room, the party space or the bedrooms.`
  ]
  const unnamed = offices?.[id] ?? []
  if (unnamed.length > 0) {
    lines.push(
      `Whoever holds the offices of ${def.nickname} that no named character holds (${andList(unnamed.map((office) => `the ${OFFICE_NAMES[office]}`))}) is unnamed background: never give them a name.`
    )
  }
  return [...lines, '']
}

/** The line saying which team the reader is on, or nothing where he is on none. */
export function readerTeamLines(team: GroupId | null | undefined): string[] {
  const def = team ? GROUPS[team] : undefined
  return def ? [`The reader is on ${def.name}, which practices at ${locationLabel(def.location)}.`] : []
}

/** What a group's events are told from: the calendar's occasions and how each one ended. */
export interface GroupNewsState {
  date: number
  time: TimeSlot
  occasions: readonly Occasion[]
  groupResults?: Readonly<Record<string, GroupResult>>
  /** How each tryout the reader went to ended, by occasion id. */
  groupTryouts?: Readonly<Record<string, TryoutResult>>
  /** The team the reader is on, which decides whether he plays in a game or watches it. */
  playerTeam?: GroupId | null
}

/** How an event ended, in the words of a line about the team. */
function resultSentence(eventId: string, result: GroupResult, date: number): string | null {
  const found = groupEventOf(eventId)
  if (!found) return null
  const { group, school } = found
  const team = `${group.name.charAt(0).toUpperCase()}${group.name.slice(1)}`
  const [high, low] = [Math.max(result.home, result.away), Math.min(result.home, result.away)]
  const ending = result.won
    ? `beat ${school.name} ${high}–${low}`
    : `lost to ${school.name} ${high}–${low}`
  return `${team} ${ending} in the ${group.eventName} on ${formatGameDate(date)}.`
}

/**
 * The finished events of the groups a character is on, one ` | …` sentence each, oldest first.
 * An event is told only once its night is over, and never before it has a result.
 */
export function groupNewsClause(
  ids: readonly string[] | undefined,
  state: GroupNewsState
): string {
  const done = groupsOfChar(ids)
    .flatMap((def) => def.events.map((event) => event.id))
    .flatMap((eventId) => {
      const occasion = state.occasions.find((entry) => entry.id === eventId)
      const result = state.groupResults?.[eventId]
      if (!occasion || !result) return []
      const last = occasion.time ?? GROUP_EVENT_TIME
      const over =
        occasion.endDate < state.date || (occasion.endDate === state.date && last < state.time)
      return over ? [{ occasion, result }] : []
    })
    .sort((a, b) => a.occasion.startDate - b.occasion.startDate)
  return done
    .flatMap(({ occasion, result }) => {
      const sentence = resultSentence(occasion.id, result, occasion.endDate)
      return sentence ? [` | ${sentence}`] : []
    })
    .join('')
}

/**
 * The block that tells a scene it is a group's event and how it ends. The result is the game's:
 * the writer shows the event, and never decides it.
 */
export function groupEventLines(eventId: string | null | undefined, state: GroupNewsState): string[] {
  if (!eventId) return []
  const occasion = state.occasions.find((entry) => entry.id === eventId)
  if (tryoutOf(eventId)) {
    const verdict = state.groupTryouts?.[eventId]
    if (!occasion || !verdict) return []
    return [
      'GROUP EVENT',
      `${occasion.title}: ${occasion.description}`,
      `The coach's decision is already made and is not the writer's to change: ${verdict.made ? 'the reader makes the team' : 'the reader does not make the team'}. The tryout can be shown whole or in part, and the coach says so at its end, but nothing in the scene may contradict that or leave it open.`,
      ''
    ]
  }
  const result = state.groupResults?.[eventId]
  const found = groupEventOf(eventId)
  if (!occasion || !result || !found) return []
  const { group, school } = found
  const team = `${group.name.charAt(0).toUpperCase()}${group.name.slice(1)}`
  const [high, low] = [Math.max(result.home, result.away), Math.min(result.home, result.away)]
  const ending = result.won
    ? `${team} beats ${school.name} ${high}–${low}`
    : `${school.name} beats ${group.name} ${high}–${low}`
  const role = readerPlaysEvent(eventId, state.playerTeam)
    ? `The reader is on ${group.name} and plays in this ${group.eventName}: show him playing for the team. What he does in it does not change the result.`
    : `The reader is not on ${group.name}: he watches this ${group.eventName} from the stands and does not take part in it.`
  return [
    'GROUP EVENT',
    `${occasion.title}: ${occasion.description}`,
    `The result is already decided and is not the writer's to change: ${ending}. The event can be shown whole or in part, but nothing in the scene may contradict that result or leave it open.`,
    role,
    ''
  ]
}

/** The rival school's lorebook entry for an event, to be stated outright rather than matched. */
export function groupEventLore(eventId: string | null | undefined): string[] {
  const found = eventId ? groupEventOf(eventId) : undefined
  const text = found ? loreTextForKey(found.school.short) : null
  return text ? [text] : []
}
