import { affectionFor, dedupedMemoriesFor, emptyFlags } from '@shared/relationship'
import { encountersOf, PHONE_ENCOUNTER_CAP } from '@shared/encounters'
import { factsKnownBy, PHONE_FACT_CAP } from '@shared/facts'
import { homeOf, type HomeId } from '@shared/homes'
import { ROOM_LOCATION } from '@shared/locations'
import type { NpcRelationshipMap } from '@shared/npcRelationships'
import type { NpcRomanceMap } from '@shared/npcRomance'
import { pronounsOf } from '@shared/pronouns'
import {
  isAdultPhoto,
  photoOutfitAt,
  photoPhrase,
  readMessagePhoto,
  type PhotoKind,
  type PhotoOffer
} from '@shared/photos'
import {
  type Character,
  type CharInfo,
  type ClassEntry,
  type ChatMessage,
  type Conversation,
  type Encounters,
  type Fact,
  type Gender,
  type Haunt,
  type JobState,
  type Occasion,
  type OutfitSet,
  type ExChoice,
  type StructuredRequest,
  type TimeSlot
} from '@shared/types'
import { DEFAULT_PLAYER_STATS, type PlayerStats } from '@shared/playerStats'
import type { Weather } from '@shared/weather'
import {
  formatChatDivider,
  formatDateBanner,
  formatRelativeSlot,
  formatSemesterProgress,
  seasonLine
} from './gameDate'
import {
  ambientLoreCharacters,
  characterLore,
  characterLoreForIds,
  keyPattern,
  lorebookBlock
} from './lorebook'
import { encounterLines } from './encounters'
import { factLines } from './facts'
import { groupFigurantLine, groupNewsClause, groupsInPlay } from './groupPrompt'
import type { GroupResult } from '@shared/groups'
import { occasionLoreLines } from './occasions'
import { objectSchema } from './schema'
import { memoryLines, profileLines, scheduleLines, yearMajorLine } from './scenePrompt'
import { springBreakLines } from './springBreak'
import {
  bestFriendLines,
  hauntClause,
  npcRomanceFactsOf,
  npcRomanceLines,
  npcRomanceSection,
  readerLoversOf,
  whereaboutsLine,
  type NpcCompanions
} from './npcRelationship'
import { relationshipLines } from './relationship'
import { weatherLines } from './weather'

/**
 * Builds the Bunnyboard texting request: RITA answering the reader's text as one
 * character, over the campus messaging app.
 */

/** How many recent messages ride in the prompt and in each rolling summary. */
const TEXTING_HISTORY_CAP = 20

/** RITA writing one side of a text thread. */
const TEXTING_PERSONA = [
  'You are RITA, author of steamy reader-POV romance fiction set at fictional universities.',
  'You\'ve got sexy nerd energy and have been on a hundred dates, and you use that experience to make your writing shockingly realistic.',
  'Right now you are writing one side of a text conversation on Bunnyboard, the campus messaging app: you answer AS the character, in their own texting voice.',
  'Some people send one long message, some fire off several short ones — match how THEY would text, keeping their personality and memories in mind.',
  'Texts are casual: typos, slang, emoji and lowercase are all fair game if they fit the character. No narration, no stage directions, just what they type.',
  'You make the characters play hard to get; everything is a slow burn.',
  'Oh, by the way: you really, really HATE repetitive, robotic slop-writing.',
  'You NEVER use semicolons or emdashes or other dumb AI writing habits.',
  'And finally, you\'re totally anal retentive: You always return a single, fully-formed JSON object matching the provided schema exactly.'
].join('\n')

