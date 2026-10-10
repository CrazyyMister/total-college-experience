import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which folder a player's pick turns into the ComfyUI the game runs: only another game's install,
 * known by the program file beside its `data` folder, and never this game's own.
 */
let root = ''

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => root, getPath: () => root }
}))

const { resolveComfyPick, describeComfyRoot } = await import('../src/main/services/comfyRoot')
const { getOwnComfyUiPath } = await import('../src/main/paths')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'comfy-root-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A game folder with its program file and, where asked, a ComfyUI under its data. */
async function game(name: string, exe: string, withComfy = true): Promise<string> {
  const folder = join(root, name)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, exe), 'x')
  if (withComfy) await mkdir(join(folder, 'data', 'services', 'comfyui', 'python_embeded'), { recursive: true })
  return folder
}

describe('picking another game for its ComfyUI', () => {
  it('takes the ComfyUI of the game folder, or the ComfyUI folder itself', async () => {
    const folder = await game('official', 'Venus University.exe')
    const comfy = join(folder, 'data', 'services', 'comfyui')

    expect(resolveComfyPick(folder)).toEqual({ kind: 'chosen', comfyPath: comfy })
    expect(resolveComfyPick(comfy)).toEqual({ kind: 'chosen', comfyPath: comfy })
    expect(describeComfyRoot(comfy)).toEqual({ game: 'Venus University', folder, present: true })
  })

  it('refuses a folder with no ComfyUI under it, and one that is not a game we know', async () => {
    expect(resolveComfyPick(await game('fresh', 'Venus University.exe', false))).toEqual({ kind: 'invalid' })
    expect(resolveComfyPick(await game('other', 'Something Else.exe'))).toEqual({ kind: 'invalid' })
    expect(resolveComfyPick(join(root, 'nowhere'))).toEqual({ kind: 'invalid' })
  })

  it("answers 'own' for this game's own ComfyUI, which needs no borrowing", async () => {
    expect(resolveComfyPick(getOwnComfyUiPath())).toEqual({ kind: 'own' })
  })

  it('says a chosen folder that has gone is not there', async () => {
    const folder = await game('official', 'Venus University.exe')
    const comfy = join(folder, 'data', 'services', 'comfyui')
    await rm(folder, { recursive: true, force: true })
    expect(describeComfyRoot(comfy).present).toBe(false)
  })
})
