import FlowState from "./FlowState";
import KeystrokeEvent from "./KeystrokeEvent";
import { computeFeatures, Features } from "./Features";
import { NORMAL_RATE, FAST_RATE, SMASH_RATE, SLOW_RATE } from "./Constants";

// Clamp value between 0 and 1
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// Score calculators (each returns 0-1, higher = more likely in that state)

/**
 * FLOW: Fast, smooth typing with few pauses and low churn
 * Triggered by increased speed with productive output
 */
function scoreFlow(f: Features): number {
    const eventsPerMin = f.events / Math.max(0.1, f.durationMs / 60000);
    const speedScore = clamp01((eventsPerMin - NORMAL_RATE) / (FAST_RATE - NORMAL_RATE));
    const burstScore = clamp01((f.burstFraction - 0.4) / 0.4);   // 40%→0, 80%→1
    const lowPause = clamp01(1 - f.pauseFraction / 0.15);        // penalize pauses
    const lowChurn = clamp01(1 - f.churn / 2.0);                 // penalize rewrites
    return clamp01(0.60 * speedScore + 0.30 * burstScore + 0.20 * lowPause + 0.15 * lowChurn);
}

/**
 * THRASHING: Keyboard smashing — inhuman typing speed
 * Only triggers when typing faster than humanly possible (~10+ keys/sec)
 * This means literal keyboard mashing, not just fast typing
 */
function scoreThrashing(f: Features): number {
    const eventsPerMin = f.events / Math.max(0.1, f.durationMs / 60000);
    // Must exceed SMASH_RATE (600 epm = 10 keys/sec) to score at all
    // Ramps from 0 at SMASH_RATE to 1 at 2x SMASH_RATE
    if (eventsPerMin < SMASH_RATE) {
        return 0;
    }
    return clamp01((eventsPerMin - SMASH_RATE) / SMASH_RATE);
}

/**
 * HESITATING: Frequent pauses, stop-start pattern
 * Not about speed, but about interruption pattern
 */
function scoreHesitating(f: Features): number {
    const breaksScore = clamp01(f.breaksPerMin / 2.0);           // 2 breaks/min → strong
    const medianScore = clamp01(f.medianBreakMs / 8000);         // 8s median → strong
    const pauseScore = clamp01(f.pauseFraction / 0.20);          // 20% pause time → strong
    return clamp01(0.40 * breaksScore + 0.35 * medianScore + 0.25 * pauseScore);
}

/**
 * FATIGUED: Typing rate has slowed significantly
 * Low event rate, sluggish rhythm, increased pauses
 */
function scoreFatigued(f: Features): number {
    const eventsPerMin = f.events / Math.max(0.1, f.durationMs / 60000);
    const slowScore = clamp01((NORMAL_RATE - eventsPerMin) / (NORMAL_RATE - SLOW_RATE));
    const lowBurst = clamp01(1 - f.burstFraction / 0.5);         // burstFraction < 50% → tired
    const pauseUp = clamp01(f.pauseFraction / 0.25);             // 25% pause → fatigued
    const struggleScore = clamp01(f.churn / 3.0);                // high churn from mistakes
    return clamp01(0.40 * slowScore + 0.25 * lowBurst + 0.20 * pauseUp + 0.15 * struggleScore);
}

// Hysteresis thresholds (enter is higher than exit to prevent flickering)
const ENTER_THRESHOLD = {
    [FlowState.FLOW]: 0.55,
    [FlowState.THRASHING]: 0.50,
    [FlowState.HESITATING]: 0.45,
    [FlowState.FATIGUED]: 0.45,
};

const EXIT_THRESHOLD = {
    [FlowState.FLOW]: 0.35,
    [FlowState.THRASHING]: 0.35,
    [FlowState.HESITATING]: 0.30,
    [FlowState.FATIGUED]: 0.30,
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
        } as Features,
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

    // THRASHING at max score immediately overrides any state
    if (thrashing >= 1) {
        return { state: FlowState.THRASHING, scores, features };
    }

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
