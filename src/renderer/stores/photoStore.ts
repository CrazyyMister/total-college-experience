import { create } from 'zustand'
import { isAdultPhoto, readMessagePhoto, type MessagePhoto } from '@shared/photos'
import type { ChatMessage } from '@shared/types'
import { isWebBuild } from '../platform'
import { useGameStore } from './gameStore'
import { noNsfwImagesOf, useSettingsStore } from './settingsStore'

/**
 * Where each photo a text carries stands on screen, keyed by playthrough, message and seed: still
 * being sent, drawn, or failed. Held in memory for the game that asked, and dropped, its pictures
 * released, on the way out of it.
 */

/** One photo's state on screen. */
export type PhotoView =
  | { status: 'sending' }
  | { status: 'ready'; url: string }
  | { status: 'failed' }

interface PhotoStoreState {
  views: Record<string, PhotoView>
}

export const usePhotoStore = create<PhotoStoreState>(() => ({ views: {} }))

/** Bumped by every reset, so a job asked for before it lands nowhere. */
let generation = 0

/** The key one photo is held under. */
export function photoViewKey(playthroughId: string, messageId: string, seed: number): string {
  return `${playthroughId}/${messageId}-${seed}`
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
  const found = await window.api.photos.read(playthroughId, {
    messageId: message.id,
    seed: photo.seed
  })
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
  const key = photoViewKey(playthroughId, message.id, photo.seed)
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

/** Forgets these photos' states, so the next look at them reads their files again. */
export function forgetPhotos(keys: readonly string[]): void {
  for (const key of keys) setView(key, null)
}

/** Drops every photo's state and releases every picture, on the way out of a game. */
export function resetPhotos(): void {
  generation += 1
  for (const view of Object.values(usePhotoStore.getState().views)) {
    if (view.status === 'ready') URL.revokeObjectURL(view.url)
  }
  usePhotoStore.setState({ views: {} })
}
