import { spawnSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { gameFolderOf, gameNamedBy } from '@shared/comfyPort'

/**
 * Windows process-tree teardown for spawned servers; synchronous for `will-quit`
 * because Electron does not await it.
 */

/** Kills `pid` and every process descended from it. */
export function killTree(pid: number | undefined): void {
  if (!pid) return

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
  }
}

/**
 * The running processes whose executable is `exePath` and whose command line carries `marker`
 * — every one of them when there is no marker — or `null` where Windows would not answer,
 * which is not the same as an empty listing. A marker is what tells this game's server from
 * another game's where both run the same interpreter.
 */
export function listOwnedProcessIds(exePath: string, marker: string | null): number[] | null {
  if (process.platform !== 'win32') return null

  // Single-quoted PowerShell strings are literal; only an embedded quote needs doubling.
  const quoted = `'${exePath.toLowerCase().replace(/'/g, "''")}'`

  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq ${quoted} } | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 15_000 }
  )

  if (result.error || result.status !== 0) return null

  const wanted = marker === null ? null : marker.toLowerCase()
  const pids: number[] = []
  for (const line of (result.stdout ?? '').split('\n')) {
    const split = line.indexOf('|')
    if (split < 0) continue
    const pid = Number(line.slice(0, split).trim())
    const commandLine = line.slice(split + 1).toLowerCase()
    if (!Number.isInteger(pid) || pid <= 0) continue
    if (wanted === null || commandLine.includes(wanted)) pids.push(pid)
  }
  return pids
}

/**
 * The executable path of whatever listens on `port`, or `null` where nothing does or Windows
 * would not say.
 */
function listenerPathOn(port: number): string | null {
  if (process.platform !== 'win32') return null

  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
        'if ($c) { (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)").ExecutablePath }'
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 15_000 }
  )
  if (result.error || result.status !== 0) return null
  const path = (result.stdout ?? '').trim()
  return path === '' ? null : path
}

/**
 * The game that is serving `port` from its own ComfyUI, named by the program file that stands
 * beside that ComfyUI's `data` folder, or `null` where the listener is anything else.
 */
export function gameListeningOn(port: number): { name: string; listener: string } | null {
  const listener = listenerPathOn(port)
  const folder = listener === null ? null : gameFolderOf(listener)
  if (listener === null || folder === null || !existsSync(folder)) return null
  const name = gameNamedBy(readdirSync(folder))
  return name === null ? null : { name, listener }
}

/**
 * Kills every process {@link listOwnedProcessIds} names, tree and all; a listing Windows would
 * not answer leaves nothing to kill.
 */
export function killOwnedProcesses(exePath: string, marker: string | null): void {
  for (const pid of listOwnedProcessIds(exePath, marker) ?? []) {
    console.log(`[cleanup] killing stray process ${pid}`)
    killTree(pid)
  }
}
