import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  NPC_COMMENTS_PER_SLOT,
  npcCommentBarOf,
  npcCommentPostBar,
  npcCommentRelationOf,
  pickNpcCommenters,
  type NpcCommentWorld
} from '@shared/npcComments'
import { pairKeyOf } from '@shared/npcRelationships'
import { emptyNpcRomance, type NpcRomanceMap } from '@shared/npcRomance'
import { emptyFlags } from '@shared/relationship'
import type { GameSave, NpcCommentAnswer, SocialPost } from '@shared/types'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { character, charInfo, charactersById, playthroughRecord, restoreApi, stubApi } from './fixtures'

// The loop's modules subscribe to the bridge as they load.
stubApi({ jobs: { onProgress: () => () => {} } })
const { npcCommentsFor } = await import('../src/renderer/stores/loop/npcComments')
const { loopState } = await import('../src/renderer/stores/loop/state')

/** A roster of four on day 10, a and b close friends, a and c friends, a and d strangers. */
function world(over: Partial<NpcCommentWorld> = {}, romance: Partial<NpcRomanceMap> = {}): NpcCommentWorld {
  return {
    relationships: {
      [pairKeyOf('a', 'b')]: { affinity: 6 },
      [pairKeyOf('a', 'c')]: { affinity: 4 },
      [pairKeyOf('a', 'd')]: { affinity: 1 }
    },
    romance: { ...emptyNpcRomance(), ...romance },
    roster: ['a', 'b', 'c', 'd'],
    date: 10,
    ...over
  }
}

const PEOPLE = { posterReachable: true, commenterKnown: true, commenterBlocked: false }
const POST = { tagsReader: undefined, npcComment: undefined }

describe('which posts may take a comment', () => {
  it('is a plain post, never one tagging him, one already commented, or the romance has somebody write', () => {
    expect(npcCommentPostBar(world(), 'a', POST)).toBeNull()
    expect(npcCommentPostBar(world(), 'a', { tagsReader: true })).not.toBeNull()
    const comment = { id: 'c', charId: 'b', text: 'x', date: 10, time: 0 as const }
    expect(npcCommentPostBar(world(), 'a', { npcComment: comment })).not.toBeNull()

    // A couple of hers that formed the day before, or broke up today, stands in for the post
    // the romance owed; an older one does not.
    const key = pairKeyOf('a', 'b')
    expect(npcCommentPostBar(world({}, { couples: { [key]: { since: 9 } } }), 'a', POST)).not.toBeNull()
    expect(npcCommentPostBar(world({}, { couples: { [key]: { since: 5 } } }), 'a', POST)).toBeNull()
    expect(
      npcCommentPostBar(world({}, { exes: { [key]: { since: 1, ended: 10 } } }), 'b', POST)
    ).not.toBeNull()
    expect(npcCommentPostBar(world({}, { couples: { [key]: { since: 9 } } }), 'c', POST)).toBeNull()

    // A drift's hint, written by either end of the drift.
    const drifts = { a: { to: 'c', since: 9, signs: 0 } }
    expect(npcCommentPostBar(world({}, { drifts }), 'a', POST)).not.toBeNull()
    expect(npcCommentPostBar(world({}, { drifts }), 'c', POST)).not.toBeNull()
    expect(npcCommentPostBar(world({}, { drifts }), 'b', POST)).toBeNull()
  })
})

