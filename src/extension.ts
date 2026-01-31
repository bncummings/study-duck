import * as vscode from 'vscode';
import KeystrokeEvent from './KeystrokeEvent';
import KeystrokeEventBuffer from './KeystrokeBuffer';

let prevTime: number | null = null;

// Store all keystroke events
const samples : KeystrokeEvent[][] = [];
const keystrokeEvents = new KeystrokeEventBuffer(samples);

// Output channel for logging in Extension Host
let outputChannel: vscode.OutputChannel;

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
				delta_time: prevTime ? cur_time - prevTime : 0,
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
  const provider = new StudyDuckViewProvider(context.extensionUri);

	context.subscriptions.push(
		hello_world_disposable, 
		event_listener_disposable,
		print_samples_disposable,
		    vscode.window.registerWebviewViewProvider(
      StudyDuckViewProvider.viewType,
      provider
    )
	);
}

export function deactivate() {}

class StudyDuckViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'studyDuckView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
      }
    });
  }

  sendMessage(message: any) {
    this._view?.webview.postMessage(message);
  }

private _getHtml(webview: vscode.Webview) {
  const duckUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'yellow-duck.png')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    height: 100%;
    margin: 0;
    font-family: sans-serif;
  }
  #duck {
    width: auto;
    height: auto;
    margin-top: 8px;
  }
  #message {
    margin-top: 10px;
    padding: 4px 8px;
    background: rgba(0,0,0,0.05);
    border-radius: 4px;
    min-height: 20px;
    text-align: center;
    width: 90%;
    word-wrap: break-word;
  }
</style>
</head>
<body>
  <img id="duck" src="${duckUri}" />
  <div id="message">Hello! I'm your duck 🦆</div>

  <script>
    const vscode = acquireVsCodeApi();
    const messages = [
      "Hello! I'm your duck 🦆",
      "Remember to take breaks! 💪",
      "Rest your eyes every 20 minutes 👀",
      "Stay hydrated! 💧",
      "Stretch your body! 🧘",
      "You're doing great! ⭐",
      "I love you"
    ];
    let messageIndex = 0;

    // Cycle messages every 5 seconds
    setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      document.getElementById('message').textContent = messages[messageIndex];
    }, 5000);
  </script>
</body>
</html>`;
}
}
