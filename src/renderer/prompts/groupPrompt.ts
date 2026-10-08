import { groupAtPlace, groupsOfChar, type GroupDef } from '@shared/groups'
import { andList } from '@shared/sentences'
import { loreEntryById } from './lorebook'

/** What the prompts say about the groups a call touches. */

/**
 * The groups in play: the teams of whoever is named, and the team whose place `location` is.
 * Each group once, in the order it turns up.
 */
export function groupsInPlay(
  memberships: ReadonlyArray<readonly string[] | undefined>,
  location?: string | null
): GroupDef[] {
  const found = [
    ...memberships.flatMap((ids) => groupsOfChar(ids)),
    ...(location ? [groupAtPlace(loreEntryById(location)?.id ?? location)] : [])
  ]
  return found.filter(
    (def, at): def is GroupDef => def !== undefined && found.findIndex((one) => one === def) === at
  )
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
