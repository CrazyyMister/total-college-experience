import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { it } from 'vitest'
import { readCharacterRecord } from '@shared/characterRules'
import { dealGroups, GROUPS } from '@shared/groups'
import {
  areNpcFriends,
  pairKeyOf,
  rollInitialNpcRelationships,
  settleNpcPairs
} from '@shared/npcRelationships'
import {
  emptyNpcRomance,
  settleNpcRomance,
  type NpcRomanceMap,
  type NpcRomanceTally
} from '@shared/npcRomance'
import type {
  Character,
  Gender,
  GameSave,
  PlaythroughRecord,
  ShiftSlot,
  TimeSlot
} from '@shared/types'
import { useGameStore } from '../../src/renderer/stores/gameStore'
import {
  applyNpcOverlay,
  rollNpcOverlayNow,
  rollSlotEncounterGroups
} from '../../src/renderer/stores/loop/npc'
import { weekdayOf } from '../../src/renderer/prompts/gameDate'
import { GRADUATION_DATE } from '../../src/renderer/prompts/occasions'

/**
 * Plays the roster's off-screen semester with no writer and no reader: every slot's overlay,
 * lectures and run-ins through the game's own rolls, the affinity settle, then the romance
 * settle, from day 0 to graduation. Runs on the test playthrough's roster, schedules and
 * occasions, once as its cast is and once per scenario that turns some of them into men.
 */

const RUNS = 30

const ROOT = resolve(__dirname, '../..')
const FOLDER = resolve(ROOT, 'testsave/1790392968199')

/** Who becomes what, by roster position; everybody unlisted stays a woman attracted to men. */
interface Scenario {
  name: string
  identities: { gender: Gender; attractedTo: Gender }[]
  /** Women of the shipped cast added to the roster, in memory only. */
  extra?: number
  /** A swim team of this many women is formed, as New Game would, before the semester. */
  team?: number
}

const man = (attractedTo: Gender) => ({ gender: 'man' as const, attractedTo })

const FOUR_MEN = [
  man('woman'),
  man('woman'),
  man('woman'),
  man('man'),
  { gender: 'woman' as const, attractedTo: 'woman' as const }
]
const EIGHT_MEN = [
  man('woman'),
  man('woman'),
  man('woman'),
  man('woman'),
  man('woman'),
  man('woman'),
  man('man'),
  man('man')
]

/** The women of the shipped cast the sixteen scenarios add to the twelve, all attracted to men. */
const EXTRA_WOMEN = 4

const SCENARIOS: Scenario[] = [
  { name: 'Elenco como está (12 mulheres atraídas por homens)', identities: [] },
  {
    name: '4 homens (3 por mulheres, 1 por homens) + 1 mulher por mulheres',
    identities: FOUR_MEN
  },
  {
    name: 'O mesmo com 16: + 4 mulheres atraídas por homens',
    identities: FOUR_MEN,
    extra: EXTRA_WOMEN
  },
  { name: '8 homens (6 por mulheres, 2 por homens)', identities: EIGHT_MEN },
  {
    name: 'O mesmo com 16: + 4 mulheres atraídas por homens',
    identities: EIGHT_MEN,
    extra: EXTRA_WOMEN
  },
  { name: 'Elenco como está + time de natação (5)', identities: [], team: 5 },
  {
    name: 'O mesmo com 16 e 4 homens: + time de natação (5)',
    identities: FOUR_MEN,
    extra: EXTRA_WOMEN,
    team: 5
  }
]

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** The test playthrough's record, a save from its spring break, and its cast from the assets. */
function loadPlaythrough(): {
  record: PlaythroughRecord
  save: GameSave
  characters: Record<string, Character>
} {
  const record = readJson<PlaythroughRecord>(resolve(FOLDER, 'playthrough.json'))
  const save = readJson<GameSave>(resolve(FOLDER, 'manual03.json'))
  const characters: Record<string, Character> = {}
  for (const charId of record.chars) {
    const path = resolve(ROOT, 'assets/characters', charId, 'character.json')
    characters[charId] = readCharacterRecord(readJson<unknown>(path), path).character
  }
  return { record, save, characters }
}

/**
 * How far a clone's week is turned from the student's it was copied from: three days of the
 * week, so it keeps day and night in place and never stands where its original does.
 */
const CLONE_TURN = 6