/** The prompt-facing slice of state a texting turn needs. */
export interface TextingPromptState {
  date: number
  time: TimeSlot
  /** The reader's accumulated stats, used for relationship requirement guidance. */
  stats?: PlayerStats
  /** The girl he starts with as an ex, where New Game picked one. */
  ex?: ExChoice | null
  /**
   * Every roster character except the one being texted — the lorebook's people,
   * excluded at the source so no entry can restate the `CHARACTER` block.
   */
  roster: readonly Character[]
  /** Per-character save state, keyed by charId — read for the roster's entries. */
  charInfo: Record<string, CharInfo>
  /** Where the save says somebody lives now, by `'player'` or charId. */
  homeMoves: Record<string, HomeId>
  /**
   * What the roster thinks of each other: read for the friend her `CHARACTER` block
   * names and for the standing every lorebook character entry closes with.
   */
  npcRelationships: NpcRelationshipMap
  /** The roster's romances with each other; absent reads as none. */
  npcRomance?: NpcRomanceMap
  /** Who was in each finished scene and where; absent reads as none. */
  encounters?: Encounters
  /** The facts the reader's scenes filed, oldest first; absent reads as none. */
  facts?: readonly Fact[]
  /** The save's class roster, keyed by class code — names the schedules. */
  classes: Record<string, ClassEntry>
  /** The reader's own timetable, sparse slot → class code. */
  playerSchedule: Record<number, string>
  /** The part-time job the reader holds, or null — the rest of his week. */
  playerJob: JobState | null
  /** The save's generated occasions; the fixed calendar is merged in on read. */
  occasions: readonly Occasion[]
  /** How each group event ended, by occasion id; absent reads as none. */
  groupResults?: Readonly<Record<string, GroupResult>>
  /**
   * The whole semester's sky, one reading per slot — the NOW line walks back through it for how
   * long the weather has held. Absent means nothing is said about it.
   */
  weather?: readonly Weather[]
  /**
   * Where the girl being texted is standing right now: a location id, `'room'`, or null
   * for a slot her hidden schedule says nothing about.
   */
  charLocation?: string | null
  /**
   * Who is with her there — read only where {@link charLocation} is set,
   * and named only where the reader has heard the name.
   */
  charCompanions?: NpcCompanions
  /** Her standing haunt when {@link charLocation} is it — what she is doing there. */
  charHaunt?: Haunt | null
  /**
   * Who leaves campus for spring break, or null before the pick has run. A thread stays
   * open through an absence, so this is what says she is texting from somewhere else.
   */
  springBreakAway?: readonly string[] | null
  /**
   * The photos her reply may carry, worked out by the game for this call; absent or empty, the
   * prompt says nothing of photos and the schema has no field for one.
   */
  photoOffer?: PhotoOffer | null
  /** What stands in place of her usual clothes in a photo of her now, so it shows the same. */
  photoWorn?: OutfitSet | null
}

/** A text's line breaks folded to spaces, so a message stays one prompt line. */
function flatText(text: string): string {
  return text.replace(/\s*\n+\s*/g, ' ')
}

/**
 * `"YOU: hey"` / `"MINA: hey yourself"` / `"SYSTEM: ..."` — one history stub, and under one of
 * hers that carried a photo, the game's line saying what she sent: written off what the photo
 * is, never off its tags, and said whether or not the setting shows it.
 */
function messageStubs(message: ChatMessage, firstName: string): string[] {
  if (message.sender === 'player') return [`YOU: ${flatText(message.text)}`]
  if (message.sender === 'system') return [`SYSTEM: ${flatText(message.text)}`]
  const name = firstName.toUpperCase()
  const photo = message.photo === undefined ? null : readMessagePhoto(message.photo)
  return [
    `${name}: ${flatText(message.text)}`,
    ...(photo ? [`[${name} SENT A PHOTO: ${photoPhrase(photo)}]`] : [])
  ]
}

/**
 * A window of messages rendered for injection, newest last; system lines ride along as
 * context the character plausibly has.
 */
export function stampedStubs(window: readonly ChatMessage[], firstName: string): string[] {
  const lines: string[] = []
  let stamped: string | null = null
  for (const message of window) {
    const stamp = formatChatDivider(message.date, message.time)
    if (stamp !== stamped) {
      lines.push(`[${stamp}]`)
      stamped = stamp
    }
    lines.push(...messageStubs(message, firstName))
  }
  return lines
}

/**
 * Whether the reader and she have actually texted — a summary, or a player/contact message.
 * A thread holding only the app's own friend-request/block system lines doesn't count.
 */
export function hasTexted(conversation: Conversation | undefined): boolean {
  if (!conversation) return false
  if (conversation.summary !== null) return true
  return conversation.messages.some(
    (message) => message.sender === 'player' || message.sender === 'contact'
  )
}

/**
 * Her hangout ask when it ends the thread, with his "Sure" when that answered it. A reminder
 * about a plan already made is not flagged as an invite but stands behind `pendingHangout`
 * just the same.
 */
function hangoutTail(
  conversation: Conversation
): { ask: ChatMessage; answer?: ChatMessage } | null {
  const { messages } = conversation
  const last = messages[messages.length - 1]
  if (!last) return null
  if (last.sender === 'contact') {
    return last.invite || conversation.pendingHangout ? { ask: last } : null
  }
  const before = messages[messages.length - 2]
  if (last.sender === 'player' && last.text === 'Sure' && before?.sender === 'contact') {
    return { ask: before, answer: last }
  }
  return null
}

