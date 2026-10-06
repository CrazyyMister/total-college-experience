import { locationDefOf } from '@shared/locations'
import { pronounsOf } from '@shared/pronouns'
import { andList } from '@shared/sentences'
import type { CharEncounter } from '@shared/encounters'
import type { Character, CharInfo } from '@shared/types'
import { formatChatDivider } from './gameDate'
import { loreEntryById } from './lorebook'

/** How a place the classifier named reads: its catalog label, its lorebook name, or the words as given. */
function placeOf(where: string): string {
  return locationDefOf(where)?.label ?? loreEntryById(where)?.keys[0] ?? where
}

/** Who else was there, each by first name; one the reader cannot name is marked as such. */
export function companyOf(
  charIds: readonly string[],
  people: Readonly<Record<string, Character>>,
  charInfo: Readonly<Record<string, CharInfo>>
): string {
  const names = charIds
    .map((charId) => people[charId])
    .filter((other): other is Character => Boolean(other))
    .map((other) =>
      charInfo[other.charId]?.nameKnown === true
        ? other.firstName
        : `${other.firstName} (the reader doesn't know ${pronounsOf(other.gender).possessive} name)`
    )
  return andList(names)
}

/**
 * A character's encounters under their own heading, oldest first; none, no heading. One that
 * carries no text gives the day, the place and the company alone.
 */
export function encounterLines(
  character: Character,
  encounters: readonly CharEncounter[],
  people: Readonly<Record<string, Character>>,
  charInfo: Readonly<Record<string, CharInfo>>
): string[] {
  if (encounters.length === 0) return []
  const p = pronounsOf(character.gender)
  return [
    `${character.firstName}'s Encounters:`,
    `Recaps of past scenes with the reader, oldest first, for continuity. ${p.Subject} knows of those scenes only what ${p.possessive} own entry says; an entry with no recap gives only when, where and with whom.`,
    ...encounters.map((encounter) => {
      const company = companyOf(encounter.with, people, charInfo)
      const head = [
        formatChatDivider(encounter.date, encounter.time),
        ...(encounter.where ? [placeOf(encounter.where)] : []),
        ...(company ? [`with ${company}`] : [])
      ].join(', ')
      return `- ${head}${encounter.text === null ? '.' : `: ${encounter.text}`}`
    })
  ]
}
