import KeystrokeEvent from "./KeystrokeEvent";
import { CONTEXT_SWITCH_WINDOW, MAX_WINDOW_SIZE } from "./Constants";

class KeystrokeBuffer {
    private buffer: KeystrokeEvent[] = [];
    private sampleList: KeystrokeEvent[][] = [];
    private readonly contextSwitchWindow: number = CONTEXT_SWITCH_WINDOW;
    private readonly maxSize: number = MAX_WINDOW_SIZE;

    constructor(sampleList: KeystrokeEvent[][]) {
        this.sampleList = sampleList;
    }


    /**
     * If the new keystroke is more than contextSwitchWindow ms after the last one, start a new sample
     * Otherwise, add to the current sample
     */
    push(keystroke: KeystrokeEvent): void {
        const prev_timestamp = this.peek()?.timestamp ?? 0;
        if (prev_timestamp > 0 && (keystroke.timestamp - prev_timestamp) >= this.contextSwitchWindow) {
            // Save a copy of the current buffer before clearing
            this.sampleList.push([...this.buffer]);
            this.clear();
        }
        
        this.buffer.push(keystroke);
        
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }

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
