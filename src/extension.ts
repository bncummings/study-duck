// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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
        console.log(`[${Date.now()}] Document changed: ${event.document.fileName}`);
        console.log('Number of changes:', event.contentChanges.length);
    });

	context.subscriptions.push(
		hello_world_disposable, 
		event_listener_disposable
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
