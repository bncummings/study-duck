import * as vscode from 'vscode';
import KeystrokeEvent from './KeystrokeEvent';
import KeystrokeEventBuffer from './KeystrokeBuffer';
import { NextStateResult } from './StateMachine';
import { createInitialState } from './StateMachine';
import FlowState from './FlowState';
import { RECORD_INTERVAL } from './Constants';
import { keystrokesToCMUTrialRow } from './server/KeyStrokeRecordAdapter';

let prevTime: number | null = null;
let inactivityTimer: NodeJS.Timeout | undefined;

// Store all keystroke events
let current_state: NextStateResult = createInitialState(); //Default
let lastDisplayedState: FlowState | null = null; // Track last displayed state
let flowParticleInterval: NodeJS.Timeout | null = null; // Interval for flow particles
let fatiguedReminderTimeout: NodeJS.Timeout | null = null; // Reminder when fatigued persists
const samples : KeystrokeEvent[][] = [];
const keystrokeEvents = new KeystrokeEventBuffer(samples, current_state);

// Keystroke record tracking
let sessionIndex = 0;
let repCount = 0;

// Output channel for logging in Extension Host
let outputChannel: vscode.OutputChannel;
let provider: StudyDuckViewProvider;
let flowProvider: FlowViewProvider;

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Study Duck');

	provider = new StudyDuckViewProvider(context.extensionUri);
	flowProvider = new FlowViewProvider(context.extensionUri);

	// Pomodoro timer state
	let pomodoroRunning = false;
	const workTime = 25 * 60; // 25 minutes
	const breakTime = 5 * 60; // 5 minutes
	let timeLeft = workTime;
	let isWorkSession = true;

  const updateTimerDisplay = () => {
		const mins = Math.floor(timeLeft / 60);
		const secs = timeLeft % 60;
		const label = isWorkSession ? '🍅' : '☕';
		const timerText = `${label} ${mins}:${secs.toString().padStart(2, '0')}`;
    provider.setTitle(timerText);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('study-duck.togglePomodoro', () => {
			pomodoroRunning = !pomodoroRunning;
			if (pomodoroRunning) {
				vscode.window.showInformationMessage(`${isWorkSession ? '🍅 Work' : '☕ Break'} session started!`);
			}
		})
	);

	// Timer tick every second
	setInterval(() => {
		if (pomodoroRunning && timeLeft > 0) {
			timeLeft--;
			updateTimerDisplay();

			if (timeLeft === 0) {
				if (isWorkSession) {
					vscode.window.showInformationMessage('🍅 Work session done! Time for a break ☕');
					isWorkSession = false;
					timeLeft = breakTime;
				} else {
					vscode.window.showInformationMessage('☕ Break over! Ready to work? 🍅');
					isWorkSession = true;
					timeLeft = workTime;
				}
				pomodoroRunning = false;
				updateTimerDisplay();
			}
		}
	}, 1000);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			StudyDuckViewProvider.viewType,
			provider
		),
		vscode.window.registerWebviewViewProvider(
			FlowViewProvider.viewType,
			flowProvider
		)
	);

	updateTimerDisplay();

	const hello_world_disposable = vscode.commands.registerCommand('study-duck.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Study Duck!');
	});

	const event_listener_disposable = vscode.workspace.onDidChangeTextDocument(event => {
		const cur_time = Date.now();
		
		// Reset inactivity timer on each keystroke
		if (inactivityTimer) {
			clearTimeout(inactivityTimer);
		}
		inactivityTimer = setTimeout(() => {
			flowProvider.setFlowState('Idle');
		}, 5000);
		
		for (const change of event.contentChanges) {
			const keystroke: KeystrokeEvent = {
				timestamp: cur_time,
				delta_time: prevTime ? cur_time - prevTime : 0,
				text: change.text,
				deletedChars: change.rangeLength,
				fileName: event.document.fileName
			};
			
			keystrokeEvents.push(keystroke);

			const state = keystrokeEvents.getState();
			//console.log('Keystroke added:', keystroke);
			console.log(`[${state.state.toString()}] scores:`, state.scores);
			prevTime = cur_time;

			if (state.state === FlowState.FLOW) {
				provider.sendMessage({ command: 'flowParticles' });
			}
			
			// Only update views if state actually changed
			if (state.state !== lastDisplayedState) {
				lastDisplayedState = state.state;
				if (state.state === FlowState.FLOW) {
					flowProvider.setFlowState('Flow');
					provider.setFlowState('Flow');
				} else {
					// Stop particles when leaving flow state
					if (flowParticleInterval) {
						clearInterval(flowParticleInterval);
						flowParticleInterval = null;
					}
					
          // Stop fatigued reminder when leaving fatigued state
          if (state.state !== FlowState.FATIGUED && fatiguedReminderTimeout) {
            clearTimeout(fatiguedReminderTimeout);
            fatiguedReminderTimeout = null;
          }
					
					if (state.state === FlowState.FOCUSED) {
						flowProvider.setFlowState('Focused');
						provider.setFlowState('Focused');
					} else if (state.state === FlowState.IDLE) {
						flowProvider.setFlowState('Idle');
						provider.setFlowState('Idle');
					} else if (state.state === FlowState.THRASHING) {
						flowProvider.setFlowState('Thrashing');
						provider.setFlowState('Thrashing');
						// Show confused state and provide helpful message
						provider.sendMessage({ command: 'confused' });
						setTimeout(() => {
							provider.sendMessage({ 
								command: 'helpfulMessage',
								message: '💡 Try breaking it down into smaller steps! You\'ve got this 💪'
							});
							provider.sendMessage({ command: 'talk' });
						}, 2000);
					} else if (state.state === FlowState.FATIGUED) {
						flowProvider.setFlowState('Fatigued');
						provider.setFlowState('Fatigued');
            if (!fatiguedReminderTimeout) {
              fatiguedReminderTimeout = setTimeout(() => {
                provider.sendMessage({
                  command: 'helpfulMessage',
                  message: '😴 You seem tired. Consider taking a break.'
                });
                provider.sendMessage({ command: 'talk' });
                fatiguedReminderTimeout = null;
              }, 10000);
            }
					}
				}
			}
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

  const pirate_disposable = vscode.commands.registerCommand('study-duck.pirate', () => {
    provider.sendMessage({ command: 'pirate' });
  });

  const confused_disposable = vscode.commands.registerCommand('study-duck.confused', () => {
    provider.sendMessage({ command: 'confused' });
  });

  const talk_disposable = vscode.commands.registerCommand('study-duck.talk', () => {
    provider.sendMessage({ command: 'talk' });
  });

	// Periodic keystroke record logging
	const recordInterval = setInterval(() => {
		const allSamples = keystrokeEvents.getAllSamples();
		if (allSamples.length === 0) {
			return;
		}

		// Get the most recent sample
		const latestSample = allSamples[allSamples.length - 1];
		if (latestSample.length < 11) {
			console.log(`[KeyStrokeRecord] Not enough keystrokes yet (${latestSample.length}/11 needed)`);
			return;
		}

		try {
			const record = keystrokesToCMUTrialRow(latestSample, 1, sessionIndex, repCount);
			console.log('[KeyStrokeRecord] Created record:', JSON.stringify(record, null, 2));
			repCount++;
		} catch (err) {
			console.log(`[KeyStrokeRecord] Could not create record: ${err instanceof Error ? err.message : err}`);
		}
	}, RECORD_INTERVAL * 1000);

	context.subscriptions.push(
		hello_world_disposable, 
		event_listener_disposable,
    pirate_disposable,
    confused_disposable,
    talk_disposable,
		{ dispose: () => clearInterval(recordInterval) }
	);
}

export function deactivate() {}

class StudyDuckViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'studyDuckView';
  public _view?: vscode.WebviewView;
  private _timerText = '';
	private _currentStateIndex = 0;
	private readonly _states = ['Focused', 'Flow', 'Idle', 'Thrashing', 'Fatigued'];

  constructor(private readonly _extensionUri: vscode.Uri) {}

	setFlowState(stateName: string) {
    const stateIndex = this._states.indexOf(stateName);
    if (stateIndex !== -1) {
      this._currentStateIndex = stateIndex;
      this._view?.webview.postMessage({ 
        command: 'setState', 
        index: stateIndex,
        label: stateName
      });
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    this.setTitle(this._timerText);
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

  setTitle(timerText: string) {
    this._timerText = timerText;
    if (this._view) {
      this._view.title = `Study Duck ${timerText}`;
    }
}

private _getHtml(webview: vscode.Webview) {
  const duckUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'default.png')
  );
  const blinkingUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'blink_open.png')
  );
  const pirateUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'pirate.png')
  );
  const confusedUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'confused.png')
  );
	const cyclopsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'cyclops.png')
  );
	const destressedUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'destressed.png')
  );
	const sparkleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'sparkle.png')
  );
	const loveUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'love.png')
  );
	const worriedUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'worried.png')
  );
	const blink_closedUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'blink_closed.png')
  );
	const default_closedUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'default_closed.png')
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
    background: #ffffff;
    font-family: sans-serif;
  }
  #duck {
    max-width: 150px;
    max-height: 150px;
    width: auto;
    height: auto;
    margin-top: 8px;
    transition: transform 0.1s ease-in-out;
  }
  #duck.tilting {
    animation: tilt 1s ease-in-out infinite;
  }
  @keyframes tilt {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(15deg); }
    75% { transform: rotate(-15deg); }
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
  #particles {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
  }
  .particle {
    position: absolute;
    font-size: 24px;
    font-weight: bold;
    pointer-events: none;
    animation: float-up 1.5s ease-out forwards;
  }
  @keyframes float-up {
    0% {
      opacity: 1;
      transform: translateY(0) translateX(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-100px) translateX(var(--tx));
    }
  }
