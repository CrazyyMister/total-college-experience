import { beforeEach, describe, expect, it } from 'vitest'
import { gameResult, GROUPS, placeGroupEvents, tryoutVerdict, type GroupResult } from '@shared/groups'
import { classSlotForShift, globalSlotOf, JOB_CATALOG, newJobState } from '@shared/jobs'
import { homeOf, READER, STARTING_HOME } from '@shared/homes'
import { mixerOccasion, partyOccasion, rushOccasion, RUSH_EVENTS } from '@shared/houses'
import type { GameSave, Occasion, ShiftSlot } from '@shared/types'
import { groupNewsClause } from '../src/renderer/prompts/groupPrompt'
import { SPRING_BREAK } from '../src/renderer/prompts/occasions'
import { initiationAt, playerGroupNow } from '../src/renderer/stores/timetable'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { houseTexts } from '../src/renderer/stores/loop/coach'
import { settleShifts } from '../src/renderer/stores/loop/jobs'
import {
  applyLeaving,
  canTryOut,
  leaveTeamNow,
  planGroupEvent,
  resultOfEvent,
  settleGroupResults,
  settleInitiation,
  settlePledge,
  settleSessions,
  tryoutRefusal
} from '../src/renderer/stores/loop/groups'
import { character, charactersById, charInfo, playthroughRecord } from './fixtures'

/**
 * A group event's score is decided once and kept in the save. The scene and the boundary both
 * decide it, whichever comes first, and the second must find the first's answer and leave it.
 */

const MEET_NIGHT = 33
const NIGHT = 1

/** Three swimmers, one of whom is staying in on the night of the first meet. */
function seed(): Occasion {
  useGameStore.getState().reset()
  const team = ['a', 'b', 'c']
  const { placed } = placeGroupEvents({
    members: { swimming: team },
    occasions: [],
    avoid: [],
    freeCount: () => team.length
  })
  const meets = placed.filter((o) => o.group === 'swimming')
  useGameStore.setState({
    playthroughId: 'p1',
    date: MEET_NIGHT,
    time: NIGHT,
    chars: team,
    characters: charactersById(
      character({ charId: 'a' }),
      character({ charId: 'b', firstName: 'Mina', lastName: 'Okafor' }),
      character({ charId: 'c', firstName: 'Kira', lastName: 'Weber' })
    ),
    charInfo: Object.fromEntries(
      team.map((charId) => [
        charId,
        // 27 puts the third day of her cycle on the night of the meet.
        charInfo({ groups: ['swimming'], moodCycleOffset: charId === 'c' ? 27 : 10 })
      ])
    ),
    occasions: meets
  })
  return meets[0]
}

describe('how a group event ends', () => {
  let meet: Occasion
  beforeEach(() => {
    meet = seed()
  })

  it('reaches the same score whether its scene or the boundary decides it', () => {
    const fromScene = resultOfEvent(meet) as GroupResult
    expect(useGameStore.getState().groupResults[meet.id]).toEqual(fromScene)

    useGameStore.setState({ groupResults: {}, date: MEET_NIGHT + 1, time: 0 })
    settleGroupResults()
    expect(useGameStore.getState().groupResults[meet.id]).toEqual(fromScene)
  })

  it('leaves a result that is already filed as it is', () => {
    const filed: GroupResult = { won: false, home: 100, away: 200 }
    useGameStore.setState({ groupResults: { [meet.id]: filed }, date: MEET_NIGHT + 1, time: 0 })
    settleGroupResults()
    expect(useGameStore.getState().groupResults[meet.id]).toEqual(filed)
    expect(resultOfEvent(meet)).toEqual(filed)
  })

  it('decides nothing until its night is over', () => {
    for (const [date, time] of [
      [MEET_NIGHT - 1, 1],
      [MEET_NIGHT, 0],
      [MEET_NIGHT, 1]
    ] as const) {
      useGameStore.setState({ date, time })
      settleGroupResults()
      expect(useGameStore.getState().groupResults).toEqual({})
    }
    useGameStore.setState({ date: MEET_NIGHT + 1, time: 0 })
    settleGroupResults()
    expect(Object.keys(useGameStore.getState().groupResults)).toEqual([meet.id])
  })

  it('goes through the save and back, and an older save reads as none decided', () => {
    const result = resultOfEvent(meet) as GroupResult
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.groups).toEqual({ results: { [meet.id]: result } })

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupResults).toEqual({ [meet.id]: result })

    delete save.groups
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupResults).toEqual({})
    expect(useGameStore.getState().toGameSave()).not.toHaveProperty('groups')
  })

  it('tells the team of the result only once the night is over', () => {
    const result = resultOfEvent(meet) as GroupResult
    const told = (date: number, time: 0 | 1): string =>
      groupNewsClause(['swimming'], {
        date,
        time,
        occasions: [meet],
        groupResults: { [meet.id]: result }
      })
    expect(told(MEET_NIGHT, 0)).toBe('')
    expect(told(MEET_NIGHT, 1)).toBe('')
    expect(told(MEET_NIGHT + 1, 0)).toContain(result.won ? 'beat' : 'lost to')
  })
})

