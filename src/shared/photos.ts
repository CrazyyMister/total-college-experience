/**
 * The photos a character can send by text: the kinds, and the table of what each place looks like in a picture and what she wears there.
 */

import type { PhotoPrompts } from './imagePrompt'
import { ROOM_LOCATION } from './locations'
import { OUTFIT_SETS } from './outfits'
import type { OutfitSet } from './types'
import { WEATHER_KINDS, type Weather } from './weather'

/** Every kind of photo, in a fixed order; a new kind is appended. */
export const PHOTO_KINDS = ['selfie', 'mirror', 'food', 'place', 'sexy', 'nude'] as const
export type PhotoKind = (typeof PHOTO_KINDS)[number]

/** Whether a kind is one of the two adult ones: in lingerie, or nude. */
export function isAdultPhoto(kind: PhotoKind): boolean {
  return kind === 'sexy' || kind === 'nude'
}

/** What she wears in a photo of her: her main outfit, or one of her other sets. */
export type PhotoOutfit = 'main' | Exclude<OutfitSet, 'nude'>

/** Whether a photo of this kind has her in it; food and places show nobody. */
export function photoShowsHer(kind: PhotoKind): boolean {
  return kind !== 'food' && kind !== 'place'
}

/** How each kind is framed. */
export const PHOTO_FRAMING_TAGS: Readonly<Record<PhotoKind, readonly string[]>> = {
  selfie: ['selfie', 'upper_body', 'looking_at_viewer'],
  mirror: ['mirror', 'reflection', 'selfie', 'holding_phone', 'cellphone', 'cowboy_shot'],
  food: ['food', 'food_focus', 'still_life', 'table', 'from_above'],
  place: ['scenery'],
  sexy: ['selfie', 'on_bed', 'looking_at_viewer'],
  nude: ['selfie', 'on_bed', 'looking_at_viewer']
}

/** What the two adult kinds add to her face. */
export const SEXY_EXPRESSION_TAGS: readonly string[] = ['blush', 'seductive_smile']

/** What she wears in the sexy kind. */
export const LINGERIE_TAGS: readonly string[] = ['lingerie', 'bra', 'panties']

/**
 * What every photo with her in it steers away from: the stains and fluids the model paints on her
 * chest. Never on food or a place, where cream or chocolate may be the subject.
 */
export const PHOTO_BODY_NEGATIVE_TAGS: readonly string[] = [
  'cum',
  'cum_on_body',
  'cum_on_breasts',
  'cum_on_clothes',
  'bodily_fluids',
  'cream',
  'cream_on_body',
  'whipped_cream',
  'chocolate',
  'chocolate_on_body',
  'chocolate_on_breasts',
  'lactation',
  'stain'
]

/** What a photo with nobody in it steers away from. */
export const NOBODY_NEGATIVE_TAGS: readonly string[] = ['1girl', '1boy', 'person', 'people']

/** One place as a photo shows it. */
export interface PhotoPlace {
  /** The background, as booru tags. */
  tags: readonly string[]
  /** Under the sky, so the weather and the night sky show. */
  outdoors?: true
  /** Somewhere nobody else would see her. */
  private?: true
  /** The set she wears there; absent, her main outfit. */
  outfit?: 'pe' | 'swim'
}

/** Every place a photo can be taken, keyed by location id; her own room is `room`. */
export const PHOTO_PLACES: Readonly<Record<string, PhotoPlace>> = {
  [ROOM_LOCATION]: { tags: ['bedroom', 'bed', 'indoors'], private: true },
  agora: { tags: ['cafeteria', 'food_court', 'indoors'] },
  apogee_club: { tags: ['nightclub', 'neon_lights', 'dim_lighting', 'indoors'] },
  bobbys_diner: { tags: ['diner', 'booth_seating', 'restaurant', 'indoors'] },
  btb_arcade: { tags: ['arcade', 'arcade_cabinet', 'neon_lights', 'indoors'] },
  cutetea: { tags: ['cafe', 'bubble_tea', 'indoors'] },
  eastern_buffet: { tags: ['restaurant', 'buffet', 'indoors'] },
  fast_eats: { tags: ['restaurant', 'fast_food', 'indoors'] },
  freights_books: { tags: ['bookstore', 'bookshelf', 'vinyl', 'indoors'] },
  green_hill_park: { tags: ['park', 'grass', 'tree', 'outdoors'], outdoors: true },
  kendall_library: { tags: ['library', 'bookshelf', 'computer', 'indoors'] },
  lowrise_dorms: { tags: ['dormitory', 'lounge', 'couch', 'indoors'] },
  lumiere_fusion: { tags: ['restaurant', 'candle', 'wine_glass', 'indoors'] },
  palaestra_stadium: { tags: ['gym', 'indoors'], outfit: 'pe' },
  pino_cola_lounge: { tags: ['lounge', 'table_tennis', 'couch', 'indoors'] },
  reserve_bank_cafe: { tags: ['cafe', 'laptop', 'indoors'] },
  spring_mart: { tags: ['supermarket', 'shelf', 'indoors'] },
  stalestein_bar: { tags: ['bar_(place)', 'stage', 'dim_lighting', 'indoors'] },
  thorne_auditorium: { tags: ['concert_hall', 'stage', 'indoors'] },
  venus_quad: { tags: ['campus', 'fountain', 'tree', 'outdoors'], outdoors: true },
  whitman_greenhouse: { tags: ['greenhouse', 'plant', 'flower', 'indoors'] },
  future_cinema: { tags: ['movie_theater', 'indoors'] },
  hotel_dreams: { tags: ['hotel_room', 'bed', 'indoors'], private: true },
  lotterdale_market: { tags: ['market', 'market_stall', 'indoors'] },
  pastel_palace: { tags: ['cafe', 'cake', 'pastry', 'indoors'] },
  pier_44: {
    tags: ['amusement_park', 'ferris_wheel', 'boardwalk', 'outdoors'],
    outdoors: true
  },
  riverside_aquarium: { tags: ['aquarium', 'fish', 'indoors'] },
  riverside_mall: { tags: ['shopping_mall', 'indoors'] },
  selkie_beach: { tags: ['beach', 'ocean', 'sand', 'outdoors'], outdoors: true, outfit: 'swim' },
  veridan_museum: { tags: ['museum', 'painting_(object)', 'indoors'] }
}