</style>
</head>
<body>
  <div id="particles"></div>
  <img id="duck" src="${duckUri}" />
  <div id="message">Hello! I'm your duck 🦆</div>

  <script>
    const vscode = acquireVsCodeApi();
    const duck = document.getElementById('duck');
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

    window.addEventListener('message', event => {
      const msg = event.data;
      const messageDiv = document.getElementById('message');
      if (!duck || !messageDiv) return;

      if (msg.command === 'setState') {
        // Change duck image based on flow state
        const stateImages = {
          'Focused': '${default_closedUri}',
          'Flow': '${loveUri}',
          'Idle': '${worriedUri}',
          'Thrashing': '${confusedUri}',
          'Fatigued': '${destressedUri}'
        };
        duck.src = stateImages[msg.label] || '${duckUri}';
        duck.classList.remove('tilting');
      } else if (msg.command === 'pirate') {
        duck.src = '${pirateUri}';
        messageDiv.textContent = 'Arrr! 🏴‍☠️';
        duck.classList.remove('tilting');
      } else if (msg.command === 'confused') {
        duck.src = '${confusedUri}';
        duck.classList.add('tilting');
      } else if (msg.command === 'helpfulMessage') {
        messageDiv.textContent = msg.message;
        duck.classList.remove('tilting');
      } else if (msg.command === 'talk') {
        duck.classList.remove('tilting');
									
				// Mouth animation while talking
				let mouthFlaps = 0;
				const maxFlaps = 6;
				const flapInterval = setInterval(() => {
					if (mouthFlaps >= maxFlaps) {
						clearInterval(flapInterval);
						duck.src = '${duckUri}';
					} else {
						duck.src = mouthFlaps % 2 === 0 ? '${default_closedUri}' : '${duckUri}';
						mouthFlaps++;
					}
				}, 150);
      } else if (msg.command === 'flowParticles') {
        // Create multiple particles one by one at random positions
        const flowEmojis = ['✨', '⭐', '🌟', '💫', '🎉', '💛'];
        const particleCount = 1;
        const duckRect = duck.getBoundingClientRect();
        const duckCenterX = duckRect.left + duckRect.width / 2;
        const duckCenterY = duckRect.top + duckRect.height / 2;
        
        for (let i = 0; i < particleCount; i++) {
          setTimeout(() => {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            particle.textContent = flowEmojis[Math.floor(Math.random() * flowEmojis.length)];
            
            // Random position around the duck
            const angle = Math.random() * Math.PI * 2;
            const distance = 30 + Math.random() * 40;
            const randomX = duckCenterX + Math.cos(angle) * distance;
            const randomY = duckCenterY + Math.sin(angle) * distance;
            
            particle.style.left = randomX + 'px';
            particle.style.top = randomY + 'px';
            particle.style.setProperty('--tx', (Math.random() - 0.5) * 60 + 'px');
            
            document.getElementById('particles').appendChild(particle);
            
            setTimeout(() => particle.remove(), 1500);
          }, i * 300); // Stagger particles by 80ms each
        }
      }
    });

    // Click to quack
    duck.addEventListener('click', (e) => {
      vscode.postMessage({ command: 'quack' });
      document.getElementById('message').textContent = 'Quack! 🦆';

      duck.style.transform = 'scale(0.92)';
      setTimeout(() => {
        duck.style.transform = 'scale(1)';
      }, 60);
      
      // Create particles from mouse position
      const particleEmojis = ['🦆', '💛', '✨', '⭐', '🎉'];
      for (let i = 0; i < 1; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        particle.textContent = particleEmojis[Math.floor(Math.random() * particleEmojis.length)];
        
        particle.style.left = e.clientX + 'px';
        particle.style.top = e.clientY + 'px';
        particle.style.setProperty('--tx', (Math.random() - 0.5) * 100 + 'px');
        
        document.getElementById('particles').appendChild(particle);
        
        setTimeout(() => particle.remove(), 1500);
      }
    });

    // Blink occasionally (every 3-7 seconds)
    setInterval(() => {
      const duck = document.getElementById('duck');
      const originalSrc = duck.src;
      duck.src = '${blinkingUri}';
      setTimeout(() => {
        duck.src = originalSrc;
      }, 150);
    }, Math.random() * 4000 + 3000);
  </script>
