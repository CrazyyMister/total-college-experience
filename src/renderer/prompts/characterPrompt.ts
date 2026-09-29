import { drawnToReader, poseKeysFor, SUBJECT_TAGS, subjectTagsOf } from '@shared/characterRules'
import { EMOTIONS } from '@shared/emotions'
import {
  BREAST_SIZES,
  EXPRESSION_EYEBROWS,
  EXPRESSION_EYES,
  EXPRESSION_GENERAL,
  EXPRESSION_MOUTH,
  EXPRESSION_OTHER,
  EYE_COLORS,
  FACIAL_HAIR_TAGS,
  HAIR_BANGS,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  HAIR_TEXTURES,
  HEAD_ACCESSORIES,
  MAKEUP_TAGS,
  MALE_FACE_TAGS,
  MALE_HAIR_BANGS,
  MALE_HAIR_STYLES,
  MALE_HEAD_ACCESSORIES,
  MALE_OUTFIT_SKIN_EXPOSURE,
  MALE_PHYSIQUE_TAGS,
  MALE_SKIN_TAGS,
  OUTFIT_SKIN_EXPOSURE,
  SHADES,
  SKIN_TAGS
} from '@shared/tags'
import type {
  Character,
  CharacterBehavior,
  CharacterIdentity,
  Emotion,
  Gender,
  PoseManifest,
  ReferenceImage,
  StructuredRequest
} from '@shared/types'
import { isVoiceTier, VOICE_TIERS, voicePitchOfTier } from '@shared/audio'
import { ROOM_PROMPT_PREFIX } from '@shared/room'
import { defaultSpriteScale } from '@shared/spriteScale'
import { isStatKey, STAT_ATTRACTIONS, STAT_KEYS } from '@shared/playerStats'
import { kindOf, pronounsOf, type Pronouns } from '@shared/pronouns'
import { CHARACTER_TRAITS, isCharacterTrait, TRAIT_DESCRIPTIONS } from '@shared/traits'
import {
  GIFT_CATEGORIES,
  GIFT_CATEGORY_DESCRIPTIONS,
  isGiftCategory,
  type GiftCategory,
  type GiftPreferences
} from '@shared/shop'
import { objectSchema } from './schema'
import { seedWordBlock } from './seedWords'

/** Builds and parses the character-generation request; pure, no IO. */

/** What the LLM is asked to return, before flattening into a {@link Character}. */
export interface CharacterDraft {
  firstName: string
  lastName: string
  personality: string
  behavior: CharacterBehavior
  backstory: string
  /** The four love-life answers from character generation. */
  datingHistory: string
  datingPreference: string
  kinks: string
  isVirgin: boolean
  likes: string[]
  dislikes: string[]
  /**
   * The category picks from character generation, filtered to the vocabulary by
   * {@link draftToCharacter}.
   */
  giftPreferences: { liked: string[]; disliked: string[] }
  /**
   * The trait picks from character generation, filtered to the vocabulary by
   * {@link draftToCharacter}.
   */
  traits: string[]
  /**
   * The attraction pick from character generation, filtered to the vocabulary by
   * {@link draftToCharacter}.
   */
  preferredStat: string
  appearance: {
    /** Raw colour names; {@link draftToCharacter} adds the shade and the suffix. */
    hairColor: string
    eyeColor: string
    /** Optional modifiers merged onto the two colours by {@link draftToCharacter}. */
    hairShade: string[]
    eyeShade: string[]
    hairLength: string
    hairTexture: string
    hairStyle: string[]
    hairBangs: string[]
    headAccessories: string[]
    /** A woman's alone. */
    makeup?: string[]
    breastSize?: string[]
    /** A man's alone. */
    physique?: string[]
    facialHair?: string[]
    face?: string[]
    skin: string[]
  }
  outfit: string[]
  /** The two alternate wardrobes, always written whether or not they get rendered. */
  peOutfit: string[]
  swimOutfit: string[]
  pose: string
  /** Flat tag list per emotion, free-form so the model can reweight a tag. */
  expressions: Record<Emotion, string[]>
  /** Continuation of ROOM_PROMPT_PREFIX, always written whether or not it gets rendered. */
  roomPrompt: string
  /** The pitch of her speaking voice, one of the three words {@link draftToCharacter} maps. */
  voice: string
}


