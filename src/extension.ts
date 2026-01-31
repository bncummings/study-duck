// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import KeystrokeEvent from './KeystrokeEvent';
import KeystrokeEventBuffer from './KeystrokeBuffer';

let prevTime: number | null = null;

// Store all keystroke events
const samples : KeystrokeEvent[][] = [];
const keystrokeEvents = new KeystrokeEventBuffer(samples);

// Output channel for logging in Extension Host
let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	outputChannel = vscode.window.createOutputChannel('Study Duck');

	const hello_world_disposable = vscode.commands.registerCommand('study-duck.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Study Duck!');
	});

	const event_listener_disposable = vscode.workspace.onDidChangeTextDocument(event => {
		const cur_time = Date.now();
		for (const change of event.contentChanges) {
			const keystroke: KeystrokeEvent = {
				timestamp: cur_time,
				delta_time: prevTime !== null ? cur_time - prevTime : 0,
				text: change.text,
				deletedChars: change.rangeLength,
				fileName: event.document.fileName
			};
			
			keystrokeEvents.push(keystroke);
			console.log(keystroke);
			prevTime = cur_time;  // Update after each change, not just at end
		}
    });

	const print_samples_disposable = vscode.commands.registerCommand('study-duck.collect-data', () => {
		const allSamples = keystrokeEvents.getAllSamples();
		outputChannel.clear();
		outputChannel.appendLine('=== Keystroke Samples ===');
		outputChannel.appendLine(`Total sample groups: ${allSamples.length}`);
		outputChannel.appendLine(JSON.stringify(allSamples, null, 2));
		outputChannel.show();  // Opens the Output panel
	});

	context.subscriptions.push(
		hello_world_disposable, 
		event_listener_disposable,
		print_samples_disposable
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
