import { pairKeyOf } from '@shared/npcRelationships'
import { charKeyOf, READER_SPEAKER, type Character, type Fact, type SceneLine } from '@shared/types'
import { buildFactsPrompt } from '../prompts/factsPrompt'
import {
  buildLedgerPrompt,
  type ClassSceneContext,
  type LedgerBreakthrough,
  type PromptState
} from '../prompts/scenePrompt'
import { useGameStore } from './gameStore'
import { promptState, reader, scheduleInput } from './loop/promptState'
import { PORTRAIT_SLOTS } from './stageStep'
import type { DebugResult } from './npcRomanceDebugActions'

/**
 * The development build's worst-case measurement of the two requests a scene's ending sends for
 * its summary, the ledger's and the facts', as they stand in a game with its whole roster: every
 * name in the schema's enums, a full cast, a lecture, romance between the people present, a
 * Breakthrough and the facts the game holds. Each is sent once, by the route the loop sends it,
 * and the reply is thrown away: nothing here is written to the game.
 */

/** Its own group, so the loop's cancelling of its calls never reaches these. */
const WORST_CASE_GROUP = 'debug:worst-case'

/** Turns of the made-up scene the requests are built over. */
const SCENE_TURNS = 8

/** The facts made up for the cast, one phrase for each person standing in it. */
const MADE_UP_FACTS = [
  'has an older sister, Joy, who is a nurse in Boston',
  'plans to move to Spain after graduation',
  'is afraid of dogs and has never told anybody'
]

let running = false

/** The scene so far: the cast taking turns after the reader's lines. */
function sceneOf(cast: readonly Character[]): SceneLine[] {
  const lines: SceneLine[] = [{ speaker: '', text: 'You find them already talking.' }]
  for (let turn = 1; turn <= SCENE_TURNS; turn++) {
    lines.push({ speaker: READER_SPEAKER, text: `"So what are you up to?" I ask. (turn ${turn})` })
    for (const character of cast) {
      lines.push({
        speaker: charKeyOf(character.firstName, character.lastName),
        text: `${character.firstName} shrugs and says something about the week so far.`
      })
    }
  }
  return lines
}

/** What a request's reply came to: accepted, or the error's code. */
function outcomeOf(result: { ok: true } | { ok: false; error: { code: string } }): string {
  return result.ok ? 'accepted' : result.error.code
}

/**
 * Builds the two requests over a made-up scene and the game as loaded, sends each once and
 * reports how each came out. Refuses where a reply is still out, since the tokens tally it hands
 * back could not tell whose tokens were whose.
 */
export async function sendWorstCaseRequests(): Promise<DebugResult> {
  if (!import.meta.env.DEV) return { ok: false, text: 'Only in the development build.' }
  const game = useGameStore.getState()
  if (running || game.busy || game.streaming || game.endingInFlight) {
    return { ok: false, text: 'A reply is still out: try again once it has landed.' }
  }
  const cast = game.chars
    .slice(0, PORTRAIT_SLOTS)
    .flatMap((charId) => (game.characters[charId] ? [game.characters[charId]] : []))
  if (cast.length === 0) return { ok: false, text: 'There is no game with a roster loaded.' }

  // Every change below is to a copy: the builders take their state as an argument.
  const base: PromptState = promptState()
  const charInfo = { ...base.charInfo }
  for (const character of cast) {
    charInfo[character.charId] = { ...charInfo[character.charId], nameKnown: true }
  }
  const [first, second, third] = cast
  const romance = base.npcRomance ?? {
    crushes: {},
    couples: {},
    exes: {},
    rejections: {}
  }
  const withRomance = {
    ...romance,
    crushes:
      second && !romance.crushes[first.charId]
        ? { ...romance.crushes, [first.charId]: { to: second.charId, since: game.date - 10 } }
        : romance.crushes,
    couples:
      third && second
        ? { ...romance.couples, [pairKeyOf(second.charId, third.charId)]: { since: game.date - 20 } }
        : romance.couples
  }
  const classCode = Object.values(game.playerSchedule)[0] ?? Object.keys(game.classes)[0]
  const lecture: ClassSceneContext = {
    index: 5,
    kind: 'lecture',
    isMidterm: false,
    isFinals: false,
    isHandback: false,
    recap: []
  }
  const state: PromptState = {
    ...base,
    charInfo,
    npcRomance: withRomance,
    ...(classCode ? { classCode, classMeeting: lecture } : {})
  }

  const facts: Fact[] = [
    ...game.facts,
    ...cast.flatMap((character, i) =>
      MADE_UP_FACTS.map((text, n): Fact => ({
        id: `wc${i}n${n}`,
        about: character.charId,
        category: n === 1 ? 'plans_promises' : n === 2 ? 'secrets' : 'family',
        text,
        kind: n === 1 ? 'said' : 'happened',
        knownBy: [character.charId],
        date: game.date,
        time: game.time
      }))
    )
  ]
  const breakthroughs: LedgerBreakthrough[] = [
    { character: first, direction: 'to be honest with me about her week', quote: 'So what are you up to?' }
  ]
  const scene = sceneOf(cast)
  const who = reader()
  const ledger = buildLedgerPrompt(
    cast,
    scene,
    state,
    who,
    scheduleInput(game.date, game.time),
    breakthroughs
  )
  const factsRequest = buildFactsPrompt(cast, scene, state, who, facts)

  // The transport credits every cloud reply to the game's own tally, so the tally is put back to
  // what it stood at once both replies are in.
  running = true
  const tokensBefore = game.tallies.tokensGenerated
  try {
    const [ledgerResult, factsResult] = await Promise.all([
      window.api.llm.completeLedger(ledger, WORST_CASE_GROUP),
      window.api.llm.completeFacts(factsRequest, WORST_CASE_GROUP)
    ])
    // One turn of the event loop more, for a credit the replies' own events hold back.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const size = (request: { system: string; user: string }): string =>
      `${(request.system.length + request.user.length).toLocaleString('en-US')} characters`
    const text =
      `Ledger (${size(ledger)}): ${outcomeOf(ledgerResult)} · ` +
      `Facts (${size(factsRequest)}): ${outcomeOf(factsResult)}.`
    return { ok: ledgerResult.ok && factsResult.ok, text }
  } finally {
    const live = useGameStore.getState()
    useGameStore.setState({ tallies: { ...live.tallies, tokensGenerated: tokensBefore } })
    running = false
  }
}