/** The five behaviour fields, in the order the prompt introduces them. */
const BEHAVIOR_KEYS = [
  'withStrangers',
  'withFriends',
  'withCrush',
  'withLover',
  'withEnemy'
] as const satisfies readonly (keyof CharacterBehavior)[]

/** A string field constrained to one of Appendix A's values. */
function enumField(values: readonly string[]): Record<string, unknown> {
  return { type: 'string', enum: [...values] }
}

/** An array field whose items are constrained to Appendix A's values. */
function enumArray(values: readonly string[]): Record<string, unknown> {
  return { type: 'array', items: enumField(values) }
}

/** A free-form list of tag strings. */
function stringArray(): Record<string, unknown> {
  return { type: 'array', items: { type: 'string' } }
}

/** The system prompt: the same RITA persona as the scene calls. */
const SYSTEM = [
  'You are RITA, author of steamy romance fiction set at fictional universities.',
  'Today you\'re whipping up some character designs for an adult story.',
  'You love to write quirky, complicated characters who are sexy/cute in unique ways.',
  'You\'re an avid fashionista and hate boring outfits with no personality.',
  'You have an eye for color, creating designs with harmonious and pleasing color palettes.',
  'Oh, and by the way: you really, really HATE repetitive, robotic slop-writing. You NEVER use semicolons or emdashes or other dumb AI writing habits.',
  'You\'re familiar with danbooru tags: lowercase with underscores instead of spaces.',
  'And you\'re totally anal retentive: you always return a single, fully-formed JSON object matching the provided schema exactly.'
].join(' ')

/** The character-generation reference-image instruction, empty when no image was attached. */
function referenceBlock(p: Pronouns, reference?: ReferenceImage): string[] {
  if (!reference) return []
  return [
    '',
    'REFERENCE IMAGE',
    `A picture of the character is attached. Use it as inspiration for ${p.possessive} appearance and ${p.possessive} default outfit, noting the colors and vibe.`,
    `Don't copy the image exactly, try and imagine how ${p.subject}'d look as a university student in our world.`,
  ]
}

/**
 * The character-generation gender instruction: empty for a woman drawn to men, whom the
 * request is written for, and otherwise who the character is and whom they are drawn to.
 */
function identityBlock(identity: CharacterIdentity): string[] {
  const { gender, attractedTo } = identity
  if (gender === 'woman' && attractedTo === 'man') return []
  const lines = ['', 'GENDER AND ATTRACTION']
  const p = pronounsOf(gender)
  if (gender === 'man') {
    lines.push('This character is a man. Every appearance and outfit pick has to read as a man\'s.')
  }
  const partners = attractedTo === 'man' ? 'men' : 'women'
  lines.push(
    `${p.Subject} is attracted to ${partners} only. Write the LOVE LIFE answers and the withCrush and withLover behavior about ${partners}.`
  )
  return lines
}

