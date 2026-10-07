/**
 * Where somebody lives: the one place that answers it, for the reader and for every character
 * on the roster, and the one place that says it in words. Every reader of a home asks
 * {@link homeOf}; none reads `charInfo[…].dorm` itself.
 */

import {
  dormBuildingOf,
  dormClause,
  dormGroupBlurb,
  dormGroupLabel,
  dormIcon,
  dormLabel,
  dormSentence,
  type DormBuilding,
  type DormId
} from './dorms'
import type { CharInfo, Gender } from './types'

/** Every place somebody can live. Today that is the dorms; the Greek houses join it later. */
export type HomeId = DormId

/** The building a home is in, as the map and the neighbor run-ins group it. */
export type HomeBuilding = DormBuilding

/** Where the reader lives when he arrives, and until something moves him. */
export const STARTING_HOME: HomeId = 'lowrise_4'

/** Asks {@link homeOf} about the reader himself rather than a character. */
export const READER = 'reader'

/** What {@link homeOf} reads: the characters' records, where each one's dorm is filed. */
export interface HomeSource {
  charInfo: Readonly<Record<string, Pick<CharInfo, 'dorm'> | undefined>>
}

/**
 * Where `who` lives: the reader (by {@link READER}) or a character (by charId). A character the
 * source holds no record of has no home, and the answer is `undefined`.
 */
export function homeOf(source: HomeSource, who: typeof READER): HomeId
export function homeOf(source: HomeSource, who: string): HomeId | undefined
export function homeOf(source: HomeSource, who: string): HomeId | undefined {
  if (who === READER) return STARTING_HOME
  return source.charInfo[who]?.dorm
}

/** What a home is called everywhere it is printed. */
export function homeLabel(home: HomeId): string {
  return dormLabel(home)
}

/** The ` | She has a single room at …` tail of a cast block's labeled facts line. */
export function homeClause(home: HomeId, gender: Gender): string {
  return dormClause(home, gender)
}

/** The same fact as lorebook prose. */
export function homeSentence(home: HomeId, gender: Gender): string {
  return dormSentence(home, gender)
}

/** The building a home is in, or null for somebody who has none. */
export function homeBuildingOf(home: HomeId | undefined): HomeBuilding | null {
  return dormBuildingOf(home)
}

/** What the map calls the building a room is in. */
export function homeGroupLabel(home: HomeId): string {
  return dormGroupLabel(home)
}

/** The glyph the map draws that building with. */
export function homeIcon(home: HomeId): string {
  return dormIcon(home)
}

/** The one line the map says about the building a room is in. */
export function homeGroupBlurb(home: HomeId): string {
  return dormGroupBlurb(home)
}

/** What the reader's own block says he has: `a single dorm in Lowrise 4`. */
export function readerHolding(home: HomeId): string {
  return `a single dorm in ${homeLabel(home)}`
}

/** His room in the words a narration prompt uses: `Lowrise dorm room`. */
export function homeRoomWords(home: HomeId): string {
  return home === 'elysium' ? 'Elysium Village townhouse' : 'Lowrise dorm room'
}

/** The door a collector waits at, in the words of the game-over prose: `the Lowrise door`. */
export function homeDoorWords(home: HomeId): string {
  return home === 'elysium' ? 'the Elysium Village door' : 'the Lowrise door'
}

/** Which of the five Lowrises a home is, or null for any other home. */
export function lowriseNumberOf(home: HomeId): number | null {
  return home === 'elysium' ? null : Number(home.slice(-1))
}

/** The shared spaces of a home that the reader's action suggestions are set in. */
export function homeSharedPlaces(home: HomeId): { courtyard: string; kitchen: string; lounge: string } {
  const label = homeLabel(home)
  return {
    courtyard: `the ${label} courtyard`,
    kitchen: `the ${label} kitchen`,
    lounge: `the ${label} lounge`
  }
}

/** Every background that is somebody's own room, which the audio keeps silent. */
export const HOME_ROOM_BGS: readonly string[] = ['lowrise_dorm_room']

/**
 * The background drawn for a home's room. Only the Lowrise room exists until the Greek houses
 * bring their own, so every dorm shows it.
 */
export function homeRoomBg(_home: HomeId): string {
  return HOME_ROOM_BGS[0]
}
