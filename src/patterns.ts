import KeystrokeEvent from './KeystrokeEvent';



/**
 * Filter out any events that involve more than one character being added or deleted. As
 * this is likely not a real keystroke (e.g., paste, bulk delete).
 */
function clean_anomolies(events: KeystrokeEvent[]): KeystrokeEvent[] {
    return events.filter(event => 
        event.deletedChars <= 1 && 
        event.text.length <= 1
    );
}