describe('the rush and the bid', () => {
  const offer = {
    day: 13,
    invited: ['kappa_row' as const],
    clashed: ['xi_delt' as const],
    scores: { kappa_row: 0.52, xi_delt: 0.47 }
  }
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it('files a rush event he went to once, however many times the boundary runs', () => {
    useGameStore.getState().recordRushAttended('rush-kappa_row-1')
    useGameStore.getState().recordRushAttended('rush-kappa_row-1')
    useGameStore.getState().recordRushAttended('rush-xi_delt-1')
    expect(useGameStore.getState().groupRush.attended).toEqual(['rush-kappa_row-1', 'rush-xi_delt-1'])
  })

  it('keeps the first bid decided, and answers it once, with a house it named', () => {
    const game = useGameStore.getState()
    game.fileBid(offer)
    game.fileBid({ ...offer, invited: ['xi_delt'], clashed: [] })
    expect(useGameStore.getState().groupRush.bid?.invited).toEqual(['kappa_row'])

    // A house that did not bid cannot be pledged.
    useGameStore.getState().answerBid('xi_delt', 29)
    expect(useGameStore.getState().groupHouse).toBeNull()
    expect(useGameStore.getState().groupRush.bid?.answer).toBeUndefined()

    useGameStore.getState().answerBid('kappa_row', 29)
    useGameStore.getState().answerBid(null, 31)
    expect(useGameStore.getState().groupHouse).toMatchObject({
      id: 'kappa_row',
      stage: 'pledge',
      since: 29,
      strikes: 0
    })
    expect(useGameStore.getState().groupRush.bid?.answer).toBe('kappa_row')
  })

  it('leaves him in no house when he turns them down, and does not ask again', () => {
    useGameStore.getState().fileBid(offer)
    useGameStore.getState().answerBid(null, 29)
    useGameStore.getState().answerBid('kappa_row', 30)
    expect(useGameStore.getState().groupHouse).toBeNull()
    expect(useGameStore.getState().groupRush.bid?.answer).toBeNull()
  })

  it('goes through the save and back, a bid still waiting among it, and an older save has none', () => {
    useGameStore.getState().recordRushAttended('rush-kappa_row-1')
    useGameStore.getState().fileBid(offer)
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.groups?.rush).toEqual({ attended: ['rush-kappa_row-1'], bid: offer })

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    const { groupRush } = useGameStore.getState()
    expect(groupRush.bid?.answer).toBeUndefined()

    const older = { ...save, groups: { results: {} } } as GameSave
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(older, playthroughRecord(), {})
    expect(useGameStore.getState().groupRush).toEqual({ attended: [] })
    expect(useGameStore.getState().groupHouse).toBeNull()
  })

  it('opens the scene of a rush event only on its half-day, with the free ones who live in the house', () => {
    const event = rushOccasion(RUSH_EVENTS[0], { date: 3, time: 1 })
    useGameStore.setState({
      occasions: [event],
      date: 3,
      time: 1,
      chars: ['a', 'b'],
      characters: charactersById(character({ charId: 'a' }), character({ charId: 'b' })),
      charInfo: { a: charInfo({ house: 'kappa_row' }), b: charInfo({ house: 'xi_delt' }) }
    })
    const plan = planGroupEvent(event.id)
    expect(plan?.cast).toEqual(['a'])
    expect(plan?.scene.groupEvent).toBe(event.id)
    useGameStore.setState({ time: 0 })
    expect(planGroupEvent(event.id)).toBeNull()
  })
})

