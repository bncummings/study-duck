import KeystrokeEvent from './KeystrokeEvent';
import { BREAK_WINDOW } from './Constants';

interface Features {
  // Session metrics
  durationMs: number;          // Total time span of events
  events: number;              // Total event count

  // Editing friction (thrashing detection)
  ins: number;                 // Total inserted characters
  del: number;                 // Total deleted characters
  net: number;                 // Net progress: max(0, ins - del)
  deleteRatio: number;         // del / max(1, ins) — high = lots of backtracking
  churn: number;               // (ins + del) / max(1, net) — high = thrashing

  // Typing rhythm (flow detection)
  burstFraction: number;       // Fraction of events with dt <= 200ms (fast typing)
  burstsPerMin: number;        // Burst events per minute

  // Pause analysis (hesitation detection)
  pauseFraction: number;       // Fraction of time spent in medium pauses (2-5s)
  breaks: number;              // Count of gaps > 5s
  breaksPerMin: number;        // Breaks per minute
  medianBreakMs: number;       // Median duration of breaks > 5s

  // Fatigue detection
  pauseTrendSlope: number;     // Slope of pauseFraction over time (positive = slowing down)
  struggleShare: number;       // Fraction of episodes with high churn/deleteRatio
};

/**
 * Filter out any events that involve more than one character being added or deleted. As
 * this is likely not a real keystroke (e.g., paste, bulk delete).
 */
export function clean_anomolies(events: KeystrokeEvent[]): KeystrokeEvent[] {
    return events.filter(event => 
        event.deletedChars <= 1 && 
        event.text.length <= 1
    );
}

/**
 * Returns the total duration in milliseconds covered by the given keystroke events.
 */
export function total_duration(events: KeystrokeEvent[]): number {
    if (events.length === 0) {
        return 0;
    }
    return events[events.length - 1].timestamp - events[0].timestamp;
}

/**
 * Calculates the number of keystroke events per minute.
 */
export function events_per_minute(events: KeystrokeEvent[]): number {
    const duration_ms = total_duration(events);
    if (duration_ms === 0) {
        return 0;
    }
    const minutes = duration_ms / 60000;
    return events.length / minutes;
}

/**
 * Number of events with dt <= 2s
 */
export function bursts_per_minute(events: KeystrokeEvent[]): number {
    if (events.length === 0) {
        return 0;
    }
    
    const burstCount = events.filter(event => event.delta_time >= 2000).length;
    const duration_ms = total_duration(events);
    const minutes = duration_ms / 60000;

    /* Avoid division by zero */
    if (duration_ms === 0) {
        return 0;
    }

    return burstCount / minutes;
}

/**
 * Fraction of events that are part of bursts (dt <= 2s)
 */
export function burst_fraction(events: KeystrokeEvent[]): number {
    if (events.length === 0) {
        return 0;
    }

    const burstEvents = events.filter(event => event.delta_time <= 2000).length;
    return burstEvents / events.length;
}

// EDITING FRICTION 

/**
 * Total inserted characters: ins = Σ text.length
 */
export function totalInserted(events: KeystrokeEvent[]): number {
  let ins = 0;
  for (const e of events) {
    ins += e.text.length;
  }
  return ins;
}

/**
 * Total deleted characters: del = Σ deletedChars
 */
export function totalDeleted(events: KeystrokeEvent[]): number {
  let del = 0;
  for (const e of events) {
    del += e.deletedChars;
  }
  return del;
}

/**
 * Net progress: net = max(0, ins - del)
 */
export function netProgress(events: KeystrokeEvent[]): number {
  const ins = totalInserted(events);
  const del = totalDeleted(events);
  return Math.max(0, ins - del);
}

/**
 * Delete ratio: deleteRatio = del / max(1, ins)
 *
 * Interpretation:
 *  - 0.0 = no deletions
 *  - 0.3 = deleted 30% as much as inserted
 *  - >=1.0 = deleted as much or more than inserted
 */
