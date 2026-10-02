import { useBunnyboardStore } from './bunnyboardStore'
import { owedFloor } from './replyFloor'

/**
 * The release-at-typing-speed queue her replies drain through: the thread
 * is handed one text at a time, each waiting out the time it would have taken
 * to type. The `...` bubble is exactly "this queue is non-empty".
 */

/** Per character of the message; no floor, and {@link TYPING_MAX_MS} the ceiling. */
const TYPING_MS_PER_CHAR = 49.5
const TYPING_MAX_MS = 3000

/** How long this text sits in the queue before it lands. */
export function typingDelayFor(text: string): number {
  return Math.min(TYPING_MAX_MS, text.length * TYPING_MS_PER_CHAR)
}

/** The beat a canned bot answer waits out — no call to charge the reply floor against. */
export const BOT_REPLY_MS = 1000

/** One conversation's release queue, alive for exactly one texting turn. */
export interface TypingPacer {
  /** Queues one finished text for release. */
  push: (text: string) => void
  /**
   * Says nothing more will be pushed, letting a held last text go; a pacer that holds nothing
   * needs no call.
   */
  finish: () => void
  /** Resolves once everything queued has been released — or cancelled. */
  drain: () => Promise<void>
  /** Drops everything unreleased and stops the typing bubble. */
  cancel: () => void
}

/**
 * Creates a pacer for one conversation. `release` is what actually puts the text in the thread,
 * told whether it is the turn's last. With `holdLast`, the newest queued text waits until
 * `finish`, so the last one is known for the last before it lands.
 */
export function createTypingPacer(
  charId: string,
  release: (text: string, last: boolean) => void,
  options: { holdLast?: boolean } = {}
): TypingPacer {
  const queue: string[] = []
  const waiters: Array<() => void> = []
  // The pacer is built as the request goes out, so this is when the player sent.
  const startedAt = performance.now()
  let running = false
  let cancelled = false
  let finished = !options.holdLast
  /** Wakes a runner parked on a held text when another is pushed or the turn finishes. */
  let wake: (() => void) | null = null

  function setTyping(typing: boolean): void {
    useBunnyboardStore.getState().setTyping(charId, typing)
  }

  function settle(): void {
    setTyping(false)
    for (const resolve of waiters.splice(0)) resolve()
  }

  function nudge(): void {
    const resume = wake
    wake = null
    resume?.()
  }

  async function run(): Promise<void> {
    running = true
    // Whatever is left of the reply floor the call did not already spend.
    const owed = owedFloor(startedAt)
    if (owed > 0) await new Promise((resolve) => setTimeout(resolve, owed))
    if (!cancelled) setTyping(true)
    while (queue.length > 0 && !cancelled) {
      const text = queue[0]!
      await new Promise((resolve) => setTimeout(resolve, typingDelayFor(text)))
      if (cancelled) break
      // A held text waits, typing, for a text after it or for the turn to finish.
      while (!finished && queue.length === 1 && !cancelled) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
      if (cancelled) break
      queue.shift()
      release(text, finished && options.holdLast === true && queue.length === 0)
    }
    running = false
    settle()
  }

  return {
    push: (text) => {
      if (cancelled) return
      queue.push(text)
      if (!running) void run()
      else nudge()
    },
    finish: () => {
      finished = true
      nudge()
    },
    drain: () => {
      if (cancelled || (!running && queue.length === 0)) return Promise.resolve()
      return new Promise<void>((resolve) => waiters.push(resolve))
    },
    cancel: () => {
      cancelled = true
      queue.length = 0
      nudge()
      // The runner's own settle never comes if it is parked on a timer.
      if (!running) settle()
      else setTyping(false)
    }
  }
}
