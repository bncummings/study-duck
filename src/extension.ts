// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const startTime = Date.now();

// Keystroke event data structure
interface KeystrokeEvent {
	timestamp: number;
	text: string;
	deletedChars: number;
	fileName: string;
}

// Store all keystroke events
const keystrokeEvents: KeystrokeEvent[] = [];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "study-duck" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const hello_world_disposable = vscode.commands.registerCommand('study-duck.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Study Duck!');
	});

	const event_listener_disposable = vscode.workspace.onDidChangeTextDocument(event => {
		for (const change of event.contentChanges) {
			const keystroke: KeystrokeEvent = {
				timestamp: Date.now() - startTime,
				text: change.text,
				deletedChars: change.rangeLength,
				fileName: event.document.fileName
			};
			
			keystrokeEvents.push(keystroke);
			console.log(`[${keystroke.timestamp}ms] "${keystroke.text}" (deleted: ${keystroke.deletedChars})`);
		}
    });

	context.subscriptions.push(
		hello_world_disposable, 
		event_listener_disposable
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
