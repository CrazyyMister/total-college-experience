import { describeReaderToPlayer, statsMaxed, type PlayerStats } from '@shared/playerStats'
import type { Character, SceneLine, TimeSlot } from '@shared/types'
import { homeRoomBg, lowriseNumberOf, STARTING_HOME } from '@shared/homes'
import { pronounsOf } from '@shared/pronouns'
import { formatDatePart } from './gameDate'

/**
 * The authored opening of a playthrough: the arrival scroll and the
 * orientation scene that follows it, then the four lines that welcome him home that night.
 */

/** The playthrough's first slot — the arrival scroll and freshman orientation. */
export function isOrientationSlot(date: number, time: TimeSlot): boolean {
  return date === 0 && time === 0
}

/**
 * The playthrough's second slot — the welcome home, in place of the slot-opening narration. It
 * is the first ordinary hour of the game: four authored lines and then the landing, which is
 * the screen every slot after it opens on.
 */
export function isTutorialSlot(date: number, time: TimeSlot): boolean {
  return date === 0 && time === 1
}

/**
 * The arrival scroll, one line per click: the tram in, the walk through the city, the gates,
 * the dorm room, and back out to orientation.
 */
export function introScrollLines(stats: PlayerStats, date: number): SceneLine[] {
  return [
    {
      bg: 'train_stop',
      text: `${formatDatePart(date)}. Today is move-in day and freshman orientation at Venus University.`
    },
    {
      text: `You step off the air-conditioned tram into the crisp Veridan air. A colorful map of the Loop's route greets you, the stop for VU highlighted in bright pink.`
    },
    { text: `You decided to get off a stop early to walk around a bit.` },
    {
      text: `The weather is incredible. When you left your hometown, it was still completely frozen over there. But the air here is pleasantly cool, and a few early flowers are already blooming.`
    },
    {
      text: `You read that it may have something to do with the Silk River, which runs through the city, but you skipped the meteorologist explanation.`
    },
    {
      bg: 'downtown_street',
      text: `You pass a sign that says "Welcome to Downtown Veridan." You make your way through the narrow, weathered streets, eye on the statue of Zeus in the distance that marks the VU campus gate.`
    },
    {
      bg: 'stanchion_street',
      text: `You pass old buildings that look like they were built decades ago, still hanging onto their old charm. Behind the squat buildings, you spot skyscrapers and highway overpasses in the distance: new developments.`
    },
    {
      bg: 'campus_road',
      text: `You finally make it to the gardens that block off the campus from the city and head through the gates. The noise from the city seems to just disappear.`
    },
    {
      bg: 'quad',
      text: `You follow the Gold Road to the quad, passing several familiar locations where "Love Between Gods" was shot. The lush gardens, classical stone, and expensive glass are even more beautiful than they were on screen.`
    },
    {
      text: `Everyone around you is someone who also won the lottery draw to get in here, and they're all moving in one eager wave towards the dorms to unpack.`
    },
    {
      bg: homeRoomBg(STARTING_HOME),
      text: `You find your room. Located in number ${lowriseNumberOf(STARTING_HOME)} out of the five Lowrise buildings, you slide the glass door open into a spacious single-occupancy unit that overlooks a courtyard garden.`
    },
    {
      text: `Your bags have already been delivered. As you see your future classmates milling about the campus, you start to feel pretty pumped.`
    },
    { text: describeReaderToPlayer(stats) },
    {
      text: statsMaxed(stats)
        ? `There's nothing left for this place to teach you. The question for you is how you'll turn this place into your personal playground.`
        : `Still, you're determined to improve yourself over the long semester.`
    },
    {
      bg: 'campus_road',
      text: `You finish unpacking and head down to find your orientation group.`
    }
  ].map((line) => ({ speaker: '', ...line }))
}

/**
 * The orientation scene's action text, written *about* the reader rather than by him; the loop
 * does not log it as one of his lines.
 */