</body>
</html>`;
}
}

class FlowViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'flowView';
  private _view?: vscode.WebviewView;
  private _currentStateIndex = 2;
  private readonly _states = ['Focused', 'Flow', 'Idle', 'Thrashing', 'Fatigued'];

  constructor(private readonly _extensionUri: vscode.Uri) {}

	setFlowState(stateName: string) {
    const stateIndex = this._states.indexOf(stateName);
    if (stateIndex !== -1) {
      this._currentStateIndex = stateIndex;
      this._view?.webview.postMessage({ 
        command: 'setState', 
        index: stateIndex,
        label: stateName
      });
    }
  }

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

    webviewView.webview.onDidReceiveMessage(msg => {
      // Handle any messages from webview if needed
    });

    const meterUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'meter.svg')
    );

    webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      height: 200px;
      max-height: 300px;
      overflow: hidden;
    }
    body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      margin: 0;
      padding: 10px;
      background: #ffffff;
      font-family: sans-serif;
      box-sizing: border-box;
    }
    .meter-container {
      position: relative;
      width: 240px;
      height: 133px;
    }
    img {
      width: 240px;
      height: auto;
      display: block;
    }
    .pointer {
      position: absolute;
      bottom: 20px;
      left: 50%;
      width: 5px;
      height: 93px;
      margin-left: -2.5px;
      background: #000;
      border-radius: 2px;
      transform-origin: bottom center;
      transform: rotate(0deg);
    }
    .pointer::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 16px;
      height: 16px;
      background: #333;
      border-radius: 50%;
    }
    #stateLabel {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      color: #333;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="meter-container">
    <img src="${meterUri}" alt="Meter" id="meter" />
    <div class="pointer" id="pointer"></div>
  </div>
  <div id="stateLabel">Idle</div>

  <script>
    // States: Focused, Flow, Idle, Thrashing, Fatigued
    // Angles: -90° (left) to +90° (right) across the semi-circle
    // 5 segments: each is 36° wide, centered at -72°, -36°, 0°, 36°, 72°
    const stateAngles = {
      'Focused': 62,
      'Flow': 38,
      'Idle': 90,
      'Thrashing': 152,
      'Fatigued': 120
    };
    
    const stateLabel = document.getElementById('stateLabel');
    const pointer = document.getElementById('pointer');
    
    let targetAngle = 0;
    let currentAngle = 0;
    let isTransitioning = false;
    let currentState = 'Idle';
    
    function setPointer(stateName) {
      const angle = stateAngles[stateName] || 0;
      targetAngle = angle - 90;
      currentState = stateName;
      isTransitioning = true;
    }
    
    // Animation loop: smooth transition + oscillation (disabled when Idle)
    function animate() {
      if (isTransitioning) {
        // Smooth transition towards target
        const diff = targetAngle - currentAngle;
        if (Math.abs(diff) < 0.5) {
          currentAngle = targetAngle;
          isTransitioning = false;
        } else {
          currentAngle += diff * 0.08;
        }
        pointer.style.transform = 'rotate(' + currentAngle + 'deg)';
      } else if (currentState !== 'Idle') {
        // Oscillate around target angle (disabled when Idle)
        const oscillation = Math.sin(Date.now() * 0.03) * 1.5;
        pointer.style.transform = 'rotate(' + (targetAngle + oscillation) + 'deg)';
      }
      requestAnimationFrame(animate);
    }
    animate();
    
    // Listen for external state changes
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'setState') {
        stateLabel.textContent = msg.label;
        setPointer(msg.label);
      }
    });
  </script>
			</body>
			</html>`;
				}
			}