describe('a tryout', () => {
  const DAY = 5

  /** The basketball tryout on its day, and a reader of the given Body in a game of that id. */
  function tryoutDay(playthroughId: string, body: number): Occasion {
    useGameStore.getState().reset()
    const { placed } = placeGroupEvents({
      members: {},
      occasions: [],
      avoid: [],
      freeCount: () => 0
    })
    useGameStore.setState({
      playthroughId,
      date: DAY,
      time: 0,
      stats: { brain: 0, body, heart: 0 },
      occasions: placed,
      groups: { basketball: { sessions: [2, 13] }, football: { sessions: [3, 12] } }
    })
    return placed[0]
  }

  /** A game id whose seed makes the team, or does not, at that Body. */
  function gameWhere(made: boolean, body: number): string {
    for (let at = 0; at < 200; at++) {
      const id = `g${at}`
      if (tryoutVerdict(body, `${id}:basketball-tryout:tryout`).made === made) return id
    }
    throw new Error('no such seed')
  }

  it('is judged once when its scene opens, and making it puts him on the team in the same write', () => {
    const tryout = tryoutDay(gameWhere(true, 60), 60)
    const plan = planGroupEvent(tryout.id)
    expect(plan?.scene).toEqual({ groupId: 'basketball', groupEvent: tryout.id })
    const game = useGameStore.getState()
    expect(game.groupTryouts[tryout.id]).toEqual({ made: true, tier: 4 })
    const since = globalSlotOf(DAY, 0) + 1
    expect(game.groupTeam).toEqual({
      id: 'basketball',
      since,
      strikes: 0,
      settledThrough: since - 1,
      attendedSlots: [],
      held: 0,
      attended: 0
    })
    // The welcome of the coach is filed in the write that put him on the team.
    const welcome = game.bunnyboard.conversations['team:basketball']?.messages ?? []
    expect(welcome.map((m) => m.text)).toEqual([
      "Coach here. You're on the roster. Practice is Tuesday Day and Sunday Night at the indoor courts. Be there, every time."
    ])

    // Opening it again in the same half-day is the same scene, and changes nothing.
    useGameStore.setState({ stats: { brain: 0, body: 0, heart: 0 } })
    expect(planGroupEvent(tryout.id)).not.toBeNull()
    expect(useGameStore.getState().groupTryouts[tryout.id]).toEqual({ made: true, tier: 4 })
  })

  it('leaves him on no team when he misses, and lets him try the other one', () => {
    const tryout = tryoutDay(gameWhere(false, 0), 0)
    planGroupEvent(tryout.id)
    expect(useGameStore.getState().groupTryouts[tryout.id]?.made).toBe(false)
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(canTryOut('football-tryout')).toBe(true)
  })

  it('is closed to a reader who is on a team, and a tryout already judged does not run twice', () => {
    const tryout = tryoutDay(gameWhere(true, 60), 60)
    planGroupEvent(tryout.id)
    expect(canTryOut('football-tryout')).toBe(false)
    // The next day the filed one is behind him.
    useGameStore.setState({ date: DAY + 1 })
    expect(canTryOut(tryout.id)).toBe(false)
  })

  it('refuses, naming the time to free, while a class or a shift of his is on a practice', () => {
    const tryout = tryoutDay('g0', 60)
    expect(tryoutRefusal(tryout.id)).toBeNull()
    // The first practice is shift slot 2, a Tuesday morning: a class there is in the way.
    const classSlot = classSlotForShift(2) as number
    useGameStore.setState({
      playerSchedule: { [classSlot]: 'MATH101' },
      classes: { MATH101: { name: 'Calculus' } } as never
    })
    expect(tryoutRefusal(tryout.id)).toMatch(/Tuesday Day.*Calculus.*Free that time/)
    expect(planGroupEvent(tryout.id)).toBeNull()
    expect(useGameStore.getState().groupTryouts).toEqual({})
  })

  it('goes through the save and back, leaving the team keeps the verdict, and an older save has none', () => {
    const tryout = tryoutDay(gameWhere(true, 60), 60)
    planGroupEvent(tryout.id)
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.groups?.tryouts).toEqual({ [tryout.id]: { made: true, tier: 4 } })
    expect(save.groups?.team?.id).toBe('basketball')

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupTeam?.id).toBe('basketball')
    useGameStore.getState().leaveTeam()
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(useGameStore.getState().groupTryouts[tryout.id]?.made).toBe(true)
    expect(useGameStore.getState().toGameSave().groups?.team).toBeUndefined()

    delete save.groups
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(useGameStore.getState().groupTryouts).toEqual({})
  })
})