/** A weekly map with its slots turned by {@link CLONE_TURN} inside a week of `size` slots. */
function turnedWeek<T>(week: Record<number, T>, size: number): Record<number, T> {
  return Object.fromEntries(
    Object.entries(week).map(([slot, value]) => [(Number(slot) + CLONE_TURN) % size, value])
  )
}

/**
 * Adds `count` women of the shipped cast to the roster in memory, each wearing the profile and
 * the save entry of one of the first students with her week turned, so the test playthrough on
 * disk is never touched.
 */
function addClones(
  record: PlaythroughRecord,
  save: GameSave,
  characters: Record<string, Character>,
  count: number
): void {
  const root = resolve(ROOT, 'assets/characters')
  const sources = [...record.chars]
  const added = readdirSync(root)
    .filter((charId) => !record.chars.includes(charId))
    .map((charId) => {
      const path = resolve(root, charId, 'character.json')
      return readCharacterRecord(readJson<unknown>(path), path).character
    })
    .filter((character) => character.gender === 'woman' && character.attractedTo === 'man')
    .slice(0, count)
  if (added.length < count) throw new Error(`Only ${added.length} women of the cast to add.`)

  added.forEach((character, i) => {
    const source = sources[i]
    const profile = record.profiles[source]
    const state = save.charInfo[source]
    characters[character.charId] = character
    record.chars.push(character.charId)
    record.profiles[character.charId] = {
      ...profile,
      schedule: turnedWeek(profile.schedule, 10),
      ...(profile.hiddenSchedule ? { hiddenSchedule: turnedWeek(profile.hiddenSchedule, 14) } : {})
    }
    save.charInfo[character.charId] = {
      ...state,
      memories: [],
      ...(state.job
        ? {
            job: {
              ...state.job,
              shifts: state.job.shifts
                .map((slot) => ((slot + CLONE_TURN) % 14) as ShiftSlot)
                .sort((a, b) => a - b)
            }
          }
        : {})
    }
  })
}

/** Totals over one semester. */
interface SemesterResult extends NpcRomanceTally {
  couplesAtEnd: number
  mostCouples: number
  firstCoupleDay: number | null
  /** With a team: its pairs' mean affinity, everybody else's, and how many of its pairs are friends. */
  teamAffinity: number
  otherAffinity: number
  teamFriends: number
  teamPairs: number
}

/**
 * Forms the scenario's swim team the way New Game does and writes it where the game reads it:
 * her place on the team on her profile, and the sessions in the weeks of those not in class or
 * on shift. Returns the team's members.
 */
function formTeam(
  record: PlaythroughRecord,
  save: GameSave,
  characters: Record<string, Character>,
  count: number
): string[] {
  const busy = Object.fromEntries(
    record.chars.map((charId) => [
      charId,
      new Set<number>([
        ...Object.keys(record.profiles[charId].schedule).map(Number),
        ...(save.charInfo[charId]?.job?.shifts ?? [])
      ])
    ])
  )
  const deal = dealGroups({
    choice: { swimming: { count, picked: [] } },
    roster: record.chars.map((charId) => ({ charId, gender: characters[charId].gender })),
    busy,
    playerClassSlots: new Set(),
    seed: 'sim'
  })
  const members = deal.members.swimming ?? []
  for (const charId of members) {
    const profile = record.profiles[charId]
    profile.groups = ['swimming']
    const week = { ...(profile.hiddenSchedule ?? {}) }
    for (const slot of deal.agendas.swimming?.sessions ?? []) {
      if (!busy[charId].has(slot)) week[slot] = { location: GROUPS.swimming.location, kind: 'team' }
    }
    profile.hiddenSchedule = week
  }
  return members
}