/** The APPEARANCE section's categories, a man's drawn from his own lists. */
function appearanceLines(gender: Gender): string[] {
  const colors = [
    `hairColor/eyeColor: ${EYE_COLORS.join(', ')} (blonde for hairColor)`,
    `For hairShade/eyeShade, you can optionally pick (0-1): ${SHADES.join(', ')}.`,
    `hairLength: ${HAIR_LENGTHS.join(', ')}`,
    `hairTexture: ${HAIR_TEXTURES.join(', ')}`
  ]
  if (gender === 'man') {
    return [
      'What does he look like? Interesting answers only, and every pick masculine. Form your answer from these categories below:',
      ...colors,
      `hairStyle (pick 1 or more): ${MALE_HAIR_STYLES.join(', ')}`,
      `hairBangs (pick 0 or more): ${MALE_HAIR_BANGS.join(', ')}`,
      `headAccessories (pick 0 or more, and specify the color or material): ${MALE_HEAD_ACCESSORIES.join(', ')}`,
      `physique (pick 1-3): ${MALE_PHYSIQUE_TAGS.join(', ')}`,
      `facialHair (pick 0-1): ${FACIAL_HAIR_TAGS.join(', ')}`,
      `face (pick 0-2): ${MALE_FACE_TAGS.join(', ')}`,
      `skin (pick 1, omit for fair skin): ${MALE_SKIN_TAGS.join(', ')}`
    ]
  }
  return [
    'What does she look like? Interesting answers only. Form your answer from these categories below:',
    ...colors,
    `hairStyle (pick 1 or more): ${HAIR_STYLES.join(', ')}`,
    `hairBangs (pick 1 or more): ${HAIR_BANGS.join(', ')}`,
    `headAccessories (pick 1 or more, and specify the color or material): ${HEAD_ACCESSORIES.join(', ')}`,
    `makeup (pick 0-2, specify color for eyeshadow): ${MAKEUP_TAGS.join(', ')}`,
    `breastSize (pick 1, omit for medium size): ${BREAST_SIZES.join(', ')}`,
    `skin (pick 1, omit for fair skin): ${SKIN_TAGS.join(', ')}`
  ]
}

/** The appearance object the schema asks for, a man's own fields in place of a woman's. */
function appearanceSchema(gender: Gender): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    hairColor: enumField(HAIR_COLORS),
    eyeColor: enumField(EYE_COLORS),
    // Arrays because the pick is 0–1 and the strict subset has no optional key.
    hairShade: enumArray(SHADES),
    eyeShade: enumArray(SHADES),
    hairLength: enumField(HAIR_LENGTHS),
    hairTexture: enumField(HAIR_TEXTURES),
    ...(gender === 'man'
      ? {
          hairStyle: enumArray(MALE_HAIR_STYLES),
          hairBangs: enumArray(MALE_HAIR_BANGS),
          // Free-form so a pick can carry the colour or material the prompt asks for.
          headAccessories: stringArray(),
          physique: enumArray(MALE_PHYSIQUE_TAGS),
          facialHair: enumArray(FACIAL_HAIR_TAGS),
          face: enumArray(MALE_FACE_TAGS),
          skin: enumArray(MALE_SKIN_TAGS)
        }
      : {
          hairStyle: enumArray(HAIR_STYLES),
          hairBangs: enumArray(HAIR_BANGS),
          // Free-form so a pick can carry the colour or material the prompt asks for.
          headAccessories: stringArray(),
          makeup: stringArray(),
          breastSize: enumArray(BREAST_SIZES),
          skin: enumArray(SKIN_TAGS)
        })
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  }
}

/**
 * Builds the character-generation request. `poses` is the available set — those that can
 * actually render.
 */
