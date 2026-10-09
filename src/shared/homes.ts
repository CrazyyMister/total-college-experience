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
  dormSpotLabel,
  dormSpotsOf,
  isDorm,
  type DormBuilding,
  type DormId
} from './dorms'
import {
  HOUSES,
  HOUSE_SPOTS,
  houseClause,
  houseSentence,
  isHouse,
  type HouseId,
  type OfficeId
} from './houses'
import { ELYSIUM_LOCATION, locationDefOf, LOWRISE_LOCATION } from './locations'
import type { CharInfo, Gender } from './types'

/** Every place somebody can live: the dorms, and the four Greek houses on Laurel Row. */
export type HomeId = DormId | HouseId

/** The building a home is in, as the map and the neighbor run-ins group it: a house is its own. */
export type HomeBuilding = DormBuilding | HouseId

/** Where the reader lives when he arrives, and until something moves him. */
export const STARTING_HOME: HomeId = 'lowrise_4'

/**
 * Asks {@link homeOf} about the reader himself rather than a character. It is also the key his
 * move is filed under in {@link HomeSource.homeMoves}.
 */
export const READER = 'player'

/** Whether `value` names a place somebody can live. */
export function isHome(value: string): value is HomeId {
  return isDorm(value) || isHouse(value)
}

/** What {@link homeOf} reads: the moves a save holds, and the characters' records. */
export interface HomeSource {
  /** Where the save says somebody lives now, by {@link READER} or charId. */
  homeMoves: Readonly<Record<string, HomeId>>
  /**
   * Where each character is filed: the house she belongs to, and failing that her dorm, which is
   * her home until a move says otherwise.
   */
  charInfo: Readonly<Record<string, Pick<CharInfo, 'dorm' | 'house'> | undefined>>
}

/**
 * Where `who` lives: the reader (by {@link READER}) or a character (by charId). A move the save
 * holds wins; a value it holds that names no place is not one. Failing that, the reader is where
 * he starts and a character is where her record files her, and a character the source holds no
 * record of has no home, so the answer is `undefined`.
 */
export function homeOf(source: HomeSource, who: typeof READER): HomeId
export function homeOf(source: HomeSource, who: string): HomeId | undefined
export function homeOf(source: HomeSource, who: string): HomeId | undefined {
  const moved = source.homeMoves[who]
  if (moved !== undefined && isHome(moved)) return moved
  if (who === READER) return STARTING_HOME
  const filed = source.charInfo[who]
  return filed?.house ?? filed?.dorm
}

/**
 * `moves` with `who` living in `home`. Setting a move that is already there answers `moves`
 * itself, so a boundary that runs twice leaves the same record.
 */
export function withHomeMove(
  moves: Readonly<Record<string, HomeId>>,
  who: string,
  home: HomeId
): Readonly<Record<string, HomeId>> {
  return moves[who] === home ? moves : { ...moves, [who]: home }
}

/** What a home is called everywhere it is printed. */
export function homeLabel(home: HomeId): string {
  return isHouse(home) ? HOUSES[home].nickname : dormLabel(home)
}

/** The ` | She has a single room at …` tail of a cast block's labeled facts line. */
export function homeClause(home: HomeId, gender: Gender, office?: OfficeId): string {
  return isHouse(home) ? houseClause(home, gender, office) : dormClause(home, gender)
}

/** The same fact as lorebook prose. */
export function homeSentence(home: HomeId, gender: Gender, office?: OfficeId): string {
  return isHouse(home) ? houseSentence(home, gender, office) : dormSentence(home, gender)
}

/** The office somebody holds in the house she lives in now, or none: a move out gives it up. */
export function officeAt(
  info: Pick<CharInfo, 'house' | 'office'> | undefined,
  home: HomeId | undefined
): OfficeId | undefined {
  return info?.office !== undefined && info.house !== undefined && info.house === home
    ? info.office
    : undefined
}

/** The building a home is in, or null for somebody who has none. */
export function homeBuildingOf(home: HomeId | undefined): HomeBuilding | null {
  if (home !== undefined && isHouse(home)) return home
  return dormBuildingOf(home as DormId | undefined)
}

/** What the map calls the building a room is in. */
export function homeGroupLabel(home: HomeId): string {
  return isHouse(home) ? HOUSES[home].nickname : dormGroupLabel(home)
}

/** The glyph the map draws that building with. */
export function homeIcon(home: HomeId): string {
  return isHouse(home) ? (locationDefOf(home)?.icon ?? '🏠') : dormIcon(home)
}

/** The one line the map says about the building a room is in. */
export function homeGroupBlurb(home: HomeId): string {
  return isHouse(home) ? (locationDefOf(home)?.blurb ?? '') : dormGroupBlurb(home)
}

/** What the reader's own block says he has: `a single dorm in Lowrise 4`. */
export function readerHolding(home: HomeId): string {
  return isHouse(home) ? `a room of his own in the ${homeLabel(home)} house` : `a single dorm in ${homeLabel(home)}`
}

/** His room in the words a narration prompt uses: `Lowrise dorm room`. */
export function homeRoomWords(home: HomeId): string {
  if (isHouse(home)) return `${homeLabel(home)} house room`
  return home === 'elysium' ? 'Elysium Village townhouse' : 'Lowrise dorm room'
}

/** The door a collector waits at, in the words of the game-over prose: `the Lowrise door`. */
export function homeDoorWords(home: HomeId): string {
  if (isHouse(home)) return `the ${homeLabel(home)} door`
  return home === 'elysium' ? 'the Elysium Village door' : 'the Lowrise door'
}

/** Which of the five Lowrises a home is, or null for any other home. */
export function lowriseNumberOf(home: HomeId): number | null {
  return isHouse(home) || home === 'elysium' ? null : Number(home.slice(-1))
}

/** The shared spaces of a home that the reader's action suggestions are set in. */
export function homeSharedPlaces(home: HomeId): { courtyard: string; kitchen: string; lounge: string } {
  const label = homeLabel(home)
  if (isHouse(home)) {
    return {
      courtyard: `the ${label} front lawn`,
      kitchen: `the ${label} kitchen`,
      lounge: `the ${label} common room`
    }
  }
  return {
    courtyard: `the ${label} courtyard`,
    kitchen: `the ${label} kitchen`,
    lounge: `the ${label} lounge`
  }
}

/** Every background that is somebody's own room, which the audio keeps silent. */
export const HOME_ROOM_BGS: readonly string[] = ['lowrise_dorm_room', 'kappa_row_room', 'xi_delt_room']

/**
 * The background drawn for a home's room: a fraternity's own room for its members, and the
 * Lowrise room for everybody else, the sororities having no room of their own drawn.
 */
export function homeRoomBg(home: HomeId): string {
  return isHouse(home) && HOUSES[home].kind === 'fraternity' ? `${home}_room` : HOME_ROOM_BGS[0]
}

/** The place a building is, as the scenes and the map name it. */
export function buildingLocationOf(building: HomeBuilding): string {
  if (isHouse(building)) return building
  return building === 'elysium' ? ELYSIUM_LOCATION : LOWRISE_LOCATION
}

/** The shared rooms a building has, where a resident is run into. */
export function homeSpotsOf(building: HomeBuilding): readonly { id: string; label: string }[] {
  return isHouse(building) ? HOUSE_SPOTS.filter((spot) => spot.house === building) : dormSpotsOf(building)
}

/** What a shared room is called where it is printed; an unknown id answers itself. */
export function homeSpotLabel(id: string): string {
  return HOUSE_SPOTS.find((spot) => spot.id === id)?.label ?? dormSpotLabel(id)
}