describe('the practices of the team he is on', () => {
  // The team practices in periods 2 and 13 of the week, so its practices fall in slots 13, 16,
  // 27 and 30; he joined on day 5, Saturday, from the slot after the tryout.
  const SESSIONS: ShiftSlot[] = [2, 13]
  const CHAT = 'team:basketball'
  const AGENDAS = { basketball: { sessions: SESSIONS } }

  /** A reader on the basketball team, the clock at the given half-day and nothing judged yet. */
  function onTeam(date: number, time: 0 | 1, over: Record<string, unknown> = {}): void {
    useGameStore.getState().reset()
    useGameStore.setState({
      playthroughId: 'p1',
      date,
      time,
      groups: { basketball: { sessions: SESSIONS } },
      groupTryouts: { 'basketball-tryout': { made: true, tier: 3 } },
      groupTeam: {
        id: 'basketball',
        since: 11,
        strikes: 0,
        settledThrough: 10,
        attendedSlots: [],
        held: 0,
        attended: 0
      },
      ...over
    })
  }
  const texts = (): string[] =>
    (useGameStore.getState().bunnyboard.conversations[CHAT]?.messages ?? []).map((m) => m.text)

  it('files the strike, the slot judged through and the text of the coach in one write', () => {
    onTeam(7, 0)
    const seen: Array<[number, number]> = []
    const unsubscribe = useGameStore.subscribe((state) => {
      seen.push([
        state.groupTeam?.strikes ?? -1,
        state.bunnyboard.conversations[CHAT]?.messages.length ?? 0
      ])
    })
    settleSessions()
    unsubscribe()
    // One change to the store, and it carries all three together.
    expect(seen).toEqual([[1, 1]])
    expect(useGameStore.getState().groupTeam).toMatchObject({ settledThrough: 13, held: 1, attended: 0 })
    expect(texts()).toEqual([
      "You weren't at practice. That's one. Three misses and you're off the team."
    ])

    // Asked again, nothing is judged or sent a second time.
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(1)
    expect(texts()).toHaveLength(1)
  })

  it('counts a replayed boundary once, from the save taken before it or after it', () => {
    onTeam(7, 0)
    const before = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    settleSessions()
    const after = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    for (const save of [before, after]) {
      useGameStore.getState().reset()
      useGameStore.getState().loadSave(save, playthroughRecord({ groups: AGENDAS }), {})
      settleSessions()
      expect(useGameStore.getState().groupTeam?.strikes).toBe(1)
      expect(texts()).toHaveLength(1)
    }
  })

  it('spares a practice he went to, filed at the boundary, and forgets it once judged', () => {
    onTeam(7, 0)
    useGameStore.getState().recordPracticeAttended(13)
    useGameStore.getState().recordPracticeAttended(13)
    expect(useGameStore.getState().groupTeam?.attendedSlots).toEqual([13])
    settleSessions()
    expect(useGameStore.getState().groupTeam).toMatchObject({
      strikes: 0,
      settledThrough: 13,
      attendedSlots: [],
      held: 1,
      attended: 1
    })
    expect(texts()).toEqual([])
  })

  it('puts him out on the third miss, with a text for each, and keeps the tryout filed', () => {
    onTeam(14, 0)
    settleSessions()
    const game = useGameStore.getState()
    expect(game.groupTeam).toBeNull()
    expect(game.groupTryouts['basketball-tryout']?.made).toBe(true)
    expect(texts()).toEqual([
      "You weren't at practice. That's one. Three misses and you're off the team.",
      "That's two. One more and you're done here.",
      "That's three. You're off the team. Clear out your locker."
    ])
  })

  it('does not count a day the university is shut, a day after classes, or a shift of his', () => {
    // A practice on the first day of spring break, which closes the university.
    const day = SPRING_BREAK.startDate
    onTeam(day, 1, {
      groups: { basketball: { sessions: [(day % 7) * 2] } },
      groupTeam: {
        id: 'basketball',
        since: 11,
        strikes: 0,
        settledThrough: day * 2 - 1,
        attendedSlots: []
      }
    })
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(0)

    // The Friday after the last day of classes.
    onTeam(110, 0, {
      groups: { basketball: { sessions: [(109 % 7) * 2] } },
      groupTeam: {
        id: 'basketball',
        since: 11,
        strikes: 0,
        settledThrough: 216,
        attendedSlots: []
      }
    })
    settleSessions()
    expect(useGameStore.getState().groupTeam).toMatchObject({ strikes: 0, settledThrough: 219 })

    // A shift of his on the practice outranks it: no practice, no strike, and no button.
    onTeam(7, 0, { job: newJobState(JOB_CATALOG[0].id, [13], 0) })
    expect(playerGroupNow(6, 1)).toBeNull()
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(0)
    expect(texts()).toEqual([])
  })

  it('offers the practice only in its period, and the coach says goodbye when he leaves', () => {
    onTeam(6, 1)
    expect(playerGroupNow()?.group?.id).toBe('basketball')
    expect(playerGroupNow(6, 0)).toBeNull()
    leaveTeamNow()
    expect(useGameStore.getState().groupTeam).toBeNull()
    expect(useGameStore.getState().groupTryouts['basketball-tryout']?.made).toBe(true)
    expect(texts()).toEqual(['Understood. Your spot goes to someone else. Good luck.'])
    expect(playerGroupNow()).toBeNull()
  })

  it('reads a team saved before practices counted as having judged nothing', () => {
    onTeam(40, 0, { groupTeam: { id: 'basketball', since: 11 } })
    const old = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(old.groups?.team).toEqual({ id: 'basketball', since: 11 })
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(old, playthroughRecord({ groups: AGENDAS }), {})
    expect(useGameStore.getState().groupTeam).toEqual({
      id: 'basketball',
      since: 11,
      strikes: 0,
      settledThrough: globalSlotOf(40, 0) - 1,
      attendedSlots: [],
      held: 0,
      attended: 0
    })
    // Nothing is charged for the weeks before the save.
    settleSessions()
    expect(useGameStore.getState().groupTeam?.strikes).toBe(0)
  })
})

