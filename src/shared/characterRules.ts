import { CHARACTER_FILE_NAME } from './characterFiles'
import { EMOTIONS } from './emotions'
import { assertSafeId, validateRecord, type ValidateRecordOptions } from './jsonValidate'
import { allFollowMain } from './outfits'
import { defaultSpriteScale } from './spriteScale'
import {
  randomSeed,
  type Character,
  type CharacterBehavior,
  type CharacterBrief,
  type CharacterIdentity,
  type Emotion,
  type Gender,
  type PoseManifest
} from './types'
import { randomId } from './uuid'

/**
 * What a character record must be, whichever store holds it: the version this build reads,
 * how an older one is brought up to it, the fields she carries, the id that is safe to make a
 * key out of, the shape a new one starts in, and which of the shipped cast the player has
 * taken off the roster.
 */

/** Schema version this build reads and writes. */
export const CHARACTER_SCHEMA_VERSION = 4

/** The tags every render of a character of each gender opens the appearance with. */
const SUBJECT_TAGS_BY_GENDER: Record<Gender, readonly string[]> = {
  woman: ['1girl', 'mature_female'],
  man: ['1boy', 'male_focus', 'mature_male', 'handsome']
}

/** Every subject tag of either gender: the renderer's, never the writer's. */
export const SUBJECT_TAGS: readonly string[] = Object.values(SUBJECT_TAGS_BY_GENDER).flat()

/** The reader's gender; he is always a man. */
export const READER_GENDER: Gender = 'man'

/** The tags every render of a character of `gender` opens the appearance with. */
export function subjectTagsOf(gender: Gender): readonly string[] {
  return SUBJECT_TAGS_BY_GENDER[gender]
}

/** An appearance led by `gender`'s subject tags, every other subject tag dropped. */
export function withSubjectTags(appearance: readonly string[], gender: Gender): string[] {
  return [...subjectTagsOf(gender), ...appearance.filter((tag) => !SUBJECT_TAGS.includes(tag))]
}

/** Whether `value` is one of the two genders. */
export function isGender(value: unknown): value is Gender {
  return value === 'man' || value === 'woman'
}

/** The gender a character of `gender` is drawn to when nobody has said otherwise. */
export function defaultAttractionOf(gender: Gender): Gender {
  return gender === 'woman' ? 'man' : 'woman'
}

/** The pose keys a character of `gender` may stand in, sorted: a man only in those marked for men. */
export function poseKeysFor(poses: PoseManifest, gender: Gender): string[] {
  return Object.keys(poses)
    .filter((key) => gender === 'woman' || poses[key]?.men === true)
    .sort()
}

/** Whether a character could be drawn to the reader. */
export function drawnToReader(character: CharacterIdentity): boolean {
  return character.attractedTo === READER_GENDER
}

/** What a character record must carry; where it is kept names her. */
const CHARACTER_REQUIRED: Record<
  keyof Omit<
    Character,
    | 'brief'
    | 'charId'
    | 'customOutfits'
    | 'negativeTags'
    | 'profileCrop'
    | 'regenTags'
    | 'updatedAt'
    | 'voicePitch'
  >,
  true
> = {
  schemaVersion: true,
  gender: true,
  attractedTo: true,
  firstName: true,
  lastName: true,
  personality: true,
  behavior: true,
  backstory: true,
  datingHistory: true,
  datingPreference: true,
  kinks: true,
  isVirgin: true,
  likes: true,
  dislikes: true,
  giftPreferences: true,
  traits: true,
  preferredStat: true,
  height: true,
  generationSeed: true,
  seedFollowsMain: true,
  setSeeds: true,
  baseAppearance: true,
  pose: true,
  outfit: true,
  peOutfit: true,
  swimOutfit: true,
  expressionTags: true,
  roomPrompt: true
}

/** How a character record is checked once it has been read. */
export const CHARACTER_READ: ValidateRecordOptions<Character> = {
  label: CHARACTER_FILE_NAME,
  malformed: { code: 'CHARACTER_MALFORMED', message: 'character.json is not valid JSON.' },
  schemaVersion: { code: 'CHARACTER_SCHEMA_VERSION' },
  expects: CHARACTER_SCHEMA_VERSION,
  required: CHARACTER_REQUIRED
}

/**
 * A version-2 record brought up to version 3, the subject tags it lacks put in front of her
 * appearance; anything else comes back untouched.
 */
function upgradeFromVersion2(candidate: Record<string, unknown>): Record<string, unknown> {
  if (candidate.schemaVersion !== 2 || !Array.isArray(candidate.baseAppearance)) return candidate
  const held = candidate.baseAppearance.map(String)
  const missing = subjectTagsOf('woman').filter((tag) => !held.includes(tag))
  return {
    ...candidate,
    schemaVersion: 3,
    baseAppearance: [...missing, ...candidate.baseAppearance]
  }
}

/** The subject tags a version-4 man was written with, which his upgrade leads with. */
const VERSION_4_MAN_TAGS = ['1boy', 'male_focus']

/**
 * A version-3 record brought up to version 4: `1boy` in the appearance makes a man, whose
 * appearance then leads with the version's own two tags for a man and drops a woman's, and
 * anyone else a woman; each is drawn to the other gender. Anything else comes back untouched.
 */
function upgradeFromVersion3(candidate: Record<string, unknown>): Record<string, unknown> {
  if (candidate.schemaVersion !== 3 || !Array.isArray(candidate.baseAppearance)) return candidate
  const appearance = candidate.baseAppearance.map(String)
  const gender: Gender = appearance.includes('1boy') ? 'man' : 'woman'
  return {
    ...candidate,
    schemaVersion: 4,
    gender,
    attractedTo: defaultAttractionOf(gender),
    baseAppearance:
      gender === 'man'
        ? [
            ...VERSION_4_MAN_TAGS,
            ...appearance.filter(
              (tag) => !VERSION_4_MAN_TAGS.includes(tag) && !subjectTagsOf('woman').includes(tag)
            )
          ]
        : candidate.baseAppearance
  }
}