export function deleteRatio(events: KeystrokeEvent[]): number {
  const ins = totalInserted(events);
  const del = totalDeleted(events);
  return del / Math.max(1, ins);
}

/**
 * Churn: churn = (ins + del) / max(1, net)
 *
 * Interpretation:
 *  - ~1  : most activity becomes progress
 *  - 2-3 : some back-and-forth
 *  - >5  : lots of effort, little progress (thrashing)
 */
export function churn(events: KeystrokeEvent[]): number {
  const ins = totalInserted(events);
  const del = totalDeleted(events);
  const net = Math.max(0, ins - del);
  return (ins + del) / Math.max(1, net);
}

/**
 * Convenience: compute all friction metrics at once.
 */
export function frictionMetrics(events: KeystrokeEvent[]) {
  const ins = totalInserted(events);
  const del = totalDeleted(events);
  const net = Math.max(0, ins - del);

  return {
    ins,
    del,
    net,
    deleteRatio: del / Math.max(1, ins),
    churn: (ins + del) / Math.max(1, net),
  };
}

// PAUSE & BREAK ANALYSIS (for hesitation detection)

/**
 * Fraction of total time spent in medium pauses (2-5 seconds).
 * High values indicate stop-start hesitation.
 */
export function pauseFraction(events: KeystrokeEvent[], minPauseMs = 2000, maxPauseMs = BREAK_WINDOW): number {
  const duration = total_duration(events);
  if (duration <= 0) return 0;

  const pausedMs = events
    .filter(e => e.delta_time >= minPauseMs && e.delta_time <= maxPauseMs)
    .reduce((sum, e) => sum + e.delta_time, 0);

  return pausedMs / duration;
}

/**
 * Count of breaks (gaps > 5 seconds) in the event stream.
 */
export function breakCount(events: KeystrokeEvent[], breakMs = BREAK_WINDOW): number {
  return events.filter(e => e.delta_time > breakMs).length;
}

/**
 * Breaks per minute — high values indicate frequent context switches or hesitation.
 */
export function breaksPerMinute(events: KeystrokeEvent[], breakMs = BREAK_WINDOW): number {
  const duration = total_duration(events);
  if (duration <= 0) return 0;

  const breaks = breakCount(events, breakMs);
  const minutes = duration / 60000;
  return breaks / minutes;
}

/**
 * Median duration of breaks > 5 seconds.
 * Longer median = deeper hesitation or distraction.
 */
export function medianBreakMs(events: KeystrokeEvent[], breakMs = BREAK_WINDOW): number {
  const breakDurations = events
    .filter(e => e.delta_time > breakMs)
    .map(e => e.delta_time);

  if (breakDurations.length === 0) return 0;

  const sorted = [...breakDurations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// COMPUTE ALL FEATURES

/**
 * Compute all features from a list of keystroke events.
 */
export function computeFeatures(events: KeystrokeEvent[]): Features {
  const friction = frictionMetrics(events);
  const duration = total_duration(events);
  const minutes = duration / 60000;

  const burstEvents = events.filter(e => e.delta_time > 0 && e.delta_time <= 200).length;

  return {
    durationMs: duration,
    events: events.length,

    // Friction
    ins: friction.ins,
    del: friction.del,
    net: friction.net,
    deleteRatio: friction.deleteRatio,
    churn: friction.churn,

    // Rhythm
    burstFraction: events.length > 0 ? burstEvents / events.length : 0,
    burstsPerMin: minutes > 0 ? burstEvents / minutes : 0,

    // Pauses & breaks
    pauseFraction: pauseFraction(events),
    breaks: breakCount(events),
    breaksPerMin: breaksPerMinute(events),
    medianBreakMs: medianBreakMs(events),

    // Fatigue (these require episode analysis - placeholders for now)
    pauseTrendSlope: 0, // TODO: compute across episodes
    struggleShare: 0,   // TODO: compute across episodes
  };
}

export type { Features };