/** What a photo shows of the hour: the half of the day, and the sky where there is one. */
export function photoTimeTags(
  place: PhotoPlace | undefined,
  night: boolean,
  weather: Weather
): string[] {
  const tags = [night ? 'night' : 'day']
  if (!place?.outdoors) return tags
  if (night) tags.push('night_sky')
  if (weather === 'rain') tags.push('rain', 'wet', 'overcast')
  if (weather === 'storm') tags.push('rain', 'lightning', 'dark_clouds')
  return tags
}

/** The set she wears at a place unless something else is chosen. */
export function photoOutfitAt(placeId: string): PhotoOutfit {
  return PHOTO_PLACES[placeId]?.outfit ?? 'main'
}

/** Where she is when the map places her nowhere, or somewhere no photo can show. */
export function photoPlaceOf(location: string | null): string {
  return location !== null && PHOTO_PLACES[location] ? location : ROOM_LOCATION
}

/** One photo's tag groups, each one a list the player may rewrite. */
export interface PhotoGroups {
  base: string[]
  appearance: string[]
  outfit: string[]
  framing: string[]
  expression: string[]
  place: string[]
  time: string[]
  negative: string[]
}

/** The groups in the order the positive prompt is written in, the negative last. */
export const PHOTO_GROUP_ORDER: readonly (keyof PhotoGroups)[] = [
  'base',
  'appearance',
  'outfit',
  'framing',
  'expression',
  'place',
  'time',
  'negative'
]

/** What each group is called over its own well. */
export const PHOTO_GROUP_LABELS: Readonly<Record<keyof PhotoGroups, string>> = {
  base: 'Base',
  appearance: 'Appearance',
  outfit: 'Outfit',
  framing: 'Framing',
  expression: 'Expression',
  place: 'Place',
  time: 'Time and weather',
  negative: 'Negative'
}

/** The groups a photo of this kind is drawn from; one with nobody in it has none of hers. */
export function photoGroupsOf(kind: PhotoKind): readonly (keyof PhotoGroups)[] {
  return photoShowsHer(kind)
    ? PHOTO_GROUP_ORDER
    : PHOTO_GROUP_ORDER.filter(
        (key) => key !== 'appearance' && key !== 'outfit' && key !== 'expression'
      )
}

/**
 * One photo a text carries, settled when the reply lands: everything a redraw needs. A
 * regeneration changes only the seed, the prompts and the groups; what the photo is stays.
 */
export interface MessagePhoto {
  kind: PhotoKind
  seed: number
  /** A key of `PHOTO_PLACES`. */
  place: string
  outfit: PhotoOutfit
  night: boolean
  weather: Weather
  /** The prompts the version shown is drawn from; a redraw sends exactly these. */
  prompts: PhotoPrompts
  /** The groups as the game first wrote them, which a regeneration's reset puts back. */
  draft?: PhotoGroups
  /** The groups of the version shown, where a regeneration rewrote them away from the draft. */
  groups?: PhotoGroups
}

