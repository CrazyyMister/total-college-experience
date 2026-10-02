import { randomUUID } from 'crypto'
import { access, mkdir, readdir, readFile, rename, rm, unlink } from 'fs/promises'
import { join } from 'path'
import { appError, messageOf } from '@shared/errors'
import { imageTypeOf } from '@shared/imageBytes'
import { cancelGroup, cancelKeys, enqueue } from '@shared/jobQueue'
import {
  isAdultPhoto,
  isPhotoFileName,
  PHOTO_KINDS,
  photoFileName,
  type PhotoRef,
  type PhotoRenderRequest
} from '@shared/photos'
import { getPhotoTempPath, getPlaythroughPhotosPath } from '../paths'
import { generatePhoto, start as startComfy } from './comfyService'
import { assertSafePlaythroughId } from './saveService'
import { getSettings } from './settingsService'

/**
 * The photos characters text, on disk: each drawn into `data/tmp` and moved under its
 * playthrough's `photos` folder as `{messageId}-{seed}-{code}.png` only once it is whole, wanted
 * and a PNG; each version of a photo has a file of its own.
 */

/** One photo queued or drawing, keyed `{playthroughId}/{file}`. */
interface PhotoInFlight {
  playthroughId: string
  file: string
  adult: boolean
  done: Promise<void>
}

const inFlight = new Map<string, PhotoInFlight>()

/** The job group a playthrough's photos are queued under. */
function groupOf(playthroughId: string): string {
  return `photo:${playthroughId}`
}

/**
 * The file a version of a photo is kept in, named here off its prompts, or a permanent failure
 * for an id, a seed or prompts that cannot name one.
 */
function fileOf(ref: PhotoRef): string {
  const prompts = ref.prompts as Partial<Record<keyof PhotoRef['prompts'], unknown>> | undefined
  const file =
    typeof prompts?.positive === 'string' &&
    typeof prompts.negative === 'string' &&
    typeof prompts.detailerPositive === 'string'
      ? photoFileName(ref)
      : null
  if (file === null) {
    throw appError('PHOTO_NAME_INVALID', 'That photo cannot be named.', `${ref.messageId}-${ref.seed}`)
  }
  return file
}

/**
 * Queues one photo, or answers the job already queued for it. The job draws into a temporary
 * file and moves it into place only while it is still wanted, its playthrough's folder is still
 * there and its bytes are a PNG; whatever fails, the temporary file goes.
 */
export function renderTextPhoto(request: PhotoRenderRequest): Promise<void> {
  assertSafePlaythroughId(request.playthroughId)
  const file = fileOf(request)
  if (!(PHOTO_KINDS as readonly string[]).includes(request.kind)) {
    throw appError('PHOTO_NAME_INVALID', 'That is not a kind of photo.', String(request.kind))
  }
  const id = `${request.playthroughId}/${file}`
  const queued = inFlight.get(id)
  if (queued) return queued.done

  const adult = isAdultPhoto(request.kind)
  const done = enqueue<void>({
    group: groupOf(request.playthroughId),
    key: file,
    run: async ({ signal, report }) => {
      // Read at its turn, so a setting switched on while it waited is obeyed.
      if (adult && (await getSettings()).noNsfwImages) throw appError('CANCELLED', 'The photo was cancelled.')
      const dir = getPlaythroughPhotosPath(request.playthroughId)
      const final = join(dir, file)
      if (await access(final).then(() => true, () => false)) return
      report('Waiting for ComfyUI')
      await startComfy((step) => report(step))
      await drawPhoto(request, dir, final, signal, report)
    }
  }).finally(() => inFlight.delete(id))
  inFlight.set(id, { playthroughId: request.playthroughId, file, adult, done })
  return done
}

/** Draws one photo into `data/tmp` and moves it to `final` if it is still wanted. */
async function drawPhoto(
  request: PhotoRenderRequest,
  dir: string,
  final: string,
  signal: AbortSignal,
  report: (step: string) => void
): Promise<void> {
  const temp = join(getPhotoTempPath(), `${randomUUID()}.png`)
  try {
    await generatePhoto(
      request.prompts,
      request.seed,
      true,
      temp,
      `photo / ${request.playthroughId}/${request.messageId}`,
      { signal, onProgress: report }
    )
    if (signal.aborted) throw appError('CANCELLED', 'The photo was cancelled.')
    const bytes = await readFile(temp)
    if (imageTypeOf(bytes) !== 'image/png') {
      throw appError('PHOTO_NOT_PNG', 'ComfyUI answered with something that is not a PNG.')
    }
    // Never recursive: a playthrough deleted while this drew is not made again.
    try {
      await mkdir(dir)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw appError('PHOTO_PLAYTHROUGH_GONE', 'The playthrough this photo was for is gone.')
      }
      if (code !== 'EEXIST') throw err
    }
    if (signal.aborted) throw appError('CANCELLED', 'The photo was cancelled.')
    await rename(temp, final)
  } finally {
    await rm(temp, { force: true })
  }
}

/** A photo's bytes, or `null` where its file is not there. */
export async function readTextPhoto(playthroughId: string, ref: PhotoRef): Promise<Uint8Array | null> {
  assertSafePlaythroughId(playthroughId)
  try {
    return new Uint8Array(await readFile(join(getPlaythroughPhotosPath(playthroughId), fileOf(ref))))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** The photo files a playthrough holds, by name. */
export async function listTextPhotos(playthroughId: string): Promise<string[]> {
  assertSafePlaythroughId(playthroughId)
  try {
    return (await readdir(getPlaythroughPhotosPath(playthroughId))).filter(isPhotoFileName)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw appError('PHOTO_NAME_INVALID', 'Could not read the photos folder.', messageOf(err))
  }
}

/** Removes these photos' files; one already gone is success. */
export async function deleteTextPhotos(playthroughId: string, refs: PhotoRef[]): Promise<void> {
  assertSafePlaythroughId(playthroughId)
  const dir = getPlaythroughPhotosPath(playthroughId)
  for (const ref of refs) {
    await unlink(join(dir, fileOf(ref))).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err
    })
  }
}

/** Cancels these photos of a playthrough, the one drawing included, if they are queued at all. */
export async function cancelTextPhotos(playthroughId: string, refs: PhotoRef[]): Promise<void> {
  assertSafePlaythroughId(playthroughId)
  await cancelKeys(groupOf(playthroughId), refs.map(fileOf))
}

/** Cancels a playthrough's photos, resolving once the one drawing has settled. */
export function cancelPlaythroughPhotos(playthroughId: string): Promise<void> {
  return cancelGroup(groupOf(playthroughId))
}

/** Cancels every photo of every playthrough, resolving once the one drawing has settled. */
export async function cancelAllPhotos(): Promise<void> {
  const playthroughs = new Set([...inFlight.values()].map((photo) => photo.playthroughId))
  await Promise.all([...playthroughs].map((playthroughId) => cancelPlaythroughPhotos(playthroughId)))
}

/** Cancels every sexy and nude photo, the one drawing included. */
export async function cancelAdultPhotos(): Promise<void> {
  const adult = [...inFlight.values()].filter((photo) => photo.adult)
  await Promise.all(adult.map((photo) => cancelKeys(groupOf(photo.playthroughId), [photo.file])))
}
