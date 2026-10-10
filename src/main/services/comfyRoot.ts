import { existsSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { gameFolderOf, gameNamedBy } from '@shared/comfyPort'
import { getOwnComfyUiPath } from '../paths'

/**
 * Choosing another game's ComfyUI: what a picked folder is, and who a chosen one belongs to.
 * Nothing here writes; the choice is recorded by the settings.
 */

/** Where a game keeps its ComfyUI, from its own folder. */
const COMFY_TAIL = join('data', 'services', 'comfyui')

/** What picking a folder came to. */
export type ComfyPick =
  | { kind: 'own' }
  | { kind: 'invalid' }
  | { kind: 'chosen'; comfyPath: string }

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** The program files a game's folder holds, or none where it cannot be read. */
function namesIn(folder: string): string[] {
  try {
    return readdirSync(folder)
  } catch {
    return []
  }
}

/**
 * The ComfyUI a picked folder stands for: the game's own folder, whose `data/services/comfyui`
 * is taken, or that folder itself. It has to belong to a game this one knows by its program
 * file, so that what is chosen is another game's install and not any ComfyUI on the disk.
 */
export function resolveComfyPick(picked: string): ComfyPick {
  const folder = resolve(picked)
  const comfyPath = folder.toLowerCase().endsWith(COMFY_TAIL.toLowerCase())
    ? folder
    : join(folder, COMFY_TAIL)

  if (comfyPath.toLowerCase() === getOwnComfyUiPath().toLowerCase()) return { kind: 'own' }
  if (!isDirectory(comfyPath)) return { kind: 'invalid' }

  const game = gameFolderOf(join(comfyPath, 'python_embeded', 'python.exe'))
  if (game === null || gameNamedBy(namesIn(game)) === null) return { kind: 'invalid' }
  return { kind: 'chosen', comfyPath }
}

/** Whose ComfyUI a chosen root is, and whether it is still there. */
export function describeComfyRoot(comfyPath: string): {
  game: string | null
  folder: string
  present: boolean
} {
  const folder = gameFolderOf(join(comfyPath, 'python_embeded', 'python.exe')) ?? comfyPath
  return {
    game: gameNamedBy(namesIn(folder)),
    folder,
    present: existsSync(comfyPath) && isDirectory(comfyPath)
  }
}
