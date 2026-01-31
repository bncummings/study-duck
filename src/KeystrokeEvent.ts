export default

/**
 * Note: empty string is the backspace
 */
interface KeystrokeEvent {
	timestamp: number;
    delta_time: number
	text: string;
	deletedChars: number;
	fileName: string;
}