function playSemester(scenario: Scenario): SemesterResult {
  const { record, save, characters } = loadPlaythrough()
  if (scenario.extra) addClones(record, save, characters, scenario.extra)
  record.chars.forEach((charId, i) => {
    const identity = scenario.identities[i]
    if (identity) characters[charId] = { ...characters[charId], ...identity }
  })
  const team = scenario.team ? formTeam(record, save, characters, scenario.team) : []

  const game = useGameStore.getState()
  game.loadSave({ ...save, playthroughId: 'sim', saveId: 'sim' }, record, characters)
  const roster = record.chars.map((charId) => ({
    charId,
    year: useGameStore.getState().charInfo[charId]?.year ?? 1
  }))
  useGameStore.setState({
    cast: [],
    npcRelationships: rollInitialNpcRelationships(roster),
    npcRomance: emptyNpcRomance(),
    weekendOutings: {},
    outingSlots: {}
  })

  const result: SemesterResult = {
    crushes: 0,
    declarations: 0,
    accepted: 0,
    rejected: 0,
    fights: 0,
    breakups: 0,
    couplesAtEnd: 0,
    mostCouples: 0,
    firstCoupleDay: null,
    teamAffinity: 0,
    otherAffinity: 0,
    teamFriends: 0,
    teamPairs: 0
  }
  let romance: NpcRomanceMap = emptyNpcRomance()

  for (let date = 0; date < GRADUATION_DATE; date++) {
    for (const time of [0, 1] as TimeSlot[]) {
      useGameStore.setState({ date, time })
      applyNpcOverlay(rollNpcOverlayNow(date, time))
      const groups = rollSlotEncounterGroups()
      const state = useGameStore.getState()
      const settled = settleNpcPairs({
        date,
        relationships: state.npcRelationships,
        cast: [],
        groups,
        characters: state.characters
      })
      const out = settleNpcRomance({
        date,
        time,
        endsWeek: weekdayOf(date) === 0 && time === 1,
        relationships: settled,
        romance: state.npcRomance,
        groups,
        cast: [],
        readerLovers: [],
        characters: state.characters
      })
      romance = out.romance
      useGameStore.setState({ npcRelationships: out.relationships, npcRomance: romance })

      for (const key of Object.keys(out.tally) as (keyof NpcRomanceTally)[]) {
        result[key] += out.tally[key]
      }
      const couples = Object.keys(romance.couples).length
      result.mostCouples = Math.max(result.mostCouples, couples)
      if (out.tally.accepted > 0 && result.firstCoupleDay === null) result.firstCoupleDay = date
    }
  }
  result.couplesAtEnd = Object.keys(romance.couples).length

  if (team.length > 0) {
    const final = useGameStore.getState().npcRelationships
    const sums = { team: 0, other: 0, otherPairs: 0 }
    for (let i = 0; i < record.chars.length; i++) {
      for (let j = i + 1; j < record.chars.length; j++) {
        const [a, b] = [record.chars[i], record.chars[j]]
        const affinity = final[pairKeyOf(a, b)]?.affinity ?? 0
        if (team.includes(a) && team.includes(b)) {
          sums.team += affinity
          result.teamPairs += 1
          if (areNpcFriends(final, a, b)) result.teamFriends += 1
        } else {
          sums.other += affinity
          sums.otherPairs += 1
        }
      }
    }
    result.teamAffinity = result.teamPairs > 0 ? sums.team / result.teamPairs : 0
    result.otherAffinity = sums.otherPairs > 0 ? sums.other / sums.otherPairs : 0
  }
  return result
}

function average(values: number[]): string {
  if (values.length === 0) return '—'
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
}

it(
  'plays the semester and reports what happened',
  () => {
    const lines: string[] = [`\nRomance entre NPCs — média de ${RUNS} semestres por cenário\n`]
    for (const scenario of SCENARIOS) {
      const runs = Array.from({ length: RUNS }, () => playSemester(scenario))
      const of = (key: keyof SemesterResult): string =>
        average(runs.map((run) => run[key] as number))
      const formed = runs.reduce((sum, run) => sum + run.accepted, 0)
      const ended = runs.reduce((sum, run) => sum + run.breakups, 0)
      const firsts = runs.flatMap((run) => (run.firstCoupleDay === null ? [] : [run.firstCoupleDay]))
      lines.push(
        `■ ${scenario.name}`,
        `  paixões ${of('crushes')} · declarações ${of('declarations')} · aceitas ${of('accepted')} · recusadas ${of('rejected')}`,
        `  brigas ${of('fights')} · términos ${of('breakups')} · casais no fim ${of('couplesAtEnd')} · máximo simultâneo ${of('mostCouples')}`,
        `  casais que terminaram: ${formed === 0 ? '—' : `${Math.round((ended / formed) * 100)}%`}` +
          ` · primeiro casal no dia ${average(firsts)} (em ${firsts.length} de ${RUNS} semestres)`
      )
      if (scenario.team) {
        lines.push(
          `  time: afinidade média entre colegas ${of('teamAffinity')} contra ${of('otherAffinity')} nos demais pares` +
            ` · colegas amigas no fim ${of('teamFriends')} de ${of('teamPairs')}`
        )
      }
      lines.push('')
    }
    process.stdout.write(lines.join('\n') + '\n')
  },
  600_000
)