/** Whether a value is a seed a photo may carry: a whole number from 0 to the largest safe one. */
export function isPhotoSeed(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

/** A fresh photo seed, below the largest safe integer whatever `rand` answers short of 1. */
export function photoSeed(rand: () => number = Math.random): number {
  return Math.floor(rand() * Number.MAX_SAFE_INTEGER)
}

/** Whether a value is a set a photo may name: her main outfit or any set but the nude one. */
function isPhotoOutfit(value: unknown): value is PhotoOutfit {
  return value === 'main' || (value !== 'nude' && (OUTFIT_SETS as readonly unknown[]).includes(value))
}

/** A non-empty string. */
function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/**
 * A message's photo field, read whole or not at all: null for no field and for one that does
 * not read whole, which is then shown as no photo and never redrawn.
 */
export function readMessagePhoto(value: unknown): MessagePhoto | null {
  if (typeof value !== 'object' || value === null) return null
  const photo = value as Record<string, unknown>
  const prompts = photo.prompts as Record<string, unknown> | null | undefined
  if (
    !(PHOTO_KINDS as readonly unknown[]).includes(photo.kind) ||
    !isPhotoSeed(photo.seed) ||
    !isText(photo.place) ||
    !isPhotoOutfit(photo.outfit) ||
    typeof photo.night !== 'boolean' ||
    !(WEATHER_KINDS as readonly unknown[]).includes(photo.weather) ||
    typeof prompts !== 'object' ||
    prompts === null ||
    !isText(prompts.positive) ||
    typeof prompts.negative !== 'string' ||
    !isText(prompts.detailerPositive) ||
    (photo.draft !== undefined && !isPhotoGroups(photo.draft)) ||
    (photo.groups !== undefined && !isPhotoGroups(photo.groups))
  ) {
    return null
  }
  return value as MessagePhoto
}

/** Whether a value is a photo's groups: every group present, each a list of tags. */
function isPhotoGroups(value: unknown): value is PhotoGroups {
  if (typeof value !== 'object' || value === null) return false
  const groups = value as Record<string, unknown>
  return PHOTO_GROUP_ORDER.every(
    (key) =>
      Array.isArray(groups[key]) &&
      (groups[key] as unknown[]).every((tag) => typeof tag === 'string')
  )
}

/** Whether two groups hold the same tags in the same order. */
export function samePhotoGroups(a: PhotoGroups, b: PhotoGroups): boolean {
  return PHOTO_GROUP_ORDER.every(
    (key) => a[key].length === b[key].length && a[key].every((tag, i) => tag === b[key][i])
  )
}

/**
 * The 53-bit cyrb53 hash of a string: integer arithmetic on its UTF-16 code units alone, so it
 * answers the same on every machine and in every version.
 */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/**
 * A version's code: fourteen hex digits hashed off the three prompts that draw it, joined by a
 * NUL no prompt holds. The same prompts always answer the same code.
 */
export function photoCode(prompts: PhotoPrompts): string {
  const text = [prompts.positive, prompts.negative, prompts.detailerPositive].join('\u0000')
  return cyrb53(text).toString(16).padStart(14, '0')
}

/** Whether two photos are the same version: the same seed and the same prompts. */
export function samePhotoVersion(a: MessagePhoto, b: MessagePhoto): boolean {
  return a.seed === b.seed && photoCode(a.prompts) === photoCode(b.prompts)
}

/**
 * What a regeneration's finished file swaps a message's photo field for: `next` while the field
 * still reads as the version the regeneration began from, and null otherwise — a field that no
 * longer reads, or a version that has moved on, is left as it is.
 */
export function swappedPhoto(
  current: unknown,
  from: MessagePhoto,
  next: MessagePhoto
): MessagePhoto | null {
  const photo = readMessagePhoto(current)
  return photo !== null && samePhotoVersion(photo, from) ? next : null
}

/** A message id that may become part of a file name. */
const PHOTO_MESSAGE_ID = /^[A-Za-z0-9-]{1,64}$/

/** A photo's file under a playthrough's `photos` folder: `{messageId}-{seed}-{code}.png`. */
const PHOTO_FILE = /^([A-Za-z0-9-]{1,64})-([0-9]{1,16})-([0-9a-f]{14})\.png$/

/**
 * The file one version of a message's photo is kept in, its code hashed here off the prompts,
 * or null where the id or the seed cannot be one.
 */
export function photoFileName(ref: PhotoRef): string | null {
  if (!PHOTO_MESSAGE_ID.test(ref.messageId) || !isPhotoSeed(ref.seed)) return null
  return `${ref.messageId}-${ref.seed}-${photoCode(ref.prompts)}.png`
}

/** Whether a name is exactly one a photo is kept under. */
export function isPhotoFileName(name: string): boolean {
  return photoFileMessageOf(name) !== null
}

/** The message a photo's file is a version of, or null for a name no photo is kept under. */
export function photoFileMessageOf(name: string): string | null {
  const match = PHOTO_FILE.exec(name)
  if (!match) return null
  const seed = Number(match[2])
  return isPhotoSeed(seed) && String(seed) === match[2] ? match[1]! : null
}

/** One text's photo to draw: whose playthrough, which message, and what it carries. */
export interface PhotoRenderRequest {
  playthroughId: string
  messageId: string
  kind: PhotoKind
  seed: number
  prompts: PhotoPrompts
}

/** One version of a message's photo, named by its message, its seed and its prompts' code. */
export interface PhotoRef {
  messageId: string
  seed: number
  prompts: PhotoPrompts
}
