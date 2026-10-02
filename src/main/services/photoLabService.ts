import { access, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { appError } from '@shared/errors'
import type { PhotoLabRequest } from '@shared/imagePrompt'
import { getPhotoLabPath } from '../paths'
import { generatePhoto } from './comfyService'

/**
 * The development build's photo lab on disk: each render a PNG in `data/tmp/photo-lab` named
 * for what was chosen, with a text file beside it holding the prompts and the seed.
 */

/** A stem the lab may write under: lowercase letters, digits, dashes and underscores. */
const STEM = /^[a-z0-9][a-z0-9_-]{0,150}$/

/** A file the lab wrote and may read back: a stem, its seed and an optional repeat count. */
const LAB_FILE = /^[a-z0-9][a-z0-9_-]{0,200}\.png$/

/** The first `{stem}-{seed}.png` not already on disk, counting up from a second copy. */
async function freeName(dir: string, stem: string, seed: number): Promise<string> {
  for (let copy = 1; ; copy++) {
    const name = copy === 1 ? `${stem}-${seed}.png` : `${stem}-${seed}-${copy}.png`
    try {
      await access(join(dir, name))
    } catch {
      return name
    }
  }
}

/** Renders one lab photo and writes its text file beside it; answers the PNG's file name. */
export async function renderLabPhoto(
  request: PhotoLabRequest,
  options: { signal?: AbortSignal; onProgress?: (step: string) => void }
): Promise<string> {
  if (!STEM.test(request.stem)) {
    throw appError('PHOTO_LAB_NAME', 'That photo name cannot be written.', request.stem)
  }
  const dir = getPhotoLabPath()
  await mkdir(dir, { recursive: true })
  const file = await freeName(dir, request.stem, request.seed)

  await generatePhoto(
    request.prompts,
    request.seed,
    request.refine,
    join(dir, file),
    `photo-lab / ${file}`,
    options
  )

  const text = [
    ...request.notes,
    `Refine pass: ${request.refine ? 'yes' : 'no'}`,
    `Seed: ${request.seed}`,
    '',
    'Positive:',
    request.prompts.positive,
    '',
    'Negative:',
    request.prompts.negative,
    '',
    'Face pass:',
    request.prompts.detailerPositive,
    ''
  ].join('\n')
  await writeFile(join(dir, file.replace(/\.png$/, '.txt')), text, 'utf-8')
  return file
}

/** The bytes of one picture the lab wrote. */
export async function readLabPhoto(file: string): Promise<Uint8Array> {
  if (!LAB_FILE.test(file)) {
    throw appError('PHOTO_LAB_NAME', 'That is not a photo lab file.', file)
  }
  return new Uint8Array(await readFile(join(getPhotoLabPath(), file)))
}

/** Empties the lab's folder. */
export async function clearLabPhotos(): Promise<void> {
  await rm(getPhotoLabPath(), { recursive: true, force: true })
}

/** The lab's folder, made if it is not there yet, for the file browser to open. */
export async function labPhotoFolder(): Promise<string> {
  const dir = getPhotoLabPath()
  await mkdir(dir, { recursive: true })
  return dir
}
