/** The games that run their own ComfyUI from a `data\services\comfyui` beside their program file. */
const GAME_EXES: readonly { exe: string; name: string }[] = [
  { exe: 'Total College Experience.exe', name: 'Total College Experience' },
  { exe: 'Venus University.exe', name: 'Venus University' }
]

/** The segment that sits between a game's folder and its ComfyUI's interpreter. */
const COMFY_SEGMENT = /[\\/]data[\\/]services[\\/]comfyui[\\/]/i

/**
 * The folder of the game a ComfyUI interpreter belongs to — whatever stands before its
 * `data\services\comfyui` — or `null` for a path that is not laid out that way, which is what
 * a link resolved to the project's own folder looks like.
 */
export function gameFolderOf(pythonPath: string): string | null {
  const match = COMFY_SEGMENT.exec(pythonPath)
  return match === null ? null : pythonPath.slice(0, match.index)
}

/** The name of the game whose program file `names` holds, or `null` when it holds none of them. */
export function gameNamedBy(names: readonly string[]): string | null {
  const held = new Set(names.map((name) => name.toLowerCase()))
  return GAME_EXES.find((game) => held.has(game.exe.toLowerCase()))?.name ?? null
}
