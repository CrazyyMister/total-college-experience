import type { Encounter, Encounters, IntimateAct, TimeSlot } from './types'

/** The most encounters one character's block carries when she is alone with the reader. */
export const ENCOUNTER_CAP = 12

/** How many a conversation on the phone carries. */
export const PHONE_ENCOUNTER_CAP = 5

/**
 * The line `GameHistory` keeps for a scene: its summary, then the plans the reader stood up
 * that slot. The calendar and the slot opening read nothing else.
 */
export function historyLineOf(summary: string, absent?: string): string {
  return absent ? `${summary} ${absent}` : summary
}

/**
 * Who of the cast took in the whole scene: not anybody who left it, and not anybody a private
 * act went on without. Only the acts the ledger reported are known, so an unreported one
 * cannot keep its text from anybody.
 */
export function castWhoSawAll(
  cast: readonly string[],
  left: readonly string[],
  acts: readonly IntimateAct[]
): string[] {
  return cast.filter(
    (charId) =>
      !left.includes(charId) &&
      !acts.some((act) => !act.inPublic && !act.charIds.includes(charId))
  )
}

/** One of a character's encounters as her prompt reads it. */
export interface CharEncounter {
  date: number
  time: TimeSlot
  where?: string
  /** The others who were there, in the order the scene's cast listed them. */
  with: string[]
  /** The scene's summary; null for an older encounter and for a scene she did not see whole. */
  text: string | null
}

/**
 * The last `limit` scenes `charId` was in, oldest first. Only the newest half of them (rounded
 * up) carry the summary, and only where she saw the whole scene; the rest are the day, the
 * place and the company alone.
 */
export function encountersOf(
  charId: string,
  encounters: Encounters | undefined,
  limit = Infinity
): CharEncounter[] {
  const found: CharEncounter[] = []
  const days = Object.keys(encounters ?? {})
    .map(Number)
    .sort((a, b) => a - b)
  for (const date of days) {
    for (const time of [0, 1] as const) {
      const entry = encounters?.[date]?.[time]
      if (!entry || !entry.who.includes(charId)) continue
      found.push({
        date,
        time,
        ...(entry.where ? { where: entry.where } : {}),
        with: entry.who.filter((other) => other !== charId),
        text: entry.saw.includes(charId) ? entry.summary : null
      })
    }
  }
  const recent = limit < found.length ? found.slice(found.length - limit) : found
  const told = Math.ceil(limit / 2)
  return recent.map((encounter, at) =>
    at < recent.length - told ? { ...encounter, text: null } : encounter
  )
}

/** The encounter a finished scene leaves, or none for a scene with nobody in it. */
export function encounterOf(
  cast: readonly string[],
  saw: readonly string[],
  where: string | null,
  summary: string,
  absent: string
): Encounter | null {
  if (cast.length === 0) return null
  return {
    who: [...cast],
    saw: saw.filter((charId) => cast.includes(charId)),
    ...(where ? { where } : {}),
    summary,
    ...(absent ? { absent } : {})
  }
}
