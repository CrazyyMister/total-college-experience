import { mkdtemp, rm, utimes } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPhotoPrompts, photoDraft, settleMessagePhoto } from '@shared/imagePrompt'
import {
  isPhotoFileName,
  isPhotoSeed,
  PHOTO_BODY_NEGATIVE_TAGS,
  photoFileName,
  photoSeed,
  readMessagePhoto,
  type MessagePhoto
} from '@shared/photos'
import { AUTOSAVE_ID, type ChatMessage, type SaveDraft } from '@shared/types'
import { useGameStore } from '../src/renderer/stores/gameStore'
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
  it('keeps the choices, the seed and the prompts written from them', () => {
    const settled = settleMessagePhoto(HER, 'selfie', 'agora', true, 'rain', 42)
    expect(settled).toEqual({
      kind: 'selfie',
      seed: 42,
      place: 'agora',
      outfit: 'main',
      night: true,
      weather: 'rain',
      prompts: buildPhotoPrompts(
        photoDraft(HER, { kind: 'selfie', outfit: 'main', place: 'agora', night: true, weather: 'rain' })
      )
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

describe('photo file names', () => {
  it('names a photo by its message and seed', () => {
    expect(photoFileName('abc-123', 7)).toBe('abc-123-7.png')
    expect(isPhotoFileName('abc-123-7.png')).toBe(true)
  })

  it('refuses an id or a seed that cannot be one', () => {
    for (const id of ['../x', '..', 'a/b', 'a\\b', '', 'a.b']) expect(photoFileName(id, 1)).toBeNull()
    for (const seed of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(photoFileName('abc', seed)).toBeNull()
    }
  })

  it('accepts only the exact name', () => {
    for (const name of ['abc-07.png', 'abc-7.PNG', '../abc-7.png', 'abc-7.png.partial', 'abc.png']) {
      expect(isPhotoFileName(name)).toBe(false)
    }
  })
})

describe('photo seeds', () => {
  it('takes the largest safe integer whole, through JSON and into a name', () => {
    const max = Number.MAX_SAFE_INTEGER
    expect(isPhotoSeed(max)).toBe(true)
    expect(JSON.parse(JSON.stringify({ seed: max })).seed).toBe(max)
    expect(isPhotoFileName(photoFileName('abc', max)!)).toBe(true)
    expect(isPhotoSeed(max + 1)).toBe(false)
  })

  it('rolls below the limit with the roll at its highest', () => {
    const seed = photoSeed(() => 1 - Number.EPSILON)
    expect(seed).toBeLessThan(Number.MAX_SAFE_INTEGER)
    expect(isPhotoSeed(seed)).toBe(true)
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
      { ...photo(), prompts: { positive: 'x' } }
    ]
    for (const value of broken) expect(readMessagePhoto(value)).toBeNull()
  })

  it('reads a whole one as it is', () => {
    expect(readMessagePhoto(photo())).toEqual(photo())
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

  it('keeps a field that does not read as it was, and loads', async () => {
    const sent = text({ kind: 'selfie', seed: 'broken' })
    const [back] = await throughSave([sent])
    expect(back).toEqual(sent)
    expect(readMessagePhoto(back!.photo)).toBeNull()
  })
})