/**
 * A record from either of the two versions before this one brought up to it, a step at a time;
 * anything else comes back untouched, for the record check to refuse by name.
 */
export function upgradeCharacterRecord(parsed: unknown): { record: unknown; upgraded: boolean } {
  if (typeof parsed !== 'object' || parsed === null) return { record: parsed, upgraded: false }
  const candidate = parsed as Record<string, unknown>
  const record = upgradeFromVersion3(upgradeFromVersion2(candidate))
  return { record, upgraded: record !== candidate }
}

/**
 * One parsed character record, brought up to this build's version and checked; `upgraded` says
 * whether it was older than the version it now reads as.
 */
export function readCharacterRecord(
  parsed: unknown,
  where: string
): { character: Character; upgraded: boolean } {
  const { record, upgraded } = upgradeCharacterRecord(parsed)
  return { character: validateRecord<Character>(record, where, CHARACTER_READ), upgraded }
}

/** Raised when a character record is there but cannot be read. */
export const CHARACTER_UNREADABLE = {
  code: 'CHARACTER_UNREADABLE',
  message: 'Could not read the character file.'
}

/** Raised when there is no such character. */
export const CHARACTER_NOT_FOUND = {
  code: 'CHARACTER_NOT_FOUND',
  message: 'That character no longer exists.'
}

/** The one pattern for a safe charId. */
export const SAFE_CHAR_ID = /^[A-Za-z0-9-]+$/

/** Rejects a charId that could escape the folder, key space or `charimg://` host it names. */
export function assertSafeCharId(charId: string): void {
  assertSafeId(charId, SAFE_CHAR_ID, 'CHARACTER_ID_INVALID', 'That character id is not valid.')
}

/** Empty tag sets for all seven emotions — the shape before the LLM fills it in. */
function emptyExpressionTags(): Record<Emotion, string[]> {
  const tags = {} as Record<Emotion, string[]>
  for (const emotion of EMOTIONS) tags[emotion] = []
  return tags
}

/** Empty relationship-stage behaviour — the shape before the LLM fills it in. */
function emptyBehavior(): CharacterBehavior {
  return { withStrangers: '', withFriends: '', withCrush: '', withLover: '', withEnemy: '' }
}

/**
 * The pre-LLM record a new character starts as; an empty `pose` marks her as not generated.
 * The brief rides along until her sheet lands, so an interrupted write can be rerun from it.
 */
export function newCharacter(
  firstName: string,
  lastName: string,
  identity: CharacterIdentity,
  brief?: CharacterBrief
): Character {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    charId: randomId(),
    gender: identity.gender,
    attractedTo: identity.attractedTo,
    firstName,
    lastName,
    personality: '',
    behavior: emptyBehavior(),
    backstory: '',
    datingHistory: '',
    datingPreference: '',
    kinks: '',
    isVirgin: false,
    likes: [],
    dislikes: [],
    giftPreferences: { liked: [], disliked: [] },
    traits: [],
    preferredStat: 'heart',
    // The default for her subject tags alone; the write pipeline sets the real one from her build.
    height: defaultSpriteScale(subjectTagsOf(identity.gender)),
    generationSeed: randomSeed(),
    seedFollowsMain: allFollowMain(),
    setSeeds: {},
    baseAppearance: [...subjectTagsOf(identity.gender)],
    pose: '',
    outfit: [],
    peOutfit: [],
    swimOutfit: [],
    expressionTags: emptyExpressionTags(),
    roomPrompt: '',
    ...(brief ? { brief } : {})
  }
}

/** Whether the LLM has filled her sheet in: an empty `pose` is the marker a new record carries. */
export function isWritten(character: Character): boolean {
  return character.pose !== ''
}

/** One sensible tag per emotion, drawn only from the groups Appendix A defines. */
export function defaultExpressionTags(): Record<Emotion, string[]> {
  return {
    neutral: ['expressionless'],
    happy: ['happy', 'light_smile'],
    sad: ['(sad:0.7)', '(frown:0.5)'],
    angry: ['(angry:0.5)', 'furrowed_brow', 'clenched_teeth'],
    surprised: ['(surprised:0.7)', 'raised_eyebrows', 'open_mouth', '(wide-eyed:0.6)'],
    embarrassed: ['(embarrassed:0.5)', 'blush', 'sideways_glance'],
    aroused: ['naughty_face', 'parted_lips', '(half-closed_eyes:0.7)', 'blush']
  }
}

/**
 * The sheet a Skip-LLM character is written with, which {@link isWritten} reads as written.
 */
export function blankSheet(character: Character, personality: string, pose: string): Character {
  const { brief: _brief, ...rest } = character
  return {
    ...rest,
    personality,
    pose,
    preferredStat: 'body',
    expressionTags: defaultExpressionTags()
  }
}

/** Every shipped charId, and which of them the player has removed; only a shipped id counts. */
export function defaultsStatusOf(
  ids: readonly string[],
  removed: readonly string[]
): { ids: string[]; removed: string[] } {
  return { ids: [...ids], removed: removed.filter((charId) => ids.includes(charId)) }
}

/** The removed-defaults list with `charId` on it, unchanged where it already is. */
export function withRemovedDefault(list: readonly string[], charId: string): string[] {
  return list.includes(charId) ? [...list] : [...list, charId]
}