/** The scene prompts' TEXTING HISTORY lines for one character, or none at all. */
export function composeTextingSummary(
  conversation: Conversation | undefined,
  ignoredInvitation: boolean,
  firstName: string,
  gender: Gender,
  now: Pick<TextingPromptState, 'date' | 'time'>,
  blocked = false
): string[] {
  // Being blocked outlives the thread, so it is stated even with nothing else to say.
  const blockedLines = blocked
    ? [`${firstName} has the reader blocked on Bunnyboard, so he cannot text ${pronounsOf(gender).object}.`]
    : []
  if (!conversation) {
    return blockedLines.length > 0
      ? [`${firstName}'s TEXTING HISTORY with the reader:`, ...blockedLines]
      : []
  }
  const lines: string[] = []
  if (conversation.summary) lines.push(conversation.summary)

  const last = conversation.messages[conversation.messages.length - 1]
  // An untexted thread holds only the friend-request system line; say when that add happened.
  if (!hasTexted(conversation) && conversation.messages.length > 0) {
    const first = conversation.messages[0]
    lines.push(
      `The reader and ${firstName} added each other on Bunnyboard ${formatRelativeSlot(first.date, first.time, now.date, now.time)}, but haven't texted yet.`
    )
  } else if (last) {
    const when = formatRelativeSlot(last.date, last.time, now.date, now.time)
    const tail = hangoutTail(conversation)
    // Her ask and his Sure never pass through a texting call, so no summary holds them:
    // the scene is shown the texts themselves.
    if (tail?.answer) {
      lines.push(
        `The last texts in the thread were sent ${when}. ${firstName}: "${flatText(tail.ask.text)}" The reader: "${flatText(tail.answer.text)}"`
      )
    } else if (tail) {
      lines.push(`The last text in the thread was sent ${when}: "${flatText(tail.ask.text)}"`)
    } else {
      // Without this the scene reads every thread as if it had just been sent.
      lines.push(`The last text in the thread was sent ${when}.`)
    }
  }
  if (last?.error) lines.push(`${firstName}'s last message failed to send to the player.`)
  // "Ignored", never "left on read": the app only knows he spent the slot elsewhere.
  if (ignoredInvitation) lines.push(`The reader ignored ${firstName}'s invitation.`)
  lines.push(...blockedLines)

  if (lines.length === 0) return []
  return [`${firstName}'s TEXTING HISTORY with the reader:`, ...lines]
}

/**
 * The `NOW` line saying where she is texting from, or nothing on a slot her hidden
 * schedule is silent about.
 */
function whereSheIs(
  character: Character,
  location: string | null | undefined,
  companions?: NpcCompanions,
  haunt?: Haunt | null,
  time: TimeSlot = 0
): string[] {
  if (!location) return []
  return [
    whereaboutsLine(character, location, companions ?? { knownNames: [], unknown: 0 }, haunt, time)
  ]
}

/** What her calendar says about meeting up this instant. */
function meetUpLines(
  name: string,
  gender: Gender,
  location: string | null | undefined,
  haunt: Haunt | null | undefined,
  time: TimeSlot,
  away: boolean
): string[] {
  // Dropped while she is off campus: the line claims she can meet, and her block says she can't.
  if (away) return []
  if (!location || location === ROOM_LOCATION) {
    return [
      `${name}'s schedule is clear, so if the reader asks to meet up right now assume ${name} is free to... though not necessarily willing.`
    ]
  }
  return [
    `${name}'s schedule is clear, so if the reader asks to meet up right now assume ${name} is free to — ${pronounsOf(gender).subject} is already ${hauntClause(location, haunt, time, gender)} and would sooner have him come to ${pronounsOf(gender).object} than go somewhere else — though not necessarily willing.`
  ]
}

/** The word the photo field answers with for no photo. */
const NO_PHOTO = 'none'

/**
 * The PHOTOS block: each kind the game offers on this reply, with what it would show, and the
 * one field she answers with. Nothing where nothing is offered.
 */
