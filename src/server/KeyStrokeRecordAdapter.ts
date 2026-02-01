import KeystrokeEvent from "../KeystrokeEvent.js";
import { KeyStrokeRecord } from "./KeyStrokeRecord.js";

type TimedKey = {
  char: string
  down: number
  up: number
}

/** CMU fixed target (characters) */
const CMU_TARGET_CHARS = [".", "t", "i", "e", "5", "R", "o", "a", "n", "l", "\n"] as const

/** CMU fixed target (dataset labels) */
const CMU_TARGET_LABELS = [
  "period", "t", "i", "e", "five", "Shift.r", "o", "a", "n", "l", "Return"
] as const

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

function median(nums: number[]): number {
  const arr = [...nums].filter(n => Number.isFinite(n)).sort((a, b) => a - b)
  if (arr.length === 0) return 120
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 === 1 ? arr[mid] : 0.5 * (arr[mid - 1] + arr[mid])
}

/** Map a produced character to the CMU key label namespace. */
function charToCmuLabel(ch: string): string {
  if (ch === ".") return "period"
  if (ch === "\n") return "Return"

  // Uppercase A-Z => Shift.<lowercase>
  if (ch.length === 1 && ch >= "A" && ch <= "Z") {
    return `Shift.${ch.toLowerCase()}`
  }

  // Lowercase a-z
  if (ch.length === 1 && ch >= "a" && ch <= "z") return ch

  // Digits 0-9 are spelled out in CMU
  if (ch.length === 1 && ch >= "0" && ch <= "9") {
    const words = ["zero","one","two","three","four","five","six","seven","eight","nine"]
    return words[Number(ch)]
  }

  throw new Error(`Unsupported character for CMU mapping: "${ch}"`)
}

/**
 * Build down/up times for every keystroke.
 * Down times come from cumulative delta_time; up times are estimated from surrounding deltas.
 */
function reconstructDownUp(events: KeystrokeEvent[]): TimedKey[] {
  if (events.length === 0) return []

  // Use delta_time to rebuild a consistent timeline (don’t trust raw timestamps)
  const downs: number[] = new Array(events.length)
  downs[0] = events[0].timestamp

  for (let i = 1; i < events.length; i++) {
    downs[i] = downs[i - 1] + events[i].delta_time
  }

  const deltas = events.map(e => e.delta_time).filter(d => d > 0)
  const medDelta = median(deltas)

  // Hold-time heuristic based on surrounding deltas:
  // hold_i = clamp(30..250, 0.9 * min(prevGap, nextGap))
  // This uses local rhythm and allows some overlap if gaps are small.
  const timed: TimedKey[] = []

  for (let i = 0; i < events.length; i++) {
    const prevGap = i > 0 ? events[i].delta_time : medDelta
    const nextGap = i + 1 < events.length ? events[i + 1].delta_time : medDelta
    const neighbor = Math.min(prevGap > 0 ? prevGap : medDelta, nextGap > 0 ? nextGap : medDelta)

    const hold = clamp(0.9 * neighbor, 30, 250)
    const down = downs[i]
    const up = down + hold

    timed.push({ char: events[i].text, down, up })
  }

  return timed
}

/**
 * Find the first subsequence matching CMU_TARGET_CHARS in order (not necessarily contiguous).
 * We ignore backspaces (text === "") and deletion events.
 */
function extractCmuSubsequence(timed: TimedKey[], raw: KeystrokeEvent[]): TimedKey[] {
  let j = 0
  const picked: TimedKey[] = []

  for (let i = 0; i < timed.length && j < CMU_TARGET_CHARS.length; i++) {
    const e = raw[i]
    const t = timed[i]

    if (e.text === "" || e.deletedChars > 0) continue // skip backspace/deletions entirely

    if (t.char === CMU_TARGET_CHARS[j]) {
      picked.push(t)
      j++
    }
  }

  if (picked.length !== CMU_TARGET_CHARS.length) {
    throw new Error("Could not find CMU fixed-string subsequence in this keystroke stream.")
  }

  return picked
}

export function keystrokesToCMUTrialRow(
  events: KeystrokeEvent[],
  subject: number,
  sessionIndex: number,
  rep: number
): KeyStrokeRecord{
  const timed = reconstructDownUp(events)
  const seq = extractCmuSubsequence(timed, events)

  // Convert extracted chars -> CMU labels (and validate it’s the expected CMU target)
  const labels = seq.map(s => charToCmuLabel(s.char))
  for (let k = 0; k < CMU_TARGET_LABELS.length; k++) {
    if (labels[k] !== CMU_TARGET_LABELS[k]) {
      throw new Error(`Matched text, but CMU label mismatch at ${k}: got ${labels[k]}, expected ${CMU_TARGET_LABELS[k]}`)
    }
  }

  const row: any = { subject, sessionIndex, rep }

  // Fill H.* (hold times)
  for (let i = 0; i < CMU_TARGET_LABELS.length; i++) {
    const key = CMU_TARGET_LABELS[i]
    row[`H.${key}`] = seq[i].up - seq[i].down
  }

  // Fill DD.*.* and UD.*.*
  for (let i = 0; i + 1 < CMU_TARGET_LABELS.length; i++) {
    const a = CMU_TARGET_LABELS[i]
    const b = CMU_TARGET_LABELS[i + 1]

    const Da = seq[i].down
    const Ua = seq[i].up
    const Db = seq[i + 1].down

    row[`DD.${a}.${b}`] = Db - Da
    row[`UD.${a}.${b}`] = Db - Ua
  }

  return row as KeyStrokeRecord
}