export function buildCharacterPrompt(
  firstName: string,
  lastName: string,
  userPrompt: string,
  identity: CharacterIdentity,
  poses: PoseManifest,
  seedWord: string,
  namesAreSuggestions = false,
  reference?: ReferenceImage
): StructuredRequest {
  const brief = userPrompt.trim() || (identity.gender === 'man' ? 'A college guy.' : 'A college girl.')
  // Sorted, so the prefix stays identical for prompt caching; a man is offered his poses alone.
  const poseKeys = poseKeysFor(poses, identity.gender)
  const man = identity.gender === 'man'
  // A half-given name gets its partner matched by culture.
  const first = firstName.trim()
  const last = lastName.trim()
  const nameInstruction =
    first && last
      ? namesAreSuggestions
        ? // Both halves came from the Generate modal's suggestion pools.
          `We've got a working name for the character: "${first} ${last}". Use it as inspiration, but tweak it to fit the character better.`
        : `We've already got a name for the character: "${first} ${last}". Don't change it.`
      : first
        ? `The reader says "${first}" has to be the first name, so pick a fitting last name that's vaguely from the same culture and would still be common in the USA.`
        : last
          ? `The reader says "${last}" has to be the last name, so pick a fitting first name that's vaguely from the same culture and would still be common in the USA.`
          : 'Invent a fitting first and last name.'

  // Invariant tag lists lead so prompt caching can reuse the bulky prefix; it is written in the
  // character's own pronouns, so each gender and attraction caches its own.
  const p = pronounsOf(identity.gender)
  const preamble = [
    `Alright, RITA! Let's create a complex ${man ? 'male' : 'female'} character design. Consider the following:`,
    '',
    'PERSONALITY',
    'Concoct an interesting mix of answers to the below questions, then weave them into a single colorful paragraph:',
    `- What is ${p.possessive} archetype? Begin with <Name> is a gamer/med student/serial flirt/immortal demigod, etc.`,
    `- How does ${p.subject} choose to present ${p.reflexive} to others?`,
    `- Who is ${p.subject} really, when ${p.possessive} guard drops?`,
    `- What does ${p.subject} actually need/desire from other people, even if ${p.subject} doesn't know it?`,
    `- What flaw of ${p.possessiveAlone} pushes others away and keeps ${p.object} from getting what ${p.subject} wants?`,
    `- Optional: Verbal tics, habits, or other quirks that make ${p.object} unique.`,
    '',
    'BEHAVIOR',
    `How does ${p.subject} treat other people? Check out the five categories below and describe ${p.possessive} behavior.`,
    `Write them in the third person, use ${p.possessive} name, and name the stage inside the sentence, like: "Around friends, ${man ? 'Sam' : 'Sarah'} drops the polite voice and gets loud, and ${p.subject}..."`,
    'Remember! Real people are inconsistent and contradictory. Make sure you figure out something different for all five categories.',
    '- withStrangers: strangers and passing acquaintances.',
    `- withFriends: people ${p.subject} trusts.`,
    `- withCrush: someone ${p.subject} has unspoken romantic feelings for.`,
    `- withLover: someone ${p.subject} is actually with.`,
    `- withEnemy: someone ${p.subject} dislikes.`,
    '',
    'BACKSTORY',
    `What's something in ${p.possessive} past that still affects the way ${p.subject} acts?`,
    `It can be positive or negative, like inspiring ${p.object} to become a firefighter or making ${p.object} afraid of loud places.`,
    `Try and tell us something that isn't already in ${p.possessive} personality description.`,
    '',
    'LOVE LIFE',
    'Four separate answers here, and keep them from bleeding into each other:',
    `- datingHistory: Who has ${p.subject} been with, and how did it go? Exes, flings, crushes that went nowhere, or nobody at all.`,
    `- datingPreference: Is ${p.subject} after something casual or something long term? Say plainly whether ${p.subject} sleeps with people casually.`,
    `- kinks: What does ${p.subject} fantasize about? Name a specific kink or fetish of ${p.possessiveAlone}, giving or receiving.`,
    `- isVirgin: true if ${p.subject} has never had sex, false if ${p.subject} has.`,
    `Keep each one to a sentence or two, and make the four of them add up to a person: ${p.possessive} history shapes what ${p.subject} wants, and what ${p.subject} wants is often not what ${p.subject} does.`,
    '',
    'LIKES AND DISLIKES',
    'Give us a handful of likes and a handful of dislikes. Concrete things, and don\'t be too specific: "pizza" over "cold pizza for breakfast".',
    `Fill them with ${p.possessive} tastes in food, drink, media and entertainment, plus any pet peeves. No need to cover every category.`,
    '',
    'GIFT PREFERENCES',
    `What kinds of gifts does ${p.subject} like, and what kinds wouldn't impress ${p.object}?`,
    'Pick from the categories below:',
    ...GIFT_CATEGORIES.map((cat) => `- ${cat}: ${GIFT_CATEGORY_DESCRIPTIONS[cat]}.`),
    `Simply don't mention any categories that ${p.subject}'s neutral on.`,
    '',
    'TRAITS',
    'Below is a short list of traits. Fill the traits array with every one that genuinely fits the character you just wrote:',
    ...CHARACTER_TRAITS.map((trait) => `- ${trait}: ${TRAIT_DESCRIPTIONS[trait]}.`),
    `Only pick a trait if it's really true of ${p.object}. If none of them fit, return an empty array. Most characters get none.`,
    '',
    'ATTRACTION',
    `What kind of ${kindOf(identity.attractedTo, true)} does ${p.subject} like? Pick one:`,
    ...STAT_KEYS.map((key) => `- ${key}: ${p.subject} goes for ${STAT_ATTRACTIONS[key]}.`),
    '',
    'VOICE',
    `How high is ${p.possessive} vocal pitch? Pick one of: ${VOICE_TIERS.join(', ')}.`,
    '',
    'APPEARANCE',
    ...appearanceLines(identity.gender),
    '',
    'OUTFIT',
    `What outfit does ${p.subject} rock? Time to go shopping, RITA! Pick out a wardrobe and describe it in booru-style comma separated tags.`,
    'Be specific! Every clothing item must ALSO name at least one colour or material inside the tag.',
    `Lock in the exact characteristics of the outfit by naming what skin is exposed using these tags: ${(man ? MALE_OUTFIT_SKIN_EXPOSURE : OUTFIT_SKIN_EXPOSURE).join(', ')}`,
    man
      ? 'bare_legs is only for fully bare legs.'
      : 'bare_legs is only for fully bare legs, use "thighs" if you want to describe the bit of skin showing above thighhighs or socks.',
    'Pick as many items as you want, just keep in mind: Fashionable characters ONLY!',
    `Just because ${p.subject}'s shy or silly doesn't mean ${p.subject}'s allowed to be frumpy. Everyone has to SLAY with a cute, hot, or sexy fit`,
    'Try layering, accessorizing, or skin exposure. You can even combine all three if it makes sense.',
    'Take inspiration from modern Asian fashion and anime character design.',
    `Oh, and this is ${p.possessive} casual, everyday outfit: NOT a costume. ${p.Subject} can wear ${man ? 'a sharp suit' : 'a fancy dress'} if that's who ${p.subject} is, but no tutus for ballet dancers or scrubs for med students. ${p.Possessive} interests and activities do not dress ${p.object}.`,
    `And do NOT make ${p.object} carry anything: no handbags, backpacks, totes, umbrellas, phones. ${p.Possessive} hands are empty.`,
    `Nothing on ${p.possessive} head or ears, either: no hats or cat ears. Accessories like earrings go in headAccessories above.`,
    ...(man ? ['Menswear only: no skirts, dresses, heels, crop tops or thighhighs.'] : []),
    '',
    'PE OUTFIT',
    `Pick out something for ${p.object} that ${p.subject}'ll change into for gym class or workouts. Make sure to include skin exposure tags.`,
    '',
    'SWIMSUIT',
    'And something for the pool or the beach. You\'ll probably use most of the skin exposure tags here.',
    '',
    'ROOM',
    `And just for fun, what does ${p.possessive} room look like? We'll feed an image model a prompt that starts exactly like this:`,
    `"${ROOM_PROMPT_PREFIX}..."`,
    'Write ONLY the continuation of that sentence as roomPrompt. Include furnishings, the color palette, the general mood and lighting.',
    '',
    'POSE',
    `How does ${p.subject} usually stand? That tells us a lot about ${p.object}.`,
    `Read the options below carefully, then pick the one that suits ${p.object} best.`,
    ...poseKeys.map((key) => {
      const description = poses[key]?.description
      return description ? `- ${key}: ${description}` : `- ${key}`
    }),
    '',
    'EXPRESSIONS',
    `Pick out a list of tags for each of these emotions: ${EMOTIONS.join(', ')}. Try and make each emotion different!`,
    'Take at most one tag from each group below, and zero to two from "other":',
    `general: ${EXPRESSION_GENERAL.join(', ')}`,
    `eyebrows: ${EXPRESSION_EYEBROWS.join(', ')}`,
    `mouth: ${EXPRESSION_MOUTH.join(', ')}`,
    `eyes: ${EXPRESSION_EYES.join(', ')}`,
    `other: ${EXPRESSION_OTHER.join(', ')}`,
    'Skip any group that has nothing fitting. Not every emotion needs a general tag.',
    'Some tags carry a weight, like (sad:0.7). That number is a LOWER BOUND, not a fixed value.',
    `For expressive ${man ? 'guys' : 'gals'}, you can raise the weight up anywhere to a max of 0.9 and return the tag with your number in it, like (sad:0.9).`,
    '',
    '---',
    ''
  ].join('\n')

  // Below the '---' divider: this changes every call, the prefix above must not, and the
  // console log starts here.
  const rest = [
    `Okay, let's do this. Here is your brief, RITA: ${brief}`,
    '',
    nameInstruction,
    ...identityBlock(identity),
    '',
    ...seedWordBlock(seedWord),
    // Last, so it sits directly above the image part the adapter appends.
    ...referenceBlock(p, reference)
  ].join('\n')

  const schema = objectSchema(
    'character',
    [
      'firstName',
      'lastName',
      'personality',
      'behavior',
      'backstory',
      'datingHistory',
      'datingPreference',
      'kinks',
      'isVirgin',
      'likes',
      'dislikes',
      'giftPreferences',
      'traits',
      'preferredStat',
      'appearance',
      'outfit',
      'peOutfit',
      'swimOutfit',
      'pose',
      'expressions',
      'roomPrompt',
      'voice'
    ],
    {
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      personality: { type: 'string' },
      behavior: {
        type: 'object',
        additionalProperties: false,
        required: [...BEHAVIOR_KEYS],
        properties: Object.fromEntries(BEHAVIOR_KEYS.map((key) => [key, { type: 'string' }]))
      },
      backstory: { type: 'string' },
      datingHistory: { type: 'string' },
      datingPreference: { type: 'string' },
      kinks: { type: 'string' },
      // The only love-life field code reads.
      isVirgin: { type: 'boolean' },
      // `minItems` is outside the strict structured-output subset, so counts live in the prose.
      likes: stringArray(),
      dislikes: stringArray(),
      // Both keys required (the strict subset has no optional key); an empty `liked` is the one `missingRequiredFields` refuses.
      giftPreferences: {
        type: 'object',
        additionalProperties: false,
        required: ['liked', 'disliked'],
        properties: {
          liked: enumArray(GIFT_CATEGORIES),
          disliked: enumArray(GIFT_CATEGORIES)
        }
      },
      // Closed: a trait is a switch code branches on. Empty is the usual answer.
      traits: enumArray(CHARACTER_TRAITS),
      // Closed and single-valued: she is drawn to exactly one.
      preferredStat: enumField(STAT_KEYS),
      appearance: appearanceSchema(identity.gender),
      // Free-form: the wardrobe is open.
      outfit: stringArray(),
      peOutfit: stringArray(),
      swimOutfit: stringArray(),
      pose: enumField(poseKeys),
      // Free-form so a tag can carry a raised weight.
      expressions: {
        type: 'object',
        additionalProperties: false,
        required: [...EMOTIONS],
        properties: Object.fromEntries(EMOTIONS.map((emotion) => [emotion, stringArray()]))
      },
      roomPrompt: { type: 'string' },
      // Closed and single-valued: three words, and the slider takes it from there.
      voice: enumField(VOICE_TIERS)
    }
  )

  // The prefix above is identical across every character generation, so they share a cacheKey.
  return {
    system: SYSTEM,
    user: `${preamble}\n${rest}`,
    schema,
    cacheKey: 'venus-university-character-generation',
    ...(reference ? { images: [reference] } : {}),
    logFrom: preamble.length + 1
  }
}

