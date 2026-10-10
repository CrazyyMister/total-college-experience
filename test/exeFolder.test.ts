import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contextFor, remove, update } from '../scripts/exeFolder.mjs'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'exe-folder-'))
  await mkdir(join(root, 'project'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A run against `folder` that never lists a process, says nothing and agrees to everything. */
function runAgainst(folder: string) {
  return contextFor(join(root, 'project'), folder, {
    listProcesses: () => [],
    confirm: async () => true,
    say: () => undefined
  })
}

/** A folder holding the files named, each with a line of text. */
async function folderWith(name: string, files: string[]): Promise<string> {
  const folder = join(root, name)
  await mkdir(join(folder, 'data'), { recursive: true })
  for (const file of files) await writeFile(join(folder, file), 'x')
  await writeFile(join(folder, 'data', 'settings.json'), '{}')
  return folder
}

describe('the exe folder script and the old build', () => {
  it('will not make or update a folder named for the old build', async () => {
    const folder = join(root, 'Venus University')
    await expect(update(runAgainst(folder), { dryRun: false })).rejects.toThrow('old Venus University build')
    expect(existsSync(folder)).toBe(false)
  })

  it('will not update or remove a folder that holds the old program file', async () => {
    const folder = await folderWith('Elsewhere', ['Venus University.exe'])
    await expect(update(runAgainst(folder), { dryRun: false })).rejects.toThrow('old Venus University build')
    await expect(remove(runAgainst(folder), { dryRun: false })).rejects.toThrow('old Venus University build')
    expect(existsSync(join(folder, 'Venus University.exe'))).toBe(true)
    expect(existsSync(join(folder, 'data', 'settings.json'))).toBe(true)
  })

  it('refuses the old program file even beside the new one', async () => {
    const folder = await folderWith('Both', ['Venus University.exe', 'Total College Experience.exe'])
    await expect(remove(runAgainst(folder), { dryRun: false })).rejects.toThrow('old Venus University build')
    expect(existsSync(join(folder, 'Total College Experience.exe'))).toBe(true)
  })

  it('will not delete a folder that does not hold the game', async () => {
    const folder = await folderWith('Someone else', ['notes.txt'])
    await expect(remove(runAgainst(folder), { dryRun: false })).rejects.toThrow('not a game folder')
    expect(existsSync(join(folder, 'notes.txt'))).toBe(true)
  })
})