describe('a game of the men\'s team', () => {
  const GAME_DAY = 26
  const NIGHT_SLOT = globalSlotOf(GAME_DAY, 1)

  /** The first basketball game on its night, two men of the roster on the team, the reader on it or not. */
  function gameNight(playthroughId: string, onTeam: boolean, over: Record<string, unknown> = {}): Occasion {
    useGameStore.getState().reset()
    const { placed } = placeGroupEvents({
      members: { basketball: ['m1', 'm2'] },
      occasions: [],
      avoid: [],
      freeCount: () => 2
    })
    useGameStore.setState({
      playthroughId,
      date: GAME_DAY,
      time: 1,
      chars: ['m1', 'm2'],
      characters: charactersById(
        character({ charId: 'm1', gender: 'man' }),
        character({ charId: 'm2', firstName: 'Teo', lastName: 'Park', gender: 'man' })
      ),
      charInfo: { m1: charInfo({ groups: ['basketball'] }), m2: charInfo({ groups: ['basketball'] }) },
      occasions: placed,
      stats: { brain: 0, body: 100, heart: 0 },
      groups: { basketball: { sessions: [2, 13] } },
      groupTeam: onTeam
        ? {
            id: 'basketball',
            since: 11,
            strikes: 0,
            settledThrough: NIGHT_SLOT - 1,
            attendedSlots: [],
            held: 10,
            attended: 10
          }
        : null,
      ...over
    })
    return placed.find((o) => o.id === 'basketball-game-1') as Occasion
  }

  /** A playthrough whose seed beats the team only with the reader's part. */
  function seedWhereHeWins(): string {
    for (let at = 0; at < 500; at++) {
      const id = `g${at}`
      const seedOf = `${id}:basketball-game-1`
      const play = { tier: 5, practiceShare: 1 }
      if (
        gameResult(GROUPS.basketball, 1, seedOf, play).won &&
        !gameResult(GROUPS.basketball, 1, seedOf).won
      ) {
        return id
      }
    }
    throw new Error('no such seed')
  }

  it('counts his Body and his practices when he plays it, and not when he only watches or does not go', () => {
    const id = seedWhereHeWins()
    const game = gameNight(id, true)
    expect(planGroupEvent(game.id)?.scene).toEqual({ groupId: 'basketball', groupEvent: game.id })
    expect(useGameStore.getState().groupResults[game.id]?.won).toBe(true)

    // Not on the team: the same night, the same seed, the team on its own.
    gameNight(id, false)
    planGroupEvent(game.id)
    expect(useGameStore.getState().groupResults[game.id]?.won).toBe(false)

    // On the team but not at the game: the pass after the night decides it without him.
    gameNight(id, true, { date: GAME_DAY + 1, time: 0 })
    settleGroupResults()
    expect(useGameStore.getState().groupResults[game.id]?.won).toBe(false)
  })

  it('is decided when its scene opens and kept: later Body and practices change nothing', () => {
    const id = seedWhereHeWins()
    const game = gameNight(id, true)
    planGroupEvent(game.id)
    const filed = useGameStore.getState().groupResults[game.id]
    useGameStore.setState({ stats: { brain: 0, body: 0, heart: 0 } })
    planGroupEvent(game.id)
    resultOfEvent(game, true)
    expect(useGameStore.getState().groupResults[game.id]).toEqual(filed)

    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.groups?.results[game.id]).toEqual(filed)
    expect(save.groups?.team).toMatchObject({ held: 10, attended: 10 })
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().groupResults[game.id]).toEqual(filed)
    expect(useGameStore.getState().groupTeam).toMatchObject({ held: 10, attended: 10 })
  })

  it('takes the courts that night: a practice of his team in the period of a volleyball match is not held', () => {
    const match: Occasion = {
      id: 'volleyball-match-1',
      title: 'Match',
      description: 'A match.',
      startDate: GAME_DAY,
      endDate: GAME_DAY,
      time: 1,
      cancelsClasses: false,
      kind: 'campus',
      group: 'volleyball',
      where: 'palaestra_court'
    }
    // His team practices in the period of that Saturday night (GAME_DAY is a Saturday: period 11).
    gameNight('p1', true, {
      occasions: [match],
      groups: { basketball: { sessions: [11, 2] } }
    })
    expect(playerGroupNow(GAME_DAY, 1)).toBeNull()
    useGameStore.setState({ occasions: [] })
    expect(playerGroupNow(GAME_DAY, 1)).not.toBeNull()
  })
})