function photoLines(
  name: string,
  offer: PhotoOffer | null | undefined,
  night: boolean,
  worn: OutfitSet | null
): string[] {
  if (!offer || offer.kinds.length === 0) return []
  const outfit = photoOutfitAt(offer.place, worn)
  const kinds = offer.kinds.map(
    (kind) => `- "${kind}": ${photoPhrase({ kind, place: offer.place, outfit, night })}`
  )
  const adult = offer.kinds.some(isAdultPhoto)
  return [
    'PHOTOS',
    `${name} can send the reader one photo with this reply. The app takes and sends it; you only pick the kind, in the "photo" field.`,
    'The photos she could send right now, and what each would show:',
    ...kinds,
    PHOTO_WHEN,
    `If ${name} would rather not, or the moment does not call for one, set "photo" to "${NO_PHOTO}". Refusing is fine: ${name} decides by ${name}'s personality and how ${name} feels about the reader.`,
    ...(adult
      ? [`The sexy and nude photos are only for someone ${name} is that close to; ${name} can still tease, stall or say no.`]
      : []),
    `${name}'s texts may mention the photo ("here", "look"), but never describe it beyond what is listed above, and never claim ${name} sent one without setting the field.`,
    ''
  ]
}

/** When she picks a photo at all. */
const PHOTO_WHEN =
  'Pick a kind only when the reader has asked for a photo in his newest message or the ones just before it; otherwise always set "photo" to "none".'

