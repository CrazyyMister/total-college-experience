import { mkdtemp, rm, utimes } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPhotoPrompts,
  photoDraft,
  regeneratedPhoto,
  settleMessagePhoto
} from '@shared/imagePrompt'
import {
  chosenPhotoKind,
  photoOfferFor,
  type PhotoOfferInput,
  isPhotoFileName,
  isPhotoSeed,
  PHOTO_BODY_NEGATIVE_TAGS,
  PHOTO_KINDS,
  photoFileMessageOf,
  photoFileName,
  photoSeed,
  readMessagePhoto,
  swappedPhoto,
  type MessagePhoto,
  type PhotoGroups
} from '@shared/photos'
import { AUTOSAVE_ID, type ChatMessage, type SaveDraft } from '@shared/types'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { emptyFlags } from '@shared/relationship'
import { character, record } from './fixtures'

let root = ''
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => root, getPath: () => root }
}))

const saveService = await import('../src/main/services/saveService')
const { getSaveFilePath } = await import('../src/main/paths')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'venus-university-photos-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const HER = character({ charId: 'her', firstName: 'Maya' })

/** A photo as a reply settles one. */
function photo(over: Partial<MessagePhoto> = {}): MessagePhoto {
  return { ...settleMessagePhoto(HER, 'selfie', 'agora', true, 'rain', 42), ...over }
}

/** One of her texts, carrying `value` as its photo field. */
function text(value: unknown): ChatMessage {
  return {
    id: 'b6f1c2e0-1111-4a2b-9c3d-000000000001',
    sender: 'contact',
    text: 'hi',
    date: 3,
    time: 1,
    photo: value
  }
}

describe('what a save keeps of a photo', () => {
  it('keeps the choices, the seed, the groups as written and the prompts written from them', () => {
    const settled = settleMessagePhoto(HER, 'selfie', 'agora', true, 'rain', 42)
    const draft = photoDraft(HER, {
      kind: 'selfie',
      outfit: 'main',
      place: 'agora',
      night: true,
      weather: 'rain'
    })
    expect(settled).toEqual({
      kind: 'selfie',
      seed: 42,
      place: 'agora',
      outfit: 'main',
      night: true,
      weather: 'rain',
      prompts: buildPhotoPrompts(draft),
      draft
    })
  })

  it('dresses her by the place', () => {
    expect(settleMessagePhoto(HER, 'mirror', 'selkie_beach', false, 'clear', 1).outfit).toBe('swim')
  })

  it('steers her photos away from stains on her body, and never food or a place', () => {
    for (const tag of PHOTO_BODY_NEGATIVE_TAGS) {
      expect(photo().prompts.negative.split(', ')).toContain(tag)
    }
    for (const kind of ['food', 'place'] as const) {
      const negative = settleMessagePhoto(HER, kind, 'agora', false, 'clear', 1).prompts.negative
      expect(negative.split(', ')).not.toContain('cream')
    }
  })
})

/** A photo's groups with one tag added to its framing: the same photo posed otherwise. */
function reposed(groups: PhotoGroups): PhotoGroups {
  return { ...groups, framing: [...groups.framing, 'from_side'] }
}

describe('photo file names', () => {
  const prompts = { positive: 'solo, selfie', negative: 'lowres', detailerPositive: 'solo' }

  it('names one version by its message, its seed and a code of its prompts', () => {
    // Pinned: a code that changed would leave every photo on disk unread and redrawn.
    expect(photoFileName({ messageId: 'abc-123', seed: 7, prompts })).toBe(
      'abc-123-7-0929b18a1f4b70.png'
    )
    expect(isPhotoFileName(photoFileName({ messageId: 'abc-123', seed: 7, prompts })!)).toBe(true)
  })

  it('names the same version the same every time', () => {
    const settled = photo()
    const ref = { messageId: 'abc', seed: settled.seed, prompts: settled.prompts }
    expect(photoFileName(ref)).toBe(photoFileName({ ...ref, prompts: { ...settled.prompts } }))
  })

  it('names two versions under one seed apart where their tags differ', () => {
    const settled = photo()
    const other = regeneratedPhoto(settled, reposed(settled.draft!), settled.seed, settled.draft!)
    expect(other.seed).toBe(settled.seed)
    expect(photoFileName({ messageId: 'abc', seed: other.seed, prompts: other.prompts })).not.toBe(
      photoFileName({ messageId: 'abc', seed: settled.seed, prompts: settled.prompts })
    )
    for (const field of ['positive', 'negative', 'detailerPositive'] as const) {
      const changed = { ...prompts, [field]: `${prompts[field]}, x` }
      expect(photoFileName({ messageId: 'abc', seed: 7, prompts: changed })).not.toBe(
        photoFileName({ messageId: 'abc', seed: 7, prompts })
      )
    }
  })

  it('refuses an id or a seed that cannot be one', () => {
    for (const id of ['../x', '..', 'a/b', 'a\\b', '', 'a.b']) {
      expect(photoFileName({ messageId: id, seed: 1, prompts })).toBeNull()
    }
    for (const seed of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(photoFileName({ messageId: 'abc', seed, prompts })).toBeNull()
    }
  })

  it('accepts only the exact name, the names of before left out', () => {
    const name = photoFileName({ messageId: 'abc', seed: 7, prompts })!
    const code = name.slice('abc-7-'.length, -'.png'.length)
    for (const bad of [
      'abc-7.png',
      `abc-07-${code}.png`,
      `abc-7-${code}.PNG`,
      `abc-7-${code.toUpperCase()}.png`,
      `../abc-7-${code}.png`,
      `abc-7-${code}.png.partial`,
      `abc-7-${code.slice(1)}.png`
    ]) {
      expect(isPhotoFileName(bad)).toBe(false)
    }
    expect(photoFileMessageOf(name)).toBe('abc')
  })
})

