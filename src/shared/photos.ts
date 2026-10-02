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

/** One photo a text carries, settled when the reply lands: everything a redraw needs. */
export interface MessagePhoto {
  kind: PhotoKind
  seed: number
  /** A key of `PHOTO_PLACES`. */
  place: string
  outfit: PhotoOutfit
  night: boolean
  weather: Weather
  /** The prompts as written when it was settled; a redraw sends exactly these. */
  prompts: PhotoPrompts
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
    !isText(prompts.detailerPositive)
  ) {
    return null
  }
  return value as MessagePhoto
}

/** A message id that may become part of a file name. */
const PHOTO_MESSAGE_ID = /^[A-Za-z0-9-]{1,64}$/

/** A photo's file under a playthrough's `photos` folder: `{messageId}-{seed}.png`. */
const PHOTO_FILE = /^([A-Za-z0-9-]{1,64})-([0-9]{1,16})\.png$/

/** The file a message's photo is kept in, or null where the id or the seed cannot be one. */
export function photoFileName(messageId: string, seed: number): string | null {
  if (!PHOTO_MESSAGE_ID.test(messageId) || !isPhotoSeed(seed)) return null
  return `${messageId}-${seed}.png`
}

/** Whether a name is exactly one a photo is kept under. */
export function isPhotoFileName(name: string): boolean {
  const match = PHOTO_FILE.exec(name)
  if (!match) return false
  return photoFileName(match[1]!, Number(match[2])) === name
}

/** One text's photo to draw: whose playthrough, which message, and what it carries. */
export interface PhotoRenderRequest {
  playthroughId: string
  messageId: string
  kind: PhotoKind
  seed: number
  prompts: PhotoPrompts
}

/** One photo named by its message and seed, as a file of it is. */
export interface PhotoRef {
  messageId: string
  seed: number
}