describe('who may comment under a post', () => {
  it('is a friend, the closest friend or the partner of whoever posted, and nobody else', () => {
    expect(npcCommentRelationOf(world(), 'a', 'b')).toEqual({ relation: 'bestFriend' })
    expect(npcCommentRelationOf(world(), 'a', 'c')).toEqual({ relation: 'friend' })
    expect(npcCommentRelationOf(world(), 'a', 'd')).toEqual({ bar: 'not friends' })
    const couples = { [pairKeyOf('a', 'd')]: { since: 2 } }
    expect(npcCommentRelationOf(world({}, { couples }), 'a', 'd')).toEqual({ relation: 'couple' })
  })

  it('never takes exes, a crush either way, a recent turned-down declaration, a drift or a fresh fight', () => {
    const key = pairKeyOf('a', 'b')
    expect(npcCommentRelationOf(world({}, { exes: { [key]: { since: 1, ended: 3 } } }), 'a', 'b')).toHaveProperty('bar')
    expect(
      npcCommentRelationOf(world({}, { crushes: { b: { to: 'a', since: 2 } } }), 'a', 'b')
    ).toHaveProperty('bar')
    expect(
      npcCommentRelationOf(world({}, { crushes: { a: { to: 'b', since: 2 } } }), 'a', 'b')
    ).toHaveProperty('bar')
    expect(
      npcCommentRelationOf(world({}, { rejections: { 'a>b': { date: 5 } } }), 'a', 'b')
    ).toHaveProperty('bar')
    expect(
      npcCommentRelationOf(world({}, { rejections: { 'a>b': { date: -30 } } }), 'a', 'b')
    ).toEqual({ relation: 'bestFriend' })
    expect(
      npcCommentRelationOf(world({}, { drifts: { z: { to: 'b', since: 2, signs: 1 } } }), 'a', 'b')
    ).toHaveProperty('bar')
    const couples = { [pairKeyOf('a', 'd')]: { since: 2, lastFight: 6 } }
    expect(npcCommentRelationOf(world({}, { couples }), 'a', 'd')).toHaveProperty('bar')
    const healed = { [pairKeyOf('a', 'd')]: { since: 2, lastFight: 2 } }
    expect(npcCommentRelationOf(world({}, { couples: healed }), 'a', 'd')).toEqual({ relation: 'couple' })
  })

  it('needs a contact who posted, and somebody he can name who has not blocked him', () => {
    expect(npcCommentBarOf(world(), 'a', 'b', PEOPLE)).toBeNull()
    expect(npcCommentBarOf(world(), 'a', 'b', { ...PEOPLE, posterReachable: false })).not.toBeNull()
    expect(npcCommentBarOf(world(), 'a', 'b', { ...PEOPLE, commenterKnown: false })).not.toBeNull()
    expect(npcCommentBarOf(world(), 'a', 'b', { ...PEOPLE, commenterBlocked: true })).not.toBeNull()
  })
})

describe('who writes the comment', () => {
  const candidates = (postId: string, posterId: string, ...charIds: string[]) => ({
    postId,
    posterId,
    commenters: charIds.map((charId) => ({ charId, relation: 'friend' as const }))
  })

  it('is the same for the same post, one a post and at most two across them', () => {
    const posts = Array.from({ length: 200 }, (_, at) => candidates(`post-${at}`, 'a', 'b', 'c'))
    const once = pickNpcCommenters(posts, null, 200)
    expect(pickNpcCommenters(posts, null, 200)).toEqual(once)
    expect(new Set(once.picked.map((one) => one.postId)).size).toBe(once.picked.length)
    expect(once.picked.length).toBeGreaterThan(0)
    expect(once.picked.length).toBeLessThan(200)

    expect(pickNpcCommenters(posts).picked.length).toBeLessThanOrEqual(NPC_COMMENTS_PER_SLOT)
  })

  it('takes the forced one past the dice and the cap, and nobody the rules left out', () => {
    const posts = Array.from({ length: 50 }, (_, at) => candidates(`post-${at}`, 'a', 'b', 'c'))
    const { picked } = pickNpcCommenters(posts, { charId: 'c', posterId: 'a' })
    expect(picked).toHaveLength(NPC_COMMENTS_PER_SLOT)
    expect(picked.every((one) => one.charId === 'c' || one.charId === 'b')).toBe(true)
    // Forced into a post the rules gave nobody to: nothing.
    expect(pickNpcCommenters([candidates('p', 'a')], { charId: 'b', posterId: 'a' }).picked).toEqual([])
  })
})

/** A post of hers, put up in the slot being ended. */
function post(id: string, over: Partial<SocialPost> = {}): SocialPost {
  return { id, text: 'ramen night', date: 10, time: 0, likes: 1, ...over }
}

const contact = (over: Parameters<typeof charInfo>[0] = {}) =>
  charInfo({ nameKnown: true, flags: { ...emptyFlags(), gaveContactInfo: true }, ...over })

