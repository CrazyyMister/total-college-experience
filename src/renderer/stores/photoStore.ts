import { create } from 'zustand'
import { regeneratedPhoto } from '@shared/imagePrompt'
import {
  isAdultPhoto,
  photoCode,
  readMessagePhoto,
  samePhotoVersion,
  type MessagePhoto,
  type PhotoGroups,
  type PhotoRef
} from '@shared/photos'
import type { ChatMessage } from '@shared/types'
import { isWebBuild } from '../platform'
import { useGameStore } from './gameStore'
import { noNsfwImagesOf, useSettingsStore } from './settingsStore'

/**
 * Where each photo a text carries stands on screen, keyed by playthrough, message and version:
 * still being sent, drawn, or failed; and where each message's regeneration stands. Held in
 * memory for the game that asked, and dropped, its pictures released and its regenerations
 * cancelled, on the way out of it.
 */

/** One photo's state on screen. */
export type PhotoView =
  | { status: 'sending' }
  | { status: 'ready'; url: string }
  | { status: 'failed' }

/** One message's regeneration: on its way, with the version it asked for, or failed. */
export type RegenView =
  | { status: 'running'; playthroughId: string; ref: PhotoRef }
  | { status: 'failed' }

interface PhotoStoreState {
  views: Record<string, PhotoView>
  /** Keyed by playthrough and message. */
  regens: Record<string, RegenView>
}

export const usePhotoStore = create<PhotoStoreState>(() => ({ views: {}, regens: {} }))

/** Bumped by every reset, so a job asked for before it lands nowhere. */
let generation = 0

/** The key one version of a photo is held under: its playthrough, its message, seed and code. */
export function photoViewKey(
  playthroughId: string,
  messageId: string,
  photo: MessagePhoto
): string {
  return `${playthroughId}/${messageId}-${photo.seed}-${photoCode(photo.prompts)}`
}

/** The key a message's regeneration is held under. */
export function regenKey(playthroughId: string, messageId: string): string {
  return `${playthroughId}/${messageId}`
}

/** The file one version of a message's photo is named for. */
function refOf(messageId: string, photo: MessagePhoto): PhotoRef {
  return { messageId, seed: photo.seed, prompts: photo.prompts }
}

/**
 * The photo a message shows: none in the browser, none for a field that does not read whole, and
 * none for an adult kind while the setting withholds them.
 */
export function shownPhotoOf(message: ChatMessage, noNsfwImages: boolean): MessagePhoto | null {
  if (message.photo === undefined || isWebBuild()) return null
  const photo = readMessagePhoto(message.photo)
  if (!photo || (noNsfwImages && isAdultPhoto(photo.kind))) return null
  return photo
}

/** Sets one photo's state, releasing the picture it replaces. */
function setView(key: string, view: PhotoView | null): void {
  usePhotoStore.setState((state) => {
    const old = state.views[key]
    if (old?.status === 'ready' && (view?.status !== 'ready' || view.url !== old.url)) {
      URL.revokeObjectURL(old.url)
    }
    const views = { ...state.views }
    if (view) views[key] = view
    else delete views[key]
    return { views }
  })
}

/** Whether a job asked for under `asked` may still show what it found. */
function stillWanted(asked: number, playthroughId: string): boolean {
  return asked === generation && useGameStore.getState().playthroughId === playthroughId
}

/** Reads a photo's file into a picture; false where the file is not there or will not read. */
async function readInto(
  key: string,
  playthroughId: string,
  message: ChatMessage,
  photo: MessagePhoto,
  asked: number
): Promise<boolean> {
  const found = await window.api.photos.read(playthroughId, refOf(message.id, photo))
  if (!stillWanted(asked, playthroughId)) return true
  if (!found.ok || !found.data) return false
  setView(key, {
    status: 'ready',
    url: URL.createObjectURL(new Blob([found.data], { type: 'image/png' }))
  })
  return true
}

/**
 * Shows one message's photo: its file where it is on disk, and otherwise a job that draws it.
 * One already sent or on its way is left alone; a failed one is tried again only on `retry`.
 * Only the job's own failure marks it failed; a cancelled one is forgotten.
 */