describe('photo seeds', () => {
  it('takes the largest safe integer whole, through JSON and into a name', () => {
    const max = Number.MAX_SAFE_INTEGER
    expect(isPhotoSeed(max)).toBe(true)
    expect(JSON.parse(JSON.stringify({ seed: max })).seed).toBe(max)
    const name = photoFileName({ messageId: 'abc', seed: max, prompts: photo().prompts })
    expect(isPhotoFileName(name!)).toBe(true)
    expect(isPhotoSeed(max + 1)).toBe(false)
  })

  it('rolls below the limit with the roll at its highest', () => {
    const seed = photoSeed(() => 1 - Number.EPSILON)
    expect(seed).toBeLessThan(Number.MAX_SAFE_INTEGER)
    expect(isPhotoSeed(seed)).toBe(true)
  })
})

describe('regenerating a photo', () => {
  it('changes the seed, the groups and the prompts written from them, and never what it is', () => {
    const settled = photo()
    const groups = reposed(settled.draft!)
    const next = regeneratedPhoto(settled, groups, 99, settled.draft!)
    expect(next).toEqual({ ...settled, seed: 99, prompts: buildPhotoPrompts(groups), groups })
  })

  it('keeps no groups once they are the draft again', () => {
    const settled = photo()
    const edited = regeneratedPhoto(settled, reposed(settled.draft!), 99, settled.draft!)
    const reset = regeneratedPhoto(edited, settled.draft!, 5, settled.draft!)
    expect(reset).toEqual({ ...settled, seed: 5 })
    expect('groups' in reset).toBe(false)
  })

  it('gives a photo settled without a draft the one it is redrawn against', () => {
    const { draft, ...older } = photo()
    const next = regeneratedPhoto(older, reposed(draft!), 99, draft!)
    expect(next.draft).toEqual(draft)
  })

  it('swaps the message only while it still carries the version it began from', () => {
    const settled = photo()
    const next = regeneratedPhoto(settled, reposed(settled.draft!), 99, settled.draft!)
    expect(swappedPhoto(settled, settled, next)).toEqual(next)
    // A copy read back from a save is the same version.
    expect(swappedPhoto(JSON.parse(JSON.stringify(settled)), settled, next)).toEqual(next)
    // Another version under the same seed, another seed, no photo and a broken field.
    const sideways = regeneratedPhoto(
      settled,
      { ...settled.draft!, place: ['beach'] },
      42,
      settled.draft!
    )
    for (const current of [sideways, { ...settled, seed: 7 }, undefined, { kind: 'selfie' }]) {
      expect(swappedPhoto(current, settled, next)).toBeNull()
    }
  })
})

describe('reading a message photo', () => {
  it('reads a message without one as no photo', () => {
    const bare: ChatMessage = { id: 'abc', sender: 'contact', text: 'hi', date: 0, time: 0 }
    expect(readMessagePhoto(bare.photo)).toBeNull()
  })

  it('reads a field that does not read whole as no photo', () => {
    const broken: unknown[] = [
      null,
      'selfie',
      { ...photo(), kind: 'portrait' },
      { ...photo(), seed: -1 },
      { ...photo(), seed: '42' },
      { ...photo(), outfit: 'nude' },
      { ...photo(), weather: 'snow' },
      { ...photo(), night: 'yes' },
      { ...photo(), prompts: { positive: 'x' } },
      { ...photo(), draft: { base: ['x'] } },
      { ...photo(), groups: { ...photo().draft!, framing: [1] } },
      { ...photo(), groups: null }
    ]
    for (const value of broken) expect(readMessagePhoto(value)).toBeNull()
  })

  it('reads a whole one as it is', () => {
    expect(readMessagePhoto(photo())).toEqual(photo())
  })

  it('reads a photo settled before it kept its groups', () => {
    const { draft: _draft, ...older } = photo()
    expect(readMessagePhoto(older)).toEqual(older)
  })
})