/** A colour tag from the draft's raw colour: optional shade in front, the feature's suffix behind (`dark` + `blue` → `dark_blue_hair`). */
function colorTag(
  color: string | undefined,
  shade: readonly string[] | undefined,
  suffix: string
): string {
  const base = normalizeTag(color)
  if (!base) return ''
  const pick = normalizeTag((shade ?? [])[0])
  return `${pick ? `${pick}_` : ''}${base}_${suffix}`
}

/** Suffixes a raw value into its tag: `very_short` + `hair` → `very_short_hair`. */
function suffixTag(value: string | undefined, suffix: string): string {
  const base = normalizeTag(value)
  return base ? `${base}_${suffix}` : ''
}

/** Trims a raw draft value and closes any spaces the model wrote up. */
function normalizeTag(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, '_')
}

/** Drops blanks and surrounding whitespace from a tag list. */
function cleanTags(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)
}

/**
 * Flattens a draft into `Character`. Tags pass through as written (Appendix A); only `pose`
 * is checked, since a pose with no skeleton file cannot render.
 */
export function draftToCharacter(
  base: Character,
  draft: CharacterDraft,
  poses: PoseManifest
): Character {
  // A man stands only in a pose marked for men, whatever the draft picked.
  const poseKeys = poseKeysFor(poses, base.gender)
  const a = draft.appearance ?? ({} as CharacterDraft['appearance'])
  const man = base.gender === 'man'

  // The app supplies the subject tags; the model is never asked for them.
  const baseAppearance = [
    ...subjectTagsOf(base.gender),
    ...cleanTags([
      colorTag(a.hairColor, a.hairShade, 'hair'),
      colorTag(a.eyeColor, a.eyeShade, 'eyes'),
      suffixTag(a.hairLength, 'hair'),
      suffixTag(a.hairTexture, 'hair'),
      ...(a.hairStyle ?? []),
      ...(a.hairBangs ?? []),
      ...(a.headAccessories ?? []),
      // Each gender keeps only its own categories, whatever the draft says.
      ...(man ? [] : (a.makeup ?? [])),
      ...(man ? (a.physique ?? []) : []),
      ...(man ? (a.face ?? []).slice(0, 2) : []),
      // One each: mutually exclusive descriptions.
      ...(man ? (a.facialHair ?? []).slice(0, 1) : []),
      ...(man ? [] : (a.breastSize ?? []))
        .slice(0, 1)
        .map((size) => suffixTag(size, 'breasts')),
      ...(a.skin ?? []).slice(0, 1)
    ])
  ]

  const expressionTags = {} as Record<Emotion, string[]>
  for (const emotion of EMOTIONS) {
    expressionTags[emotion] = cleanTags(draft.expressions?.[emotion])
  }

  const behavior = {} as CharacterBehavior
  for (const key of BEHAVIOR_KEYS) {
    behavior[key] = (draft.behavior?.[key] ?? '').trim()
  }

  const pose = poseKeys.includes(draft.pose) ? draft.pose : (poseKeys[0] ?? '')
  if (pose !== draft.pose) {
    console.warn(`[character] pose "${draft.pose}" is not available; falling back to "${pose}".`)
  }

  const tier = isVoiceTier(draft.voice) ? draft.voice : 'medium'
  if (tier !== draft.voice) {
    console.warn(`[character] voice "${draft.voice}" is not a tier; falling back to "${tier}".`)
  }
  const voicePitch = voicePitchOfTier(tier)

  const next: Character = {
    ...base,
    firstName: (draft.firstName || base.firstName).trim(),
    lastName: (draft.lastName || base.lastName).trim(),
    personality: (draft.personality ?? '').trim(),
    behavior,
    backstory: (draft.backstory ?? '').trim(),
    datingHistory: (draft.datingHistory ?? '').trim(),
    datingPreference: (draft.datingPreference ?? '').trim(),
    kinks: (draft.kinks ?? '').trim(),
    isVirgin: draft.isVirgin === true,
    likes: cleanTags(draft.likes),
    dislikes: cleanTags(draft.dislikes),
    giftPreferences: giftPreferencesOf(draft.giftPreferences),
    // Filtered to the vocabulary: an unrecognized trait switches nothing.
    traits: (draft.traits ?? []).filter(isCharacterTrait),
    // Charm on anything outside the vocabulary.
    preferredStat: isStatKey(draft.preferredStat) ? draft.preferredStat : 'heart',
    baseAppearance,
    // Derived from her build tags, which exist only now; the player retunes it in the Edit modal.
    height: defaultSpriteScale(baseAppearance),
    outfit: cleanTags(draft.outfit),
    peOutfit: cleanTags(draft.peOutfit),
    swimOutfit: cleanTags(draft.swimOutfit),
    pose,
    expressionTags,
    roomPrompt: (draft.roomPrompt ?? '').trim()
  }
  // The brief is what an unwritten record is resumed from; this one is written.
  delete next.brief
  delete next.voicePitch
  // Centre is what an absent field means everywhere, so a centred voice is written as nothing.
  if (voicePitch !== 0) next.voicePitch = voicePitch
  return next
}

