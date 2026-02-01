export const CONTEXT_SWITCH_WINDOW = 10000; // 10 seconds 
export const BREAK_WINDOW = 2000; // 3 seconds
export const MAX_WINDOW_SIZE =  100; // every 100 keystrokes, update state
export const MAX_LENGTH_FOR_ANALYSIS = 1000; // update every 3 seconds
export const RECORD_INTERVAL = 30; // seconds between keystroke record attempts

// Typing rate thresholds (events per minute)
export const NORMAL_RATE = 50;
export const FAST_RATE = 70;
export const SMASH_RATE = 100;    // 10 keys/sec — inhuman, keyboard smashing only
export const SLOW_RATE = 20;
