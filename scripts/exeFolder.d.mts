/** Types for `exeFolder.mjs`, so the test that guards the old build's folder type-checks. */

/** What the script asks of the machine; every one can be replaced. */
export interface ExeFolderHooks {
  listProcesses?: () => { pid: string; name: string; path: string }[]
  confirm?: (question: string, expected: string) => Promise<boolean>
  say?: (line: string) => void
}

/** The paths and hooks one run works on. */
export interface ExeFolderContext {
  repo: string
  dst: string
  dataDir: string
}

/** The context for a run against `to`, in the project at `repo`. */
export declare function contextFor(repo: string, to: string, hooks?: ExeFolderHooks): ExeFolderContext

/** Makes the folder the first time, or brings it up to date; `dryRun` only says what it would do. */
export declare function update(ctx: ExeFolderContext, options: { dryRun: boolean }): Promise<void>

/** Deletes the folder, taking the two links off first. */
export declare function remove(ctx: ExeFolderContext, options: { dryRun: boolean }): Promise<void>