/** Builds the texting turn request. `newMessage` is the reader's fresh text. */
export function buildTextingPrompt(
  character: Character,
  info: CharInfo | undefined,
  conversation: Conversation | undefined,
  newMessage: string,
  state: TextingPromptState,
  reader: string
): StructuredRequest {
  const name = character.firstName
  const p = pronounsOf(character.gender)
  const away = state.springBreakAway?.includes(character.charId) ?? false
  // The new text is the last line of the log, so it gets its own stamp when it lands in a new slot.
  const history = stampedStubs(
    [
      ...(conversation?.messages ?? []).slice(-TEXTING_HISTORY_CAP),
      {
        id: 'pending',
        sender: 'player',
        text: newMessage,
        date: state.date,
        time: state.time
      }
    ],
    name
  )
  const summary = conversation?.summary ?? null

  // The scan covers the whole thread the model reads, not just the new message.
  const scan = [summary ?? '', ...history].join('\n')
  // Today's occasions are always-on.
  const today = occasionLoreLines(state.date, state.time, state.occasions)

  // An entry's standings are measured against the one girl on the thread.
  const relations = { relationships: state.npcRelationships, present: [character] }
  // The ambient entries nothing in the thread named, minus any the scan already fires.
  const ambient = ambientLoreCharacters(state.roster, [character], state.npcRelationships).filter(
    (other) => !new RegExp(keyPattern(other.firstName, false), 'iu').test(scan)
  )
  const lore = lorebookBlock(scan, today, [
    ...characterLore(scan, state.roster, state.charInfo, state.homeMoves, state.date, relations),
    ...characterLoreForIds(ambient, state.charInfo, state.homeMoves, state.date, relations)
  ])

  // The roster's love lives, and what she alone knows of her own.
  const romance = npcRomanceSection(
    npcRomanceLines(
      npcRomanceFactsOf(
        state.npcRomance,
        [character.charId],
        readerLoversOf(state.charInfo),
        state.date
      ),
      Object.fromEntries([character, ...state.roster].map((c) => [c.charId, c])),
      state.date
    )
  )

  // Her team's coach and the rest of it are never given names.
  const figurant = groupFigurantLine(groupsInPlay([info?.groups]))

  const characterBlock = [
    'CHARACTER',
    `${name} ${character.lastName}.`,
    ...(info?.major ? [yearMajorLine(
          info,
          character.gender,
          homeOf(state, character.charId),
          groupNewsClause(info.groups, state)
        )] : []),
    // The phone takes the one-character budget.
    ...profileLines(character, info?.flags ?? emptyFlags(), 1, state.ex),
    ...relationshipLines(
      character,
      info?.flags ?? emptyFlags(),
      // Texting requires a completed contact, so her name is known by then.
      info?.nameKnown ?? true,
      affectionFor(info, state.date, character),
      state.stats ?? DEFAULT_PLAYER_STATS,
      // The stored thread only: the pending text is not yet something they have said.
      { texting: true, texted: hasTexted(conversation) },
      // Where she is in her cycle, for a Promiscuous girl's DTF days.
      { date: state.date, offset: info?.moodCycleOffset ?? 0 }
    ),
    // Her closest friend; the roster handed in is everybody but her.
    ...bestFriendLines(character, state.roster, state.npcRelationships),
    ...scheduleLines(`${name}'s Schedule:`, info?.schedule ?? {}, state.classes, info?.job, state.date),
    // Where she is spending the break: on a thread, the only thing saying she has left campus.
    ...springBreakLines(
      character,
      info?.springBreakPlans,
      state.springBreakAway,
      character.charId,
      state.date
    ),
    ...memoryLines(character, dedupedMemoriesFor(info), info),
    // The scenes she was in; the roster handed in is everybody but her, which is who else was there.
    ...encounterLines(
      character,
      encountersOf(character.charId, state.encounters, PHONE_ENCOUNTER_CAP),
      Object.fromEntries(state.roster.map((other) => [other.charId, other])),
      state.charInfo
    ),
    // What she knows of the people around her; nobody else is on the phone with them.
    ...factLines(
      character,
      factsKnownBy(character.charId, state.facts, PHONE_FACT_CAP),
      [],
      Object.fromEntries([character, ...state.roster].map((other) => [other.charId, other])),
      state.charInfo
    ),
    ...(romance.length > 0 ? ['', ...romance] : []),
    ...(figurant ? ['', figurant] : [])
  ]

  const user = [
    'READER',
    reader,
    ...scheduleLines(
      "The reader's Schedule:",
      state.playerSchedule,
      state.classes,
      state.playerJob,
      state.date
    ),
    '',
    ...characterBlock,
    '',
    'NOW',
    `It is ${formatDateBanner(state.date, state.time)}`,
    formatSemesterProgress(state.date),
    seasonLine(state.date),
    // Texting happens before the slot's scene; without this she treats the day as over.
    state.time === 0 ? 'Morning classes are starting soon.' : 'Night classes are starting soon.',
    ...(state.weather ? weatherLines(state.weather, state.date, state.time) : []),
    ...whereSheIs(character, state.charLocation, state.charCompanions, state.charHaunt, state.time),
    '',
    ...lore,
    ...(summary ? ['TEXTING SO FAR', '"' + summary + '"', ''] : []),
    'RECENT MESSAGES',
    "'''",
    ...history,
    "'''",
    '',
    'YOUR TURN',
    `${name} is texting the reader back in a private DM.`,
    `Write ${name}'s reply to the reader's newest message, the last line of RECENT MESSAGES, as the "messages" array: each entry is one text bubble ${p.subject} sends.`,
    `Stay in ${p.possessive} voice and keep it text-length: this is a phone thread, not prose.`,
    ...meetUpLines(name, character.gender, state.charLocation, state.charHaunt, state.time, away),
    '',
    ...photoLines(
      name,
      state.photoOffer,
      state.time === 1,
      state.photoWorn ?? null
    ),
    'BLOCKING',
    `Set "blocked" to true only if these texts have pushed ${name} to cut the reader off completely. ${p.Subject} is done, and blocks him on Bunnyboard as ${p.possessive} last text lands.`,
    `${p.Possessive} final messages should read like somebody who is about to do that.`,
    'Being annoyed, hurt, bored or angry is not enough on its own: people stay in threads they are angry in. Reserve it for wanting him gone.',
    'Otherwise set it to false.',
    '',
    'SUMMARY',
    summary
      ? 'Then, for the "summary" field, fold the TEXTING SO FAR and the RECENT MESSAGES (plus your reply) into one merged recap.'
      : 'Then, for the "summary" field, condense the RECENT MESSAGES (plus your reply) into a single recap.',
    `Write it in third person, refer to the MC as "the reader", and keep anything ${name} should still remember later. Don't include concrete dates, and leave out old or unimportant information.`,
    ...(state.photoOffer && state.photoOffer.kinds.length > 0
      ? [`If ${name} sent a photo in this reply, the recap may say so and of which kind, nothing more.`]
      : [])
  ].join('\n')

  return {
    system: TEXTING_PERSONA,
    user,
    schema: textingSchema(state.photoOffer?.kinds ?? []),
    // Constant, like the ledger's: nothing above the seam varies by save.
    cacheKey: 'texting',
    kind: 'texting'
  }
}

/**
 * The `TextingResponse` schema: `messages` first so they stream ahead; the preview
 * reader stops at that array's `]`. The photo comes next where any is offered, so the
 * summary written after it knows whether she sent one.
 */
function textingSchema(photoKinds: readonly PhotoKind[]): {
  name: string
  schema: Record<string, unknown>
} {
  if (photoKinds.length === 0) {
    return objectSchema('texting', ['messages', 'summary', 'blocked'], {
      messages: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
      // Required: an optional boolean drifts into never being considered.
      blocked: { type: 'boolean' }
    })
  }
  return objectSchema('texting', ['messages', 'photo', 'summary', 'blocked'], {
    messages: { type: 'array', items: { type: 'string' } },
    // Required, with a word for no photo, for the same reason as `blocked`.
    photo: { type: 'string', enum: [NO_PHOTO, ...photoKinds] },
    summary: { type: 'string' },
    blocked: { type: 'boolean' }
  })
}