export function orientationPremise(hasEx: boolean): string {
  // The reader already knows his ex, so the scene is about two people who have not met rather than a man who knows nobody.
  const strangers = hasEx
    ? 'The two of them have never met, and neither knows'
    : 'Neither of them knows anybody here yet and neither knows'
  return `The reader is standing with his orientation group in the Venus Quad. One of the other freshmen stands out to him. ${strangers} whether this is the start of anything at all — write the scene with that feeling: first day, everything still ahead, nothing decided.`
}

/** The same scene when the roster has no freshmen: she is the upperclassman leading the group. */
export function orientationLeaderPremise(
  character: Character | undefined,
  hasEx = false
): string {
  const firstName = character?.firstName ?? 'The group leader'
  const p = pronounsOf(character?.gender ?? 'woman')
  const unknown = hasEx ? 'the two of them have never met' : 'he knows nobody at all'
  return `The reader's orientation group is short of half its people. ${firstName}, the upperclassman leading the group, introduces ${p.reflexive} to him, and the two of them talk while the stragglers turn up. ${p.Subject} already knows ${p.possessive} way around and is in no hurry; ${unknown}. Write the scene with that first-day feeling: an easy, unhurried conversation between two people who have just met, and the open question of whether it leads anywhere.`
}

/**
 * Who the orientation scene may open with: the freshmen, or anyone where there are none, the
 * reader's ex never among them. `leader` is true when the pool is the whole roster.
 */
export function orientationPoolOf(
  chars: readonly string[],
  yearOf: (charId: string) => number | undefined,
  exId?: string
): { pool: string[]; leader: boolean } {
  const others = chars.filter((charId) => charId !== exId)
  const freshmen = others.filter((charId) => yearOf(charId) === 1)
  return freshmen.length > 0 ? { pool: freshmen, leader: false } : { pool: others, leader: true }
}

/**
 * A piece of Game View chrome an authored screen can withhold. The arrival scroll and the
 * endings keep only {@link BASE_REVEAL}; every other screen reveals all of it.
 */
export type RevealKey =
  | 'settings'
  | 'calendar'
  | 'bunnyboard'
  | 'cast'
  | 'background'
  | 'hideui'
  | 'chatlog'

/** What an authored screen leaves standing, the arrival scroll included. */
export const BASE_REVEAL: ReadonlySet<RevealKey> = new Set<RevealKey>([
  'settings',
  'cast',
  'background',
  'hideui',
  'chatlog'
])

/**
 * The epilogue's own set while its menu is up: `BASE_REVEAL` minus the eye, plus the phone —
 * the log holds the ceremony or the last goodbye, and the phone is read there, never written.
 */
export const EPILOGUE_REVEAL: ReadonlySet<RevealKey> = new Set<RevealKey>([
  'settings',
  'cast',
  'background',
  'bunnyboard',
  'chatlog'
])

/** Every key — what a slot the player holds the turn on shows, which is every slot but the first. */
export const ALL_REVEALED: ReadonlySet<RevealKey> = new Set<RevealKey>([
  'settings',
  'calendar',
  'bunnyboard',
  'cast',
  'background',
  'hideui',
  'chatlog'
])

/**
 * The welcome home: the last authored narration before the game is the player's. Four lines
 * covering what the landing can't say: the semester's length, two slots to a day, and a nudge out.
 */
const WELCOME_LINES: readonly string[] = [
  'You finally make it back to your room, exhausted after a lively morning.',
  "This is it... you're officially a student. Welcome to Venus University!",
  "The semester runs from January to May. Each day, you'll decide how to spend your morning and evening.",
  "Classes don't start until tomorrow, so you're free to do whatever you want tonight. Why not explore the campus or the city?"
]

/** The first night's lines, in order; the landing arrives as the last one is turned. */
export function tutorialLines(): string[] {
  return [...WELCOME_LINES]
}