/** The draft's category picks, filtered to the vocabulary and de-conflicted. */
function giftPreferencesOf(drafted: CharacterDraft['giftPreferences'] | undefined): GiftPreferences {
  const liked = uniqueCategories(drafted?.liked)
  return { liked, disliked: uniqueCategories(drafted?.disliked).filter((cat) => !liked.includes(cat)) }
}

function uniqueCategories(values: string[] | undefined): GiftCategory[] {
  return [...new Set((values ?? []).filter(isGiftCategory))]
}

/** The fields only a character who could fall for the reader is required to have. */
const ROMANTIC_BEHAVIOR: readonly (keyof CharacterBehavior)[] = ['withCrush', 'withLover']

/**
 * Fields the Generate modal treats as required before a character can render. A character not
 * drawn to the reader's gender may leave the romantic ones empty.
 */
export function missingRequiredFields(character: Character): string[] {
  const romantic = drawnToReader(character)
  const missing: string[] = []
  if (!character.firstName) missing.push('first name')
  if (!character.lastName) missing.push('last name')
  if (!character.personality) missing.push('personality')
  for (const key of BEHAVIOR_KEYS) {
    if (!romantic && ROMANTIC_BEHAVIOR.includes(key)) continue
    if (!character.behavior?.[key]) missing.push(key)
  }
  if (!character.backstory) missing.push('backstory')
  // The three prose fields only: a false `isVirgin` is an ordinary answer.
  if (!character.datingHistory) missing.push('dating history')
  if (!character.datingPreference) missing.push('dating preference')
  if (romantic && !character.kinks) missing.push('kinks')
  if (character.likes.length === 0) missing.push('likes')
  if (character.dislikes.length === 0) missing.push('dislikes')
  // Only the liked half: an empty `disliked` is an ordinary answer.
  if (character.giftPreferences.liked.length === 0) missing.push('gift preferences')
  if (!character.pose) missing.push('pose')
  if (character.baseAppearance.every((tag) => SUBJECT_TAGS.includes(tag))) {
    missing.push('appearance')
  }
  if (character.outfit.length === 0) missing.push('outfit')
  // Required even when unrendered, so the Edit modal can render a set later.
  if (character.peOutfit.length === 0) missing.push('PE outfit')
  if (character.swimOutfit.length === 0) missing.push('swimsuit')
  for (const emotion of EMOTIONS) {
    if (character.expressionTags[emotion].length === 0) missing.push(`${emotion} expression`)
  }
  return missing
}