describe('the pledge meetings of the house he has said yes to', () => {
  // The house meets in periods 2 and 9 of the week (Tuesday daytime and Friday night), so from
  // day 14 its meetings fall in slots 30 (day 15), 37 (day 18), 44 (day 22) and so on; he said
  // yes in slot 28, so the first meeting judged is the one after it.
  const SESSIONS: ShiftSlot[] = [2, 9]
  const CHAT = 'house:kappa_row'
  const AGENDAS = { kappa_row: { sessions: SESSIONS } }
  const standing = {
    id: 'kappa_row' as const,
    stage: 'pledge' as const,
    since: 28,
    strikes: 0,
    settledThrough: 28,
    attendedSlots: [] as number[],
    held: 0,
    attended: 0
  }

  /** A reader pledging Kappa Row, the clock at the given half-day and nothing judged yet. */
  function pledging(date: number, time: 0 | 1, over: Record<string, unknown> = {}): void {
    useGameStore.getState().reset()
    useGameStore.setState({
      playthroughId: 'p1',
      date,
      time,
      houseAgendas: AGENDAS,
      groupHouse: { ...standing },
      chars: ['a'],
      characters: charactersById(character({ charId: 'a' })),
      charInfo: { a: charInfo({ house: 'kappa_row' }) },
      ...over
    })
  }
  const texts = (): string[] =>
    (useGameStore.getState().bunnyboard.conversations[CHAT]?.messages ?? []).map((m) => m.text)

  it('files the strike, the slot judged through and the text of the house in one write', () => {
    pledging(16, 0)
    const seen: Array<[number, number]> = []
    const unsubscribe = useGameStore.subscribe((state) => {
      seen.push([
        state.groupHouse?.strikes ?? -1,
        state.bunnyboard.conversations[CHAT]?.messages.length ?? 0
      ])
    })
    settlePledge()
    unsubscribe()
    expect(seen).toEqual([[1, 1]])
    expect(useGameStore.getState().groupHouse).toMatchObject({ settledThrough: 31, held: 1, attended: 0 })
    expect(texts()).toEqual([
      "You weren't at the meeting. That's one. Three misses and your pledge is over."
    ])

    // Asked again, nothing is judged or sent a second time.
    settlePledge()
    expect(useGameStore.getState().groupHouse?.strikes).toBe(1)
    expect(texts()).toHaveLength(1)
  })

  it('counts a replayed boundary once, from the save taken before it or after it', () => {
    pledging(16, 0)
    const before = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    settlePledge()
    const after = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    for (const save of [before, after]) {
      useGameStore.getState().reset()
      useGameStore.getState().loadSave(save, playthroughRecord({ houseAgendas: AGENDAS }), {})
      settlePledge()
      expect(useGameStore.getState().groupHouse?.strikes).toBe(1)
      expect(texts()).toHaveLength(1)
    }
  })

  it('spares a meeting he went to, filed once, and forgets it once judged', () => {
    pledging(16, 0)
    useGameStore.getState().recordMeetingAttended(30)
    useGameStore.getState().recordMeetingAttended(30)
    expect(useGameStore.getState().groupHouse?.attendedSlots).toEqual([30])
    settlePledge()
    expect(useGameStore.getState().groupHouse).toMatchObject({
      strikes: 0,
      settledThrough: 31,
      attendedSlots: [],
      held: 1,
      attended: 1
    })
    expect(texts()).toEqual([])
  })

  it('puts him out on the third miss with a text for each, marks the house, and leaves no memory', () => {
    pledging(22, 1)
    settlePledge()
    const game = useGameStore.getState()
    expect(game.groupHouse).toBeNull()
    expect(game.groupDropped).toEqual({ house: 'kappa_row', day: 22 })
    expect(game.charInfo.a.memories).toEqual([])
    expect(texts()).toEqual([
      "You weren't at the meeting. That's one. Three misses and your pledge is over.",
      "That's two. One more and your pledge is over.",
      "That's three. Your pledge is over. You're not one of us."
    ])
    // The bid is not asked again, and a replayed boundary changes nothing.
    settlePledge()
    expect(texts()).toHaveLength(3)
    expect(useGameStore.getState().groupDropped).toEqual({ house: 'kappa_row', day: 22 })
  })

  it('does not hold a meeting on a closed day, on the night of an event of the house or of its mixer, or on a game of his team', () => {
    // Presidents' Day, a Monday: the house meets Mondays by day.
    pledging(29, 0, {
      houseAgendas: { kappa_row: { sessions: [0] } },
      groupHouse: { ...standing, since: 20, settledThrough: 55 }
    })
    settlePledge()
    expect(useGameStore.getState().groupHouse).toMatchObject({ strikes: 0, settledThrough: 57 })

    // A party of the house on a Saturday night, and a mixer a sorority hosts with it on a Thursday.
    pledging(20, 0, {
      houseAgendas: { kappa_row: { sessions: [7, 11] } },
      occasions: [partyOccasion('kappa_row', 3, 19), mixerOccasion('sig_lam', 2, 17)],
      groupHouse: { ...standing, settledThrough: 33 }
    })
    settlePledge()
    expect(useGameStore.getState().groupHouse).toMatchObject({ strikes: 0, held: 0 })

    // A game of the team he is on, on a Saturday night.
    const game: Occasion = {
      id: 'basketball-game-1',
      title: 'Game',
      description: 'A game.',
      startDate: 26,
      endDate: 26,
      time: 1,
      cancelsClasses: false,
      kind: 'campus',
      group: 'basketball',
      where: 'palaestra_courts'
    }
    pledging(27, 0, {
      houseAgendas: { kappa_row: { sessions: [11] } },
      occasions: [game],
      groupHouse: { ...standing, settledThrough: 51 },
      groupTeam: {
        id: 'basketball',
        since: 11,
        strikes: 0,
        settledThrough: 100,
        attendedSlots: [],
        held: 0,
        attended: 0
      }
    })
    settlePledge()
    expect(useGameStore.getState().groupHouse).toMatchObject({ strikes: 0, held: 0 })
    expect(playerGroupNow(26, 1)).toBeNull()

    // The same Saturday night with no game is a meeting he missed.
    useGameStore.setState({ occasions: [], groupHouse: { ...standing, settledThrough: 51 } })
    expect(playerGroupNow(26, 1)?.kind).toBe('house')
    settlePledge()
    expect(useGameStore.getState().groupHouse?.strikes).toBe(1)
  })

  it('stops holding meetings after the last day of the pledge and when a shift holds the period', () => {
    pledging(43, 0, {
      houseAgendas: { kappa_row: { sessions: [0] } },
      groupHouse: { ...standing, settledThrough: 83 }
    })
    settlePledge()
    expect(useGameStore.getState().groupHouse).toMatchObject({ strikes: 0, settledThrough: 85 })

    pledging(16, 0, { job: newJobState(JOB_CATALOG[0].id, [2], 0) })
    expect(playerGroupNow(15, 0)).toBeNull()
    settlePledge()
    expect(useGameStore.getState().groupHouse?.strikes).toBe(0)
  })

  it('answers the bid with the standing and the first text of the house in one write', () => {
    useGameStore.getState().reset()
    useGameStore.setState({
      groupRush: { attended: [], bid: { day: 13, invited: ['kappa_row'], clashed: [], scores: {} } }
    })
    const welcome = {
      messages: [{ id: 'm', sender: 'contact' as const, text: 'Welcome.', date: 14, time: 0 as const }],
      unread: 1
    }
    useGameStore.getState().answerBid('kappa_row', 28, welcome)
    expect(useGameStore.getState().groupHouse).toEqual(standing)
    expect(useGameStore.getState().bunnyboard.conversations[CHAT]?.messages).toHaveLength(1)
  })

  it('goes through the save and back, with the mark of the house that put him out, and reads an old pledge as judged from here', () => {
    pledging(22, 1)
    settlePledge()
    const out = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(out.groups?.dropped).toEqual({ house: 'kappa_row', day: 22 })
    expect(out.groups?.house).toBeUndefined()
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(out, playthroughRecord(), {})
    expect(useGameStore.getState().groupDropped).toEqual({ house: 'kappa_row', day: 22 })
    expect(useGameStore.getState().groupHouse).toBeNull()

    // A save from the part before meetings counted: nothing is charged for the weeks before it.
    pledging(30, 0, { groupHouse: { id: 'kappa_row', stage: 'pledge', since: 28 } })
    const old = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(old.groups?.house).toEqual({ id: 'kappa_row', stage: 'pledge', since: 28 })
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(old, playthroughRecord({ houseAgendas: AGENDAS }), {})
    expect(useGameStore.getState().groupHouse).toEqual({
      ...standing,
      settledThrough: globalSlotOf(30, 0) - 1
    })
    settlePledge()
    expect(useGameStore.getState().groupHouse?.strikes).toBe(0)
  })
})

