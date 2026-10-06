import type { Encounter, Encounters, GameHistory, IntimateAct, TimeSlot } from './types'

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

/** One of a character's encounters as her page lists it, with the whole entry. */
export interface EncounterEntry {
  date: number
  time: TimeSlot
  encounter: Encounter
}

/** Every scene `charId` was in, newest first, whole; the page's list and the editor read it. */
export function encounterEntriesOf(
  charId: string,
  encounters: Encounters | undefined
): EncounterEntry[] {
  const found: EncounterEntry[] = []
  const days = Object.keys(encounters ?? {})
    .map(Number)
    .sort((a, b) => b - a)
  for (const date of days) {
    for (const time of [1, 0] as const) {
      const encounter = encounters?.[date]?.[time]
      if (encounter?.who.includes(charId)) found.push({ date, time, encounter })
    }
  }
  return found
}

/**
 * The encounter with its summary rewritten, and the history line of the same day and half
 * recomposed from it and the stood-up lines the encounter keeps, so the calendar and the slot
 * opening read the new words. Null where there is no such encounter or the words are the same.
 */
export function withEncounterSummary(
  encounters: Encounters | undefined,
  history: GameHistory,
  date: number,
  time: TimeSlot,
  summary: string
): { encounters: Encounters; history: GameHistory } | null {
  const encounter = encounters?.[date]?.[time]
  const words = summary.trim()
  // Opened and saved as it stood, nothing is rewritten, whatever its length or edges.
  if (!encounters || !encounter || !words || summary === encounter.summary) return null
  return {
    encounters: { ...encounters, [date]: { ...encounters[date], [time]: { ...encounter, summary: words } } },
    history: { ...history, [date]: { ...history[date], [time]: historyLineOf(words, encounter.absent) } }
  }
}

/**
 * The encounters with `charId` taken out of one — out of who was there and of who took in its
 * summary — the text kept for the rest. The entry goes when nobody is left in it; the history
 * line is never touched. Null where she was not in it.
 */
export function withoutFromEncounter(
  encounters: Encounters | undefined,
  date: number,
  time: TimeSlot,
  charId: string
): Encounters | null {
  const encounter = encounters?.[date]?.[time]
  if (!encounters || !encounter?.who.includes(charId)) return null
  const who = encounter.who.filter((one) => one !== charId)
  const { [time]: _gone, ...rest } = encounters[date] ?? {}
  const day = who.length === 0 ? rest : { ...rest, [time]: { ...encounter, who, saw: encounter.saw.filter((one) => one !== charId) } }
  const { [date]: _day, ...others } = encounters
  return Object.keys(day).length === 0 ? others : { ...others, [date]: day }
}
