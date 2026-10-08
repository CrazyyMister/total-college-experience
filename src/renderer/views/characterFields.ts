import { STAT_KEYS, STAT_LABELS } from '@shared/playerStats'
import { GIFT_CATEGORIES } from '@shared/shop'
import { CHARACTER_TRAITS } from '@shared/traits'
import { pronounsOf } from '@shared/pronouns'
import type { CharacterBehavior, Gender, OutfitSet, SetTarget } from '@shared/types'

/**
 * What a character panel shows, and in what order — shared by the editor and the read-only
 * panel.
 */

/**
 * The behaviour fields under "More settings", in relationship order, in the pronoun of a
 * character of `gender`. `around` is the noun each field's placeholder addresses her by.
 */
export function behaviorFieldsFor(gender: Gender): ReadonlyArray<{
  key: keyof CharacterBehavior
  label: string
  around: string
}> {
  const dislikes = `someone ${pronounsOf(gender).subject} dislikes`
  return [
    { key: 'withStrangers', label: 'With strangers', around: 'strangers' },
    { key: 'withFriends', label: 'With friends', around: 'friends' },
    { key: 'withCrush', label: 'With a crush', around: 'a crush' },
    { key: 'withLover', label: 'With a lover', around: 'a lover' },
    { key: 'withEnemy', label: `With ${dislikes}`, around: dislikes }
  ]
}

/**
 * The character's tag lists, in the order the wardrobes above them are shown. Each is a
 * `Character` field holding booru tags and is edited as chips.
 */
export const TAG_FIELDS: ReadonlyArray<{
  key: 'baseAppearance' | 'outfit' | 'peOutfit' | 'swimOutfit'
  id: string
  label: string
}> = [
  { key: 'baseAppearance', id: 'edit-appearance', label: 'Appearance' },
  { key: 'outfit', id: 'edit-outfit', label: 'Outfit' },
  { key: 'peOutfit', id: 'edit-pe-outfit', label: 'PE Outfit' },
  { key: 'swimOutfit', id: 'edit-swim-outfit', label: 'Swimwear' }
]

/**
 * The wardrobes in the order they are shown, named as the player sees them. The winter and
 * uniform ones are last, and a panel shows each only for a character who has it
 * ({@link shownWardrobes}).
 */
export const WARDROBES: ReadonlyArray<{ target: SetTarget; set: OutfitSet | null; title: string }> =
  [
    { target: 'default', set: null, title: 'Default Outfit' },
    { target: 'pe', set: 'pe', title: 'PE Outfit' },
    { target: 'swim', set: 'swim', title: 'Swimsuit' },
    { target: 'nude', set: 'nude', title: 'Nude Outfit' },
    { target: 'winter', set: 'winter', title: 'Winter Outfit' },
    { target: 'uniform', set: 'uniform', title: 'Team Uniform' }
  ]

/** Which of the code's own wardrobes a panel lays out: those she has tags or sprites for. */
export interface ShownWardrobes {
  winter: boolean
  uniform: boolean
}

/** The wardrobes a panel lays out: a code-owned column only where she has tags or sprites for it. */
export function shownWardrobes(shown: ShownWardrobes): typeof WARDROBES {
  return WARDROBES.filter(
    (entry) =>
      (entry.set !== 'winter' || shown.winter) && (entry.set !== 'uniform' || shown.uniform)
  )
}

/** The class of the grid that lays those columns out: four across, and one more for each shown. */
export function wardrobesClass(shown: ShownWardrobes): string {
  const extra = Number(shown.winter) + Number(shown.uniform)
  if (extra === 0) return 'vu-edit-wardrobes'
  return `vu-edit-wardrobes vu-edit-wardrobes--${extra === 1 ? 'five' : 'six'}`
}

/** The winter wardrobe's tag field: a record may omit it, so it stands apart from the others. */
export const WINTER_FIELD = {
  key: 'winterOutfit',
  id: 'edit-winter-outfit',
  label: 'Winter Outfit',
  hint: 'Clothes she wears indoors, from January 19 to March 15. Use a color once, and never her hair color: a repeated color leaks onto the wrong piece.'
} as const

/** The uniform wardrobe's tag field: a record may omit it, so it stands apart like the winter one. */
export const UNIFORM_FIELD = {
  key: 'uniformOutfit',
  id: 'edit-uniform-outfit',
  label: 'Team Uniform',
  hint: "What she wears at her team's practices and games: the sport's kit. Use a color once, and never her hair color: a repeated color leaks onto the wrong piece."
} as const

/** The trait vocabulary as picker options (`shared/traits.ts`, authoritative). */
export const TRAIT_OPTIONS = CHARACTER_TRAITS.map((trait) => ({
  value: trait,
  label: trait
}))

/**
 * The three stats as the attraction picker's options (`shared/playerStats.ts`,
 * authoritative), labelled as the status panel labels them.
 */
export const PREFERRED_STAT_OPTIONS = STAT_KEYS.map((key) => ({
  value: key,
  label: STAT_LABELS[key]
}))

/** The two genders as the gender picker's options. */
export const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' }
]

/** The two genders as the attraction picker's options, named as the people drawn to. */
export const ATTRACTION_OPTIONS = [
  { value: 'man', label: 'Men' },
  { value: 'woman', label: 'Women' }
]

/** The gift vocabulary as picker options (`shared/shop.ts`, authoritative). */
export const GIFT_CATEGORY_OPTIONS = GIFT_CATEGORIES.map((category) => ({
  value: category,
  label: category
}))

/** Likes and dislikes are edited one per line; an entry is a phrase and may hold a comma. */
export function listText(values: readonly string[]): string {
  return values.join('\n')
}

export function textList(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/**
 * What an empty field of the sheet shows: the shape its prose wants, told about her by name and
 * in her pronouns.
 */
export function sheetPlaceholders(
  name: string,
  gender: Gender
): {
  personality: string
  backstory: string
  datingHistory: string
  datingPreference: string
  kinks: string
  likes: string
  dislikes: string
  behavior: (around: string) => string
} {
  const p = pronounsOf(gender)
  return {
    personality: `${name} presents ${p.reflexive} as... but actually ${p.subject}'s... ${p.Subject} wants..., but... keeps ${p.object} from getting it. ${p.Subject} has a habit of...`,
    backstory: `${name} grew up... As a result, ${p.subject}...`,
    datingHistory: `${name} hasn't dated/has dated before... As a result, ${p.subject}...`,
    datingPreference: `${name} prefers hookups/long term relationships...`,
    kinks: `${name} has a thing for...`,
    likes: 'favorite foods\nfavorite beverages\nactivities\nentertainment preferences',
    dislikes: 'disliked foods\nallergies\npet peeves\nsensory experiences',
    behavior: (around: string) => `Around ${around}, ${name}...`
  }
}