export async function showPhoto(message: ChatMessage, retry: boolean): Promise<void> {
  const playthroughId = useGameStore.getState().playthroughId
  if (!playthroughId) return
  const photo = shownPhotoOf(message, noNsfwImagesOf(useSettingsStore.getState()))
  if (!photo) return
  const key = photoViewKey(playthroughId, message.id, photo)
  const current = usePhotoStore.getState().views[key]
  if (current && (current.status !== 'failed' || !retry)) return

  const asked = generation
  setView(key, { status: 'sending' })
  if (await readInto(key, playthroughId, message, photo, asked)) return

  const drawn = await window.api.photos.render({
    playthroughId,
    messageId: message.id,
    kind: photo.kind,
    seed: photo.seed,
    prompts: photo.prompts
  })
  if (!stillWanted(asked, playthroughId)) return
  if (!drawn.ok) {
    setView(key, drawn.error.code === 'CANCELLED' ? null : { status: 'failed' })
    return
  }
  // A file the job placed that will not read is no failure of the job: the next look tries again.
  if (!(await readInto(key, playthroughId, message, photo, asked))) setView(key, null)
}

/** Sets one message's regeneration state. */
function setRegen(key: string, view: RegenView | null): void {
  usePhotoStore.setState((state) => {
    const regens = { ...state.regens }
    if (view) regens[key] = view
    else delete regens[key]
    return { regens }
  })
}

/**
 * Redraws a message's photo under rewritten groups and a seed, as a new version beside the one
 * shown, which stays on screen and in the message until the new file is in place and reads.
 * Only then is the message swapped to it, and only if it still carries the version this began
 * from; anything else leaves the new file an orphan. A failure leaves the photo as it was, with
 * the regeneration marked failed until the next try or the conversation closing.
 */
export async function regeneratePhoto(
  charId: string,
  message: ChatMessage,
  groups: PhotoGroups,
  seed: number,
  draft: PhotoGroups
): Promise<void> {
  const playthroughId = useGameStore.getState().playthroughId
  if (!playthroughId) return
  const from = shownPhotoOf(message, noNsfwImagesOf(useSettingsStore.getState()))
  if (!from) return
  const key = regenKey(playthroughId, message.id)
  if (usePhotoStore.getState().regens[key]?.status === 'running') return
  const next = regeneratedPhoto(from, groups, seed, draft)
  // The same picture asked for again is no drawing: the message only learns its groups.
  if (samePhotoVersion(from, next)) {
    useGameStore.getState().swapMessagePhoto(charId, message.id, from, next)
    setRegen(key, null)
    return
  }

  const asked = generation
  const ref = refOf(message.id, next)
  setRegen(key, { status: 'running', playthroughId, ref })
  const drawn = await window.api.photos.render({
    playthroughId,
    messageId: message.id,
    kind: next.kind,
    seed: next.seed,
    prompts: next.prompts
  })
  if (!stillWanted(asked, playthroughId)) return
  if (!drawn.ok) {
    setRegen(key, drawn.error.code === 'CANCELLED' ? null : { status: 'failed' })
    return
  }
  const found = await window.api.photos.read(playthroughId, ref)
  if (!stillWanted(asked, playthroughId)) return
  if (!found.ok || !found.data) {
    setRegen(key, { status: 'failed' })
    return
  }
  // The new picture is in hand before the message moves to it, so the bubble never goes blank.
  const shownKey = photoViewKey(playthroughId, message.id, next)
  setView(shownKey, {
    status: 'ready',
    url: URL.createObjectURL(new Blob([found.data], { type: 'image/png' }))
  })
  setRegen(key, null)
  if (useGameStore.getState().swapMessagePhoto(charId, message.id, from, next)) {
    setView(photoViewKey(playthroughId, message.id, from), null)
  } else {
    setView(shownKey, null)
  }
}

/** Forgets the failed regenerations of these messages, as their conversation closes. */
export function forgetRegenFailures(playthroughId: string, messageIds: readonly string[]): void {
  const regens = usePhotoStore.getState().regens
  for (const messageId of messageIds) {
    const key = regenKey(playthroughId, messageId)
    if (regens[key]?.status === 'failed') setRegen(key, null)
  }
}

/** Forgets these photos' states, so the next look at them reads their files again. */
export function forgetPhotos(keys: readonly string[]): void {
  for (const key of keys) setView(key, null)
}

/**
 * Drops every photo's state and releases every picture, on the way out of a game, cancelling the
 * regenerations still on their way: nothing would ever show them.
 */
export function resetPhotos(): void {
  generation += 1
  const { views, regens } = usePhotoStore.getState()
  for (const view of Object.values(views)) {
    if (view.status === 'ready') URL.revokeObjectURL(view.url)
  }
  for (const regen of Object.values(regens)) {
    if (regen.status === 'running') void window.api.photos.cancel(regen.playthroughId, [regen.ref])
  }
  usePhotoStore.setState({ views: {}, regens: {} })
}
