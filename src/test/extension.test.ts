import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import KeystrokeBuffer from '../KeystrokeBuffer';
import KeystrokeEvent from '../KeystrokeEvent';
// import * as myExtension from '../../extension';

function createKeystroke(timestamp: number, text: string): KeystrokeEvent {
	return {
		timestamp,
		delta_time: 0,
		text,
		deletedChars: 0,
		fileName: 'test.ts'
	};
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('KeystrokeBuffer Test Suite', () => {

	test('Keystrokes within 5 seconds stay in the same sample', () => {
		const samples: KeystrokeEvent[][] = [];
		const buffer = new KeystrokeBuffer(samples);

		// Add keystrokes 1 second apart
		buffer.push(createKeystroke(1000, 'a'));
		buffer.push(createKeystroke(2000, 'b'));
		buffer.push(createKeystroke(3000, 'c'));

		// All should be in buffer, none in samples yet
		assert.strictEqual(samples.length, 0);
		assert.strictEqual(buffer.size(), 3);
	});

	test('Keystrokes separated by more than 5 seconds go into separate samples', () => {
		const samples: KeystrokeEvent[][] = [];
		const buffer = new KeystrokeBuffer(samples);

		// First burst of keystrokes
		buffer.push(createKeystroke(1000, 'a'));
		buffer.push(createKeystroke(2000, 'b'));
		buffer.push(createKeystroke(3000, 'c'));

		// Gap of 5+ seconds, then second burst
		buffer.push(createKeystroke(9000, 'd'));  // 6 seconds after 'c'
		buffer.push(createKeystroke(10000, 'e'));

		// First burst should be saved to samples
		assert.strictEqual(samples.length, 1);
		assert.strictEqual(samples[0].length, 3);
		assert.strictEqual(samples[0][0].text, 'a');
		assert.strictEqual(samples[0][1].text, 'b');
		assert.strictEqual(samples[0][2].text, 'c');

		// Second burst should be in current buffer
		assert.strictEqual(buffer.size(), 2);
		assert.strictEqual(buffer.getBuffer()[0].text, 'd');
		assert.strictEqual(buffer.getBuffer()[1].text, 'e');
	});

	test('Multiple context switches create multiple samples', () => {
		const samples: KeystrokeEvent[][] = [];
		const buffer = new KeystrokeBuffer(samples);

		// First burst
		buffer.push(createKeystroke(1000, 'a'));
		buffer.push(createKeystroke(2000, 'b'));

		// Second burst (after 5s gap)
		buffer.push(createKeystroke(8000, 'c'));
		buffer.push(createKeystroke(9000, 'd'));

		// Third burst (after another 5s gap)
		buffer.push(createKeystroke(15000, 'e'));

		assert.strictEqual(samples.length, 2);
		assert.strictEqual(samples[0].length, 2);  // 'a', 'b'
		assert.strictEqual(samples[1].length, 2);  // 'c', 'd'
		assert.strictEqual(buffer.size(), 1);       // 'e' in current buffer
	});

	test('Exactly 5 seconds gap triggers new sample', () => {
		const samples: KeystrokeEvent[][] = [];
		const buffer = new KeystrokeBuffer(samples);

		buffer.push(createKeystroke(1000, 'a'));
		buffer.push(createKeystroke(6000, 'b'));  // Exactly 5000ms later

		assert.strictEqual(samples.length, 1);
		assert.strictEqual(samples[0][0].text, 'a');
		assert.strictEqual(buffer.getBuffer()[0].text, 'b');
	});
});
