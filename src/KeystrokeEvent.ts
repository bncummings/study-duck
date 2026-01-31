export default

// Keystroke event data structure
interface KeystrokeEvent {
	timestamp: number;
	text: string;
	deletedChars: number;
	fileName: string;
}