describe('the initiation, the move into the house and leaving it', () => {
  // The house meets in periods 2 and 9; the initiation is a night of week 7. Day 46 is a Friday,
  // so its night is slot 93; the Sunday that ends the pledge is day 41, whose night is slot 83.
  const SESSIONS: ShiftSlot[] = [2, 9]
  const CHAT = 'house:kappa_row'
  const FRIDAY_NIGHT = globalSlotOf(46, 1)
  const standing = {
    id: 'kappa_row' as const,
    stage: 'pledge' as const,
    since: 28,
    strikes: 0,
    settledThrough: 82,
    attendedSlots: [] as number[],
    held: 0,
    attended: 0
  }
  /** The nights of the week, as the class slots that hold them: Monday to Friday night. */
  const WEEK_NIGHTS = [1, 3, 5, 7, 9]

  function pledging(date: number, time: 0 | 1, over: Record<string, unknown> = {}): void {
    useGameStore.getState().reset()
    useGameStore.setState({
      playthroughId: 'p1',
      date,
      time,
      houseAgendas: { kappa_row: { sessions: SESSIONS } },
      groupHouse: { ...standing },
      chars: ['a', 'b', 'c'],
      characters: charactersById(
        character({ charId: 'a' }),
        character({ charId: 'b', firstName: 'Mina', lastName: 'Okafor' }),
        character({ charId: 'c', firstName: 'Kira', lastName: 'Weber' })
      ),
      charInfo: {
        a: charInfo({ house: 'kappa_row' }),
        b: charInfo({ house: 'xi_delt' }),
        c: charInfo()
      },
      ...over
    })
  }
  const texts = (): string[] =>
    (useGameStore.getState().bunnyboard.conversations[CHAT]?.messages ?? []).map((m) => m.text)
  const saved = (): GameSave => JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

  it('sets the night once, on the first slot of the last day, with a text', () => {
    // A class on Friday night and a shift on Thursday night: Wednesday is the latest free night.
    pledging(41, 0, {
      playerSchedule: { 9: 'BIO101' },
      job: newJobState(JOB_CATALOG[0].id, [7], 0)
    })
    settleInitiation()
    const first = useGameStore.getState().groupHouse?.initiation
    expect(first).toMatchObject({ slot: globalSlotOf(44, 1) })
    expect(first?.reminded).toBeUndefined()
    expect(texts()).toHaveLength(1)

    // Asked again, or from the save taken before, the night stays and nothing is sent twice.
    settleInitiation()
    expect(texts()).toHaveLength(1)
    pledging(41, 0, { playerSchedule: { 9: 'BIO101' } })
    useGameStore.getState().fileInitiation({ slot: 95, why: 'x' }, { messages: [], unread: 0 })
    useGameStore.getState().fileInitiation({ slot: 89, why: 'y' }, { messages: [], unread: 0 })
    expect(useGameStore.getState().groupHouse?.initiation?.slot).toBe(95)
  })

  it('spares the shift of the night of the last resort, however often the boundary runs', () => {
    const everyNight = Object.fromEntries(WEEK_NIGHTS.map((slot) => [slot, 'BIO101']))
    const job = () => ({ ...newJobState(JOB_CATALOG[0].id, [13], 0), settledThrough: 82 })

    // Without the initiation set, the Sunday night's shift he did not work is a strike.
    pledging(42, 0, { playerSchedule: everyNight, job: job() })
    settleShifts()
    expect(useGameStore.getState().job?.strikes).toBe(1)

    pledging(41, 0, { playerSchedule: everyNight, job: job() })
    settleInitiation()
    expect(useGameStore.getState().groupHouse?.initiation?.slot).toBe(83)
    useGameStore.setState({ date: 42, time: 0 })
    settleShifts()
    expect(useGameStore.getState().job).toMatchObject({ strikes: 0, settledThrough: 83 })

    // And he is a member by then: the night is still spared when the boundary is replayed.
    useGameStore.getState().becomeMember({ messages: [], unread: 0 })
    useGameStore.setState({ job: job() })
    settleShifts()
    expect(useGameStore.getState().job?.strikes).toBe(0)
    expect(initiationAt(83)).toBe(true)
  })

  it('makes him a member and moves him into the house once, with the welcome in the same write', () => {
    pledging(46, 1, {
      groupHouse: { ...standing, initiation: { slot: FRIDAY_NIGHT, why: 'Friday night free' } }
    })
    const welcome = houseTexts('kappa_row', [], [{ kind: 'member' }])
    useGameStore.getState().becomeMember(welcome)
    useGameStore.getState().moveHome(READER, 'kappa_row')
    useGameStore.getState().becomeMember(houseTexts('kappa_row', [], [{ kind: 'member' }]))
    useGameStore.getState().moveHome(READER, 'kappa_row')

    expect(useGameStore.getState().groupHouse?.stage).toBe('member')
    expect(texts()).toHaveLength(1)
    expect(homeOf(useGameStore.getState(), READER)).toBe('kappa_row')

    // A member is not judged for the initiation night that has passed.
    useGameStore.setState({ date: 47, time: 0 })
    settleInitiation()
    expect(useGameStore.getState().groupHouse?.stage).toBe('member')
  })

  it('puts a pledge out, marked, when the night has passed and he was not there', () => {
    pledging(47, 0, {
      groupHouse: { ...standing, initiation: { slot: FRIDAY_NIGHT, why: 'Friday night free' } }
    })
    const before = saved()
    settleInitiation()
    const game = useGameStore.getState()
    expect(game.groupHouse).toBeNull()
    expect(game.groupDropped).toEqual({ house: 'kappa_row', day: 47, reason: 'initiation' })
    expect(game.charInfo.a.jealousyMemories).toBeUndefined()
    expect(texts()).toHaveLength(1)

    settleInitiation()
    expect(texts()).toHaveLength(1)
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(before, playthroughRecord({ houseAgendas: { kappa_row: { sessions: SESSIONS } } }), {})
    settleInitiation()
    expect(useGameStore.getState().groupDropped).toEqual({ house: 'kappa_row', day: 47, reason: 'initiation' })
  })

  it('leaves a disliked memory only in the members of the roster, takes him back to the dorm, and does it once', () => {
    pledging(50, 0, { groupHouse: { ...standing, stage: 'member' as const, initiation: { slot: FRIDAY_NIGHT, why: 'x' } } })
    useGameStore.getState().moveHome(READER, 'kappa_row')
    useGameStore.getState().askToLeave()
    applyLeaving()
    applyLeaving()

    const game = useGameStore.getState()
    expect(game.groupHouse).toBeNull()
    expect(game.groupDropped).toEqual({ house: 'kappa_row', day: 50, reason: 'left' })
    expect(homeOf(game, READER)).toBe(STARTING_HOME)
    expect(game.charInfo.a.jealousyMemories).toEqual([
      expect.objectContaining({ type: 'disliked', desc: 'the reader left the Kappa Row house' })
    ])
    // Another house's member and somebody of none remember nothing.
    expect(game.charInfo.b.jealousyMemories).toBeUndefined()
    expect(game.charInfo.c.jealousyMemories).toBeUndefined()
  })

  it('quits a pledge the same way without a move, and leaves no memory where the roster has no member', () => {
    pledging(30, 0, { charInfo: { a: charInfo(), b: charInfo({ house: 'xi_delt' }), c: charInfo() } })
    useGameStore.getState().askToLeave()
    applyLeaving()
    const game = useGameStore.getState()
    expect(game.groupDropped).toEqual({ house: 'kappa_row', day: 30, reason: 'quit' })
    expect(game.homeMoves).toEqual({})
    expect(Object.values(game.charInfo).every((info) => info.jealousyMemories === undefined)).toBe(true)

    pledging(30, 0)
    useGameStore.getState().askToLeave()
    applyLeaving()
    expect(useGameStore.getState().charInfo.a.jealousyMemories?.[0].desc).toBe('the reader quit pledging Kappa Row')
  })

  it('goes through the save and back as a member with his night, asking to leave, and with the reason of a mark', () => {
    pledging(50, 0, {
      groupHouse: { ...standing, stage: 'member' as const, initiation: { slot: FRIDAY_NIGHT, why: 'Friday night free', reminded: true }, leaving: true }
    })
    useGameStore.getState().moveHome(READER, 'kappa_row')
    const out = saved()
    expect(out.groups?.house).toMatchObject({
      stage: 'member',
      initiation: { slot: FRIDAY_NIGHT, why: 'Friday night free', reminded: true },
      leaving: true
    })
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(out, playthroughRecord(), {})
    expect(useGameStore.getState().groupHouse).toMatchObject({
      stage: 'member',
      initiation: { slot: FRIDAY_NIGHT },
      leaving: true
    })
    expect(homeOf(useGameStore.getState(), READER)).toBe('kappa_row')

    // A mark without a reason, as the meetings left it, still reads as the meetings.
    useGameStore.setState({ groupDropped: { house: 'kappa_row', day: 22 } })
    const old = saved()
    expect(old.groups?.dropped).toEqual({ house: 'kappa_row', day: 22 })
    useGameStore.setState({ groupDropped: { house: 'kappa_row', day: 50, reason: 'quit' } })
    expect(saved().groups?.dropped).toEqual({ house: 'kappa_row', day: 50, reason: 'quit' })
  })
})
