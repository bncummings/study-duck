import FlowState from "./FlowState";
import KeystrokeEvent from "./KeystrokeEvent";
import { computeFeatures, Features } from "./Features";

// Clamp value between 0 and 1
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// Score calculators (each returns 0-1, higher = more likely in that state)

/**
 * FLOW: Fast bursts, few pauses, low churn
 */
function scoreFlow(f: Features): number {
    const burst = clamp01((f.burstFraction - 0.35) / (0.70 - 0.35)); // 0.35→0, 0.70→1
    const pause = clamp01(1 - (f.pauseFraction / 0.20));             // pause 0.20→0
    const churnScore = clamp01(1 - (f.churn / 2.5));                 // churn 2.5→0
    return clamp01(0.45 * burst + 0.35 * pause + 0.20 * churnScore);
}

/**
 * THRASHING: High churn, high delete ratio — lots of rewriting
 */
function scoreThrashing(f: Features): number {
    const churnScore = clamp01(f.churn / 3.0);
    const delScore = clamp01(f.deleteRatio / 0.35);
    const pauseScore = clamp01(f.pauseFraction / 0.30);
    return clamp01(0.50 * churnScore + 0.40 * delScore + 0.10 * pauseScore);
}

/**
 * HESITATING: Frequent breaks, stop-start pattern
 */
function scoreHesitating(f: Features): number {
    const breaksScore = clamp01(f.breaksPerMin / 3.0);      // 3 breaks/min → strong
    const medianScore = clamp01(f.medianBreakMs / 12000);   // 12s median → strong
    const pauseScore = clamp01(f.pauseFraction / 0.30);
    return clamp01(0.45 * breaksScore + 0.35 * medianScore + 0.20 * pauseScore);
}

/**
 * FATIGUED: Long session + declining performance over time
 */
function scoreFatigued(f: Features): number {
    const minutes = f.durationMs / 60000;
    const longSession = clamp01((minutes - 60) / 60);           // ramps 60→120 min
    const trendScore = clamp01(f.pauseTrendSlope / 0.003);      // positive slope = slowing
    const struggleScore = clamp01(f.struggleShare / 0.35);      // 35% struggling → strong
    return clamp01(0.45 * longSession + 0.35 * trendScore + 0.20 * struggleScore);
}

// Hysteresis thresholds (enter is higher than exit to prevent flickering)
const ENTER_THRESHOLD = {
    [FlowState.FLOW]: 0.70,
    [FlowState.THRASHING]: 0.70,
    [FlowState.HESITATING]: 0.65,
    [FlowState.FATIGUED]: 0.75,
};

const EXIT_THRESHOLD = {
    [FlowState.FLOW]: 0.50,
    [FlowState.THRASHING]: 0.50,
    [FlowState.HESITATING]: 0.45,
    [FlowState.FATIGUED]: 0.55,
};

// Priority order: rarer/higher-impact states first
const STATE_PRIORITY: FlowState[] = [
    FlowState.FATIGUED,
    FlowState.THRASHING,
    FlowState.HESITATING,
    FlowState.FLOW,
    FlowState.FOCUSED,
];

export type StateScores = {
    [FlowState.FLOW]: number;
    [FlowState.THRASHING]: number;
    [FlowState.HESITATING]: number;
    [FlowState.FATIGUED]: number;
    [FlowState.FOCUSED]: number;
};

export type NextStateResult = {
    state: FlowState;
    scores: StateScores;
    features: Features;
};

/**
 * Create an initial state result with FOCUSED state and zeroed scores/features.
 */
export function createInitialState(): NextStateResult {
    return {
        state: FlowState.FOCUSED,
        scores: {
            [FlowState.FLOW]: 0,
            [FlowState.THRASHING]: 0,
            [FlowState.HESITATING]: 0,
            [FlowState.FATIGUED]: 0,
            [FlowState.FOCUSED]: 1,
        },
        features: {
            durationMs: 0,
            events: 0,
            ins: 0,
            del: 0,
            net: 0,
            deleteRatio: 0,
            churn: 1,
            burstFraction: 0,
            burstsPerMin: 0,
            pauseFraction: 0,
            breaks: 0,
            breaksPerMin: 0,
            medianBreakMs: 0,
            pauseTrendSlope: 0,
            struggleShare: 0,
        },
    };
}

/**
 * Determine the next state based on keystroke events.
 * Pure function: takes current state result and events, returns new state result.
 * Uses hysteresis to prevent rapid state flickering.
 */
export function next_state(current: NextStateResult, events: KeystrokeEvent[]): NextStateResult {
    const features = computeFeatures(events);

    // Calculate scores for each state
    const flow = scoreFlow(features);
    const thrashing = scoreThrashing(features);
    const hesitating = scoreHesitating(features);
    const fatigued = scoreFatigued(features);
    const focused = clamp01(1 - Math.max(flow, thrashing, hesitating, fatigued));

    const scores: StateScores = {
        [FlowState.FLOW]: flow,
        [FlowState.THRASHING]: thrashing,
        [FlowState.HESITATING]: hesitating,
        [FlowState.FATIGUED]: fatigued,
        [FlowState.FOCUSED]: focused,
    };

    // If currently in a non-focused state, stay unless below exit threshold
    if (current.state !== FlowState.FOCUSED) {
        const currentScore = scores[current.state];
        const exitThreshold = EXIT_THRESHOLD[current.state as keyof typeof EXIT_THRESHOLD];
        if (exitThreshold !== undefined && currentScore >= exitThreshold) {
            return { state: current.state, scores, features };
        }
    }

    // Otherwise, pick highest priority state above enter threshold
    for (const state of STATE_PRIORITY) {
        if (state === FlowState.FOCUSED) break;

        const enterThreshold = ENTER_THRESHOLD[state as keyof typeof ENTER_THRESHOLD];
        if (enterThreshold !== undefined && scores[state] >= enterThreshold) {
            return { state, scores, features };
        }
    }

    // Default to FOCUSED
    return { state: FlowState.FOCUSED, scores, features };
}
