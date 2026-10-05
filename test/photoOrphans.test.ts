import { describe, expect, it } from 'vitest'
import { settleMessagePhoto } from '@shared/imagePrompt'
import { photoOrphans, type PhotoMessage, type PhotoSave } from '@shared/photoOrphans'
import { photoFileName, type MessagePhoto } from '@shared/photos'
import { character } from './fixtures'

const HER = character({ charId: 'her', firstName: 'Maya' })
const MESSAGE = 'b6f1c2e0-1111-4a2b-9c3d-000000000001'

/** A photo as a reply settles one, under `seed`. */
function photo(seed: number): MessagePhoto {
  return settleMessagePhoto(HER, 'selfie', 'agora', true, 'rain', seed)
}

/** The file a message's photo is kept in. */
function fileOf(id: string, value: MessagePhoto): string {
  return photoFileName({ messageId: id, seed: value.seed, prompts: value.prompts })!
}

/** A save holding these messages. */
function save(saveId: string, ...messages: PhotoMessage[]): PhotoSave {
  return { saveId, messages }
}

describe('which photo files no save names', () => {
  it('keeps a photo any kind of save names', () => {
    const [a, b, c] = [photo(1), photo(2), photo(3)]
    const saves = [
      save('1790000000001', { id: 'm1', photo: a }),
      save('autosave', { id: 'm2', photo: b }),
      save('manual01', { id: 'm3', photo: c })
    ]
    const files = [fileOf('m1', a), fileOf('m2', b), fileOf('m3', c)]
    expect(photoOrphans(saves, files)).toEqual({ orphans: [] })
  })

  it('keeps the old version a save still shows and drops the one none does', () => {
    const [old, regenerated, lost] = [photo(1), photo(2), photo(3)]
    const saves = [
      save('manual01', { id: MESSAGE, photo: old }),
      save('autosave', { id: MESSAGE, photo: regenerated })
    ]
    const files = [fileOf(MESSAGE, old), fileOf(MESSAGE, regenerated), fileOf(MESSAGE, lost)]
    expect(photoOrphans(saves, files)).toEqual({ orphans: [fileOf(MESSAGE, lost)] })
  })

  it('keeps every file of a message whose photo field does not read whole', () => {
    const shown = photo(1)
    const saves = [
      save('autosave', { id: MESSAGE, photo: { kind: 'selfie', seed: 1 } }),
      save('manual01', { id: 'm2', photo: shown })
    ]
    const files = [fileOf(MESSAGE, photo(5)), `${MESSAGE}-4397519901663148.png`, fileOf('m2', shown)]
    expect(photoOrphans(saves, files)).toEqual({ orphans: [] })
    expect(photoOrphans([save('autosave', { id: 'other', photo: 7 })], files)).toEqual({
      orphans: files
    })
  })

  it('drops a file of an old name or another message, and never names a file that is not a png', () => {
    const shown = photo(1)
    const old = `${MESSAGE}-4397519901663148.png`
    const files = [old, 'notes.txt', 'photo.PNG', 'cover.jpg', fileOf('m1', shown)]
    expect(photoOrphans([save('autosave', { id: 'm1', photo: shown })], files)).toEqual({
      orphans: [old]
    })
  })

  it('refuses, naming the save, when any save did not read', () => {
    const shown = photo(1)
    const saves = [
      save('autosave', { id: 'm1', photo: shown }),
      { saveId: 'manual07', messages: null },
      { saveId: 'manual08', messages: null }
    ]
    expect(photoOrphans(saves, [fileOf('m1', shown), fileOf('m2', photo(2))])).toEqual({
      refused: 'manual07'
    })
  })
})
