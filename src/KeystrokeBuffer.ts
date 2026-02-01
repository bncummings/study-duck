import KeystrokeEvent from "./KeystrokeEvent";
import { CONTEXT_SWITCH_WINDOW, MAX_LENGTH_FOR_ANALYSIS, MAX_WINDOW_SIZE } from "./Constants";
import { NextStateResult, createInitialState, next_state } from "./StateMachine";


class KeystrokeBuffer {
    private buffer: KeystrokeEvent[] = [];
    private sampleList: KeystrokeEvent[][] = [];
    private currentState: NextStateResult;
    private readonly contextSwitchWindow: number = CONTEXT_SWITCH_WINDOW;
    private readonly maxSize: number = MAX_WINDOW_SIZE;

    /**
     * These parameters MUST be references used by outside code to be displayed
     * @param sampleList 
     */
    constructor(sampleList: KeystrokeEvent[][], initialState: NextStateResult = createInitialState()) {
        this.sampleList = sampleList;
        this.currentState = initialState;
    }


    /**
     * If the new keystroke is more than contextSwitchWindow ms after the last one, start a new sample
     * Otherwise, add to the current sample
     */
    push(keystroke: KeystrokeEvent): void {
        const prev_timestamp = this.peek()?.timestamp ?? 0;
        const start_timestamp = this.buffer.length > 0 ? this.buffer[0].timestamp : 0;

        if (prev_timestamp > 0 && (keystroke.timestamp - prev_timestamp) >= this.contextSwitchWindow) {
            // Save a copy of the current buffer before clearing
            this.sampleList.push([...this.buffer]);

            // Update state before clearing the buffer
            this.updateState();
            this.clear();
        }
        
        this.buffer.push(keystroke);
        
        /* update state every {MAX_LENGTH_FOR_ANALYSIS} milliseconds */
        if (start_timestamp > 0 && (keystroke.timestamp - start_timestamp) >= MAX_LENGTH_FOR_ANALYSIS) {
            this.updateState();
            this.clear();
        }   
        
        /* Roll Buffer if it gets too large */
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();

            // Update state every {MAX_WINDOW_SIZE} keystrokes
            this.updateState();
        }



    }

    updateState(): void {
        this.currentState = next_state(this.currentState, this.buffer);
    }

    getState(): NextStateResult {
        return this.currentState;
    }

    getBuffer(): KeystrokeEvent[] {
        return [...this.buffer];
    }

    getBufferAsString(): string {
        return this.buffer.join('');
    }

    clear(): void {
        this.buffer = [];
    }

    peek(): KeystrokeEvent | null {
        return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
    }

    size(): number {
        return this.buffer.length;
    }

    /** Get all completed samples plus the current buffer */
    getAllSamples(): KeystrokeEvent[][] {
        if (this.buffer.length > 0) {
            return [...this.sampleList, [...this.buffer]];
        }
        return [...this.sampleList];
    }
}

export default KeystrokeBuffer;
