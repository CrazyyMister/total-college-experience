import {
  isAdultPhoto,
  photoCode,
  photoFileMessageOf,
  photoFileName,
  readMessagePhoto,
  type MessagePhoto,
  type PhotoKind
} from '@shared/photos'
import { isWebBuild } from '../platform'
import { useGameStore } from './gameStore'
import type { DebugResult } from './npcRomanceDebugActions'
import { forgetPhotos, photoViewKey, regenKey, usePhotoStore } from './photoStore'
import { noNsfwImagesOf, useSettingsStore } from './settingsStore'
import { armedPhotoOf, armPhoto } from './textingLoop'

/**
 * What the development build's photo buttons do to a game, and what its read-out says about the
 * photos in one conversation. Each button answers with what it did or why it would not.
 */

const refused = (text: string): DebugResult => ({ ok: false, text })
const done = (text: string): DebugResult => ({ ok: true, text })
const NOT_DEV: DebugResult = refused('Only in the development build.')

/** Has X's next reply carry a photo of `kind`, refused where the game would never draw one. */
export function debugArmPhoto(charId: string, kind: PhotoKind): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  if (isWebBuild()) return refused('The browser draws no photos.')
  const character = useGameStore.getState().characters[charId]
  if (!character) return refused('Pick a character.')
  if (character.gender === 'man') return refused('Men send no photos.')
  if (isAdultPhoto(kind) && noNsfwImagesOf(useSettingsStore.getState())) {
    return refused(`The no-NSFW-images setting withholds the ${kind} photo.`)
  }
  armPhoto(charId, kind)
  return done(`${character.firstName}'s next reply sends a ${kind} photo.`)
}

/** One photo in a conversation, as the read-out lists it. */
export interface PhotoDebugRow {
  key: string
  text: string
}

/** The photos in X's conversation, oldest first, each read whole or not at all. */
function photosOf(charId: string): { messageId: string; photo: MessagePhoto }[] {
  const messages = useGameStore.getState().bunnyboard.conversations[charId]?.messages ?? []
  return messages.flatMap((message) => {
    const photo = readMessagePhoto(message.photo)
    return photo ? [{ messageId: message.id, photo }] : []
  })
}

/**
 * The read-out for X: the kind armed for the next reply, then each photo in the conversation as
 * its version shown — its seed and code, whether its tags were rewritten, whether its file is
 * among `files`, where its job and its regeneration stand on screen — and how many other
 * versions of it `files` holds.
 */
export function photoRowsOf(charId: string, files: ReadonlySet<string>): PhotoDebugRow[] {
  const playthroughId = useGameStore.getState().playthroughId ?? ''
  const { views, regens } = usePhotoStore.getState()
  const armed = armedPhotoOf(charId)
  const rows: PhotoDebugRow[] = [
    { key: 'armed', text: `Next reply: ${armed === null ? 'no photo' : `a ${armed} photo`}` }
  ]
  for (const { messageId, photo } of photosOf(charId)) {
    const file = photoFileName({ messageId, seed: photo.seed, prompts: photo.prompts })
    const view = views[photoViewKey(playthroughId, messageId, photo)]
    const regen = regens[regenKey(playthroughId, messageId)]
    const others = [...files].filter(
      (name) => name !== file && photoFileMessageOf(name) === messageId
    )
    const present = file !== null && files.has(file)
    rows.push({
      key: messageId,
      text:
        `${photo.kind} · seed ${photo.seed} · code ${photoCode(photo.prompts)} · ` +
        `tags ${photo.groups ? 'rewritten' : 'as drawn'} · ` +
        `file ${present ? 'present' : 'missing'} · job ${view?.status ?? 'none'} · ` +
        `regeneration ${regen?.status ?? 'none'} · ${others.length} other version(s) on disk`
    })
  }
  return rows
}

/**
 * Deletes the file of the version shown of every photo in X's conversation, for its next opening
 * to redraw them; their other versions stay.
 */
export async function debugDeletePhotos(charId: string): Promise<DebugResult> {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const playthroughId = game.playthroughId
  const character = game.characters[charId]
  if (!playthroughId || !character) return refused('Pick a character.')
  const photos = photosOf(charId)
  const result = await window.api.photos.deleteFiles(
    playthroughId,
    photos.map(({ messageId, photo }) => ({ messageId, seed: photo.seed, prompts: photo.prompts }))
  )
  if (!result.ok) return refused(result.error.message)
  forgetPhotos(photos.map(({ messageId, photo }) => photoViewKey(playthroughId, messageId, photo)))
  return done(
    `Deleted the files of ${photos.length} photo(s) of ${character.firstName}'s; opening the conversation redraws them.`
  )
}