describe('a photo through the save', () => {
  /** Writes a save holding these texts and reads it back from the file, not from memory. */
  async function throughSave(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const base = useGameStore.getState().toGameSave()
    const draft: SaveDraft = {
      ...base,
      bunnyboard: {
        ...base.bunnyboard,
        conversations: { her: { charId: 'her', messages, unread: 0, summary: null } }
      }
    }
    const { save } = await saveService.createPlaythrough(record(), draft)
    await saveService.writeAutosave(save.playthroughId, draft)
    // A changed stamp, so the read parses the file rather than answering what the write kept.
    const later = new Date(Date.now() + 60_000)
    await utimes(getSaveFilePath(save.playthroughId, AUTOSAVE_ID), later, later)
    const read = await saveService.loadSave(save.playthroughId, AUTOSAVE_ID)
    return read.bunnyboard.conversations.her!.messages
  }

  it('comes back the same', async () => {
    const sent = text(photo({ seed: Number.MAX_SAFE_INTEGER }))
    expect(await throughSave([sent])).toEqual([sent])
  })

  it('comes back the same regenerated, named as it was', async () => {
    const settled = photo()
    const regenerated = regeneratedPhoto(settled, reposed(settled.draft!), 7, settled.draft!)
    const sent = text(regenerated)
    const [back] = await throughSave([sent])
    expect(back).toEqual(sent)
    const read = readMessagePhoto(back!.photo)!
    expect(read.groups).toEqual(reposed(settled.draft!))
    expect(photoFileName({ messageId: back!.id, seed: read.seed, prompts: read.prompts })).toBe(
      photoFileName({ messageId: sent.id, seed: 7, prompts: regenerated.prompts })
    )
  })

  it('keeps a field that does not read as it was, and loads', async () => {
    const sent = text({ kind: 'selfie', seed: 'broken' })
    const [back] = await throughSave([sent])
    expect(back).toEqual(sent)
    expect(readMessagePhoto(back!.photo)).toBeNull()
  })
})

describe('which photos she may send', () => {
  /** A woman with no standing with the reader, in her room, the setting off. */
  function her(over: Partial<PhotoOfferInput> = {}): PhotoOfferInput {
    return {
      gender: 'woman',
      flags: emptyFlags(),
      location: 'room',
      away: false,
      noNsfwImages: false,
      ...over
    }
  }
  const lover = { ...emptyFlags(), isLover: true }

  it('offers anyone the everyday kinds, and the adult ones only to those open with him', () => {
    expect(photoOfferFor(her()).kinds).toEqual(['selfie', 'mirror', 'food', 'place'])
    const crush = { ...emptyFlags(), hasCrush: true }
    for (const flags of [lover, crush, { ...emptyFlags(), benefits: true }]) {
      expect(photoOfferFor(her({ flags })).kinds).toEqual([...PHOTO_KINDS])
    }
  })

  it('withholds the adult kinds across a friendzone, crush and all', () => {
    for (const zone of ['friendZoned', 'friendZonedBy'] as const) {
      const offer = photoOfferFor(her({ flags: { ...emptyFlags(), hasCrush: true, [zone]: true } }))
      expect(offer.kinds).toEqual(['selfie', 'mirror', 'food', 'place'])
      expect(offer.refused.nude).toBe('a friendzone stands between them')
    }
  })

  it('withholds the adult kinds away from home and the private places, nowhere included', () => {
    expect(photoOfferFor(her({ flags: lover, location: 'hotel_dreams' })).kinds).toContain('nude')
    for (const location of ['agora', 'not_a_place', null]) {
      const offer = photoOfferFor(her({ flags: lover, location }))
      expect(offer.kinds).not.toContain('sexy')
      expect(offer.refused.sexy).toBe('not at home or somewhere private')
    }
    // Nowhere is drawn as her room, and is still no home.
    expect(photoOfferFor(her({ flags: lover, location: null })).place).toBe('room')
  })

  it('withholds the adult kinds under the no-NSFW-images setting', () => {
    const offer = photoOfferFor(her({ flags: lover, noNsfwImages: true }))
    expect(offer.kinds).toEqual(['selfie', 'mirror', 'food', 'place'])
    expect(offer.refused.sexy).toBe('the no-NSFW-images setting')
  })

  it('offers the mirror only at home, somewhere private or a place with one', () => {
    for (const location of ['room', 'hotel_dreams', 'palaestra_stadium']) {
      expect(photoOfferFor(her({ location })).kinds).toContain('mirror')
    }
    const park = photoOfferFor(her({ location: 'green_hill_park' }))
    expect(park.refused.mirror).toBe('no mirror where she is')
    expect(photoOfferFor(her({ location: null })).refused.mirror).toBe('the map places her nowhere')
  })

  it('offers nothing from a man, from one who blocked him or from one away on break', () => {
    for (const input of [
      her({ gender: 'man', flags: lover }),
      her({ flags: { ...lover, blocked: true } }),
      her({ flags: lover, away: true, location: null })
    ]) {
      const offer = photoOfferFor(input)
      expect(offer.kinds).toEqual([])
      expect(Object.keys(offer.refused)).toEqual([...PHOTO_KINDS])
    }
  })
})

describe('the kind a reply chose', () => {
  it('keeps only a kind this call offered', () => {
    expect(chosenPhotoKind('selfie', ['selfie', 'food'])).toBe('selfie')
    for (const value of ['none', 'nude', 'portrait', '', 3, null, undefined]) {
      expect(chosenPhotoKind(value, ['selfie', 'food'])).toBeNull()
    }
  })
})