describe('the posts of the slot that is ending', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({
      date: 10,
      time: 0,
      chars: ['a', 'b', 'c'],
      characters: charactersById(
        character({ charId: 'a', firstName: 'Ann', lastName: 'One' }),
        character({ charId: 'b', firstName: 'Bea', lastName: 'Two' }),
        character({ charId: 'c', firstName: 'Cat', lastName: 'Three' })
      ),
      charInfo: {
        a: contact({ feed: [post('now'), post('old', { date: 9, time: 1 })] }),
        b: contact(),
        c: charInfo({ nameKnown: false })
      }
    })
    loopState.debugNpcComment = null
  })

  const relationships = { [pairKeyOf('a', 'b')]: { affinity: 6 }, [pairKeyOf('a', 'c')]: { affinity: 6 } }

  it("takes only a contact's post from this slot, and a commenter he can name", () => {
    loopState.debugNpcComment = { charId: 'b', posterId: 'a' }
    const asks = npcCommentsFor(useGameStore.getState().charInfo, relationships, emptyNpcRomance())
    expect(asks).toHaveLength(1)
    expect(asks[0]).toMatchObject({ postId: 'now', posterId: 'a', charId: 'b', relation: 'bestFriend' })

    // Cat is a stranger to him: forced, she still may not.
    loopState.debugNpcComment = { charId: 'c', posterId: 'a' }
    const asks2 = npcCommentsFor(useGameStore.getState().charInfo, relationships, emptyNpcRomance())
    expect(asks2.every((one) => one.charId !== 'c')).toBe(true)
    loopState.debugNpcComment = null
  })

  it('leaves a stranger’s post and a tagged post alone', () => {
    loopState.debugNpcComment = { charId: 'a', posterId: 'b' }
    useGameStore.setState({
      charInfo: {
        a: contact(),
        b: charInfo({ nameKnown: true, feed: [post('theirs')] }),
        c: contact({ feed: [post('tagged', { tagsReader: true })] })
      }
    })
    expect(npcCommentsFor(useGameStore.getState().charInfo, relationships, emptyNpcRomance())).toEqual([])
    loopState.debugNpcComment = null
  })
})

describe('filing a comment', () => {
  const answer: NpcCommentAnswer = {
    posterId: 'a',
    postId: 'now',
    commentId: 'k1',
    charId: 'b',
    text: 'save me a seat next time'
  }

  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({
      date: 11,
      time: 1,
      chars: ['a', 'b'],
      npcRelationships: { [pairKeyOf('a', 'b')]: { affinity: 6 } },
      charInfo: { a: contact({ feed: [post('now')] }), b: contact() }
    })
  })

  it('files it once however often the boundary replays, and keeps it whole through the save', () => {
    useGameStore.getState().deliverNpcComments([answer])
    useGameStore.getState().deliverNpcComments([answer])
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().charInfo.a.feed).toEqual([
      post('now', { npcComment: { id: 'k1', charId: 'b', text: answer.text, date: 11, time: 1 } })
    ])
  })

  it('files nothing once the pair or the poster no longer stands', () => {
    // They fell out between the ending and the boundary.
    useGameStore.setState({ npcRelationships: { [pairKeyOf('a', 'b')]: { affinity: 0 } } })
    useGameStore.getState().deliverNpcComments([answer])
    expect(useGameStore.getState().charInfo.a.feed?.[0].npcComment).toBeUndefined()

    // The commenter blocked him, and the poster did.
    useGameStore.setState({
      npcRelationships: { [pairKeyOf('a', 'b')]: { affinity: 6 } },
      charInfo: {
        a: contact({ feed: [post('now')] }),
        b: contact({ flags: { ...emptyFlags(), gaveContactInfo: true, blocked: true } })
      }
    })
    useGameStore.getState().deliverNpcComments([answer])
    expect(useGameStore.getState().charInfo.a.feed?.[0].npcComment).toBeUndefined()

    useGameStore.setState({
      charInfo: {
        a: contact({
          feed: [post('now')],
          flags: { ...emptyFlags(), gaveContactInfo: true, blocked: true }
        }),
        b: contact()
      }
    })
    useGameStore.getState().deliverNpcComments([answer])
    expect(useGameStore.getState().charInfo.a.feed?.[0].npcComment).toBeUndefined()
  })

  it('leaves a save from before comments reading as none', () => {
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().charInfo.a.feed?.[0].npcComment).toBeUndefined()
  })
})

afterAll(() => restoreApi())
