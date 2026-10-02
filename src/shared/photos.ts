/**
 * The photos a character can send by text: the kinds, and the table of what each place looks like in a picture and what she wears there.
 */

import { ROOM_LOCATION } from './locations'
import type { OutfitSet } from './types'
import type { Weather } from './weather'

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
