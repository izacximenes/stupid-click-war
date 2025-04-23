// Wait for the HTML document to be fully loaded and parsed
document.addEventListener('DOMContentLoaded', (event) => {

    // --- DOM Elements ---
    const myIdDisplay = document.getElementById('my-id');
    const remoteIdInput = document.getElementById('remote-id-input');
    const connectButton = document.getElementById('connect-button');
    const connectionStatus = document.getElementById('connection-status');
    const connectionGroup = document.getElementById('connection-group');
    const gameGroup = document.getElementById('game-group');

    // Elements inside gameGroup
    const statusOverlay = document.getElementById('status-overlay');
    const statusMessage = document.getElementById('status-message');
    const countdownDisplay = document.getElementById('countdown');
    const resultDisplay = document.getElementById('result');
    const timerDisplay = document.getElementById('timer');
    const tugBarContainer = document.getElementById('tug-bar-container');
    const player1Fill = document.getElementById('player1-fill');
    const player2Fill = document.getElementById('player2-fill');
    const clickButton = document.getElementById('click-button');
    const readyButton = document.getElementById('ready-button');
    const controlsDiv = document.querySelector('.controls');

    // Invite Elements
    const inviteButton = document.getElementById('invite-button');
    const inviteLinkDisplay = document.getElementById('invite-link-display');

    // --- Constants and State Variables ---
    const GAME_DURATION = 20;
    const COUNTDOWN_DURATION = 5;
    const CLICKS_TO_WIN_DIFFERENCE = 50;

    let peer = null;
    let conn = null;
    let myId = null;
    let remoteId = null;
    let amIPlayer1 = null; // Tracks if the local player is Player 1 (true) or Player 2 (false)
    let myPlayerColor = ''; // Stores the local player's main color CSS variable name
    let myPlayerColorDark = ''; // Stores the local player's dark color CSS variable name
    let myScore = 0;
    let opponentScore = 0;
    let gameActive = false;
    let timerInterval = null;
    let countdownInterval = null;
    let timeLeft = GAME_DURATION;
    let countdownLeft = COUNTDOWN_DURATION;
    let imReady = false;
    let opponentReady = false;
    let playAgainTimeoutId = null; // Stores the timeout ID for enabling Play Again
    let autoConnectAttempted = false; // Flag to prevent multiple auto-connects on load

    // --- Check for Invite Link on Load ---
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get('join'); // Using 'join' parameter name

    if (joinId) {
        console.log("Join ID found in URL:", joinId);
        remoteIdInput.value = joinId;
        remoteIdInput.disabled = true; // Disable input if joining via link
        if (inviteButton) inviteButton.style.display = 'none'; // Hide invite button if joining
        connectionStatus.textContent = `Status: Joining ${joinId}...`; // Initial status
    }

    // --- UI Helper Functions ---
    function showConnectionArea() {
        connectionGroup.classList.remove('hidden');
        gameGroup.classList.add('hidden');
        if(statusOverlay) statusOverlay.classList.remove('visible'); // Ensure overlay is hidden
    }

    function showGameArea() {
        connectionGroup.classList.add('hidden');
        gameGroup.classList.remove('hidden');

        statusMessage.textContent = conn ? 'Connected! Click "I\'m Ready!"' : 'Waiting for connection...';
        if(resultDisplay) resultDisplay.textContent = '';
        if(countdownDisplay) countdownDisplay.textContent = '';
        showStatusOverlay(true, 'status');

        if(controlsDiv) controlsDiv.style.visibility = 'visible';
        if(readyButton) readyButton.classList.remove('hidden');

        if(clickButton) clickButton.disabled = true; // Start with click disabled
        if(readyButton) readyButton.disabled = false; // Start with ready enabled
        if(readyButton) readyButton.textContent = "I'm Ready!";

        // Apply the correct color to the (disabled) click button
        applyClickButtonColor();
    }

    function hideGameArea() { // Called on disconnect
        gameGroup.classList.add('hidden');
        connectionGroup.classList.remove('hidden');
        if(statusOverlay) statusOverlay.classList.remove('visible');

        // Reset connection area UI elements
        if(remoteIdInput) {
            remoteIdInput.disabled = false;
            remoteIdInput.value = ''; // Clear opponent ID
        }
        if (connectButton) connectButton.disabled = false; // Re-enable connect button

        connectionStatus.textContent = myId ? 'Status: Waiting for connection...' : 'Status: Disconnected';

        // Show invite button again if applicable
        if (peer && myId && inviteButton) {
            inviteButton.disabled = false;
            inviteButton.style.display = 'inline-block';
        }
        if (inviteLinkDisplay) inviteLinkDisplay.style.display = 'none'; // Hide old link
    }

    // Controls the visibility and main content of the status overlay
    function showStatusOverlay(show, contentType = 'status') {
        if (!statusOverlay || !statusMessage || !countdownDisplay || !resultDisplay) return; // Safety check

        if (show) {
            // Reset result styles UNLESS showing a result
            if (contentType !== 'result') {
                 statusOverlay.classList.remove('status-win', 'status-loss', 'status-draw');
            }

            statusMessage.style.display = 'none';
            countdownDisplay.style.display = 'none';
            resultDisplay.style.display = 'none';

            if (contentType === 'status') statusMessage.style.display = 'block';
            if (contentType === 'countdown') countdownDisplay.style.display = 'block';
            if (contentType === 'result') resultDisplay.style.display = 'block'; // Result text shown here

            statusOverlay.classList.add('visible');
        } else {
            statusOverlay.classList.remove('visible');
             // Optionally remove classes when hiding too, for good measure
             statusOverlay.classList.remove('status-win', 'status-loss', 'status-draw');
        }
    }


    // --- PeerJS Initialization ---
    function initializePeer() {
        // Ensure Peer object exists before creating
        if (typeof Peer === 'undefined') {
            console.error("PeerJS library not loaded!");
            connectionStatus.textContent = "Error: PeerJS library missing.";
            return;
        }
        peer = new Peer(); // ID generated automatically

        peer.on('open', (id) => {
            console.log('My Peer ID is:', id);
            myId = id;
            myIdDisplay.textContent = id;

            // Enable Invite button now that we have an ID, but only if not joining
            if (inviteButton && !joinId) {
                inviteButton.disabled = false;
            }

            // Check if we need to auto-connect based on URL parameter
            const currentJoinId = urlParams.get('join'); // Re-read param in case of race condition
            if (currentJoinId && !autoConnectAttempted) {
                console.log("Peer is open, attempting auto-connect to:", currentJoinId);
                autoConnectAttempted = true; // Set flag

                if (currentJoinId === myId) {
                    alert("Cannot connect to yourself via invite link.");
                    connectionStatus.textContent = 'Status: Cannot join self.';
                    if(remoteIdInput) {
                         remoteIdInput.disabled = false; // Re-enable input
                         remoteIdInput.value = ''; // Clear the input
                    }
                    if (inviteButton) inviteButton.style.display = 'inline-block'; // Show invite button again
                    // Clean URL param
                    window.history.replaceState({}, document.title, window.location.pathname);
                } else {
                    // Trigger connection attempt
                    setTimeout(() => {
                        if (connectButton) {
                            console.log("Triggering connect button click for auto-join.");
                            connectButton.click(); // Programmatically click connect
                        }
                        // Clean the URL parameter AFTER initiating connect attempt
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }, 100); // Small delay ensures 'open' event loop finishes
                }

            } else if (!currentJoinId) {
                // If no joinId, just set status normally
                connectionStatus.textContent = 'Status: Waiting for connection...';
            }
        });

        // Handle incoming connections (Player 2 scenario)
        peer.on('connection', (newConn) => {
            console.log('Received connection from:', newConn.peer);
            if (conn && conn.open) {
                console.log("Already connected, rejecting new connection.");
                newConn.close();
                return;
            }
            amIPlayer1 = false; // The player receiving the connection is Player 2
            console.log("Assigning role: Player 2 (Receiver)");

            // Hide invite elements when connection is received
            if(inviteButton) inviteButton.style.display = 'none';
            if(inviteLinkDisplay) inviteLinkDisplay.style.display = 'none';

            setupConnection(newConn); // Setup the connection object
            remoteId = newConn.peer; // Store opponent's ID
            if(remoteIdInput){
                 remoteIdInput.value = remoteId; // Display opponent's ID
                 remoteIdInput.disabled = true; // Disable input
            }
            if (connectButton) connectButton.disabled = true; // Disable connect button
            connectionStatus.textContent = `Status: Connected to ${remoteId}`;
            // Further setup (showing game area etc.) happens in setupConnection's 'open' event
        });

        peer.on('disconnected', () => {
            console.log('Disconnected from PeerJS server. Attempting to reconnect...');
            setTimeout(() => {
                if (peer && !peer.destroyed) {
                    try {
                        peer.reconnect();
                    } catch (error) {
                        console.error("Error reconnecting:", error);
                        handleDisconnect(true); // Treat as critical if reconnect fails hard
                    }
                }
            }, 3000);
        });

        peer.on('close', () => {
            console.log('Peer connection closed.');
            handleDisconnect(true); // Treat peer closing as critical
        });

        peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
            connectionStatus.textContent = `Status: Error (${err.type})`;
            // Reset auto-connect flag on failure
             if (autoConnectAttempted && (err.type === 'peer-unavailable' || err.type === 'network')) {
                 autoConnectAttempted = false;
             }

            // Only enable buttons if the error is potentially recoverable by user action
            // AND if not currently trying to auto-connect (unless it failed)
            if (!joinId || autoConnectAttempted === false) {
                 if (err.type === 'peer-unavailable' || err.type === 'invalid-id' || err.type === 'unavailable-id' || err.type === 'network') {
                     if (connectButton) connectButton.disabled = false;
                     if (remoteIdInput) remoteIdInput.disabled = false;
                 }
             }

             if (err.type === 'peer-unavailable') {
                alert(`Opponent with ID ${remoteIdInput ? remoteIdInput.value : 'UNKNOWN'} not found.`);
                connectionStatus.textContent = 'Status: Opponent not found.';
                // Clean URL if auto-connect failed because peer wasn't found
                if(joinId) window.history.replaceState({}, document.title, window.location.pathname);
            } else if (err.type !== 'server-error' && err.type !== 'socket-error' && err.type !== 'socket-closed' && err.type !== 'network') {
                 alert(`Connection error: ${err.message}`); // Alert less common errors
            } else {
                 console.warn(`Non-alerted PeerJS error: ${err.type} - ${err.message}`); // Log network issues quietly
            }
        });
    }

    // --- Connection Logic ---

    // Event listener for the manual connect button
    if (connectButton) {
        connectButton.addEventListener('click', () => {
             // Assign Player 1 role if not already assigned (manual connect = P1)
            if (amIPlayer1 === null) {
                amIPlayer1 = true;
                console.log("Assigning role: Player 1 (Initiator)");
            } else {
                console.log("Connect clicked, role already assigned:", amIPlayer1 ? "P1" : "P2");
            }

            remoteId = remoteIdInput.value.trim(); // Read ID from input
            if (!peer || !remoteId) {
                alert('Please wait for your ID and enter the Opponent\'s ID.');
                return;
            }
            if (remoteId === myId) {
                alert('You cannot connect to yourself!');
                return;
            }

            console.log(`Attempting to connect to: ${remoteId}`);
            connectionStatus.textContent = `Status: Connecting to ${remoteId}...`;
            connectButton.disabled = true;
            if(remoteIdInput) remoteIdInput.disabled = true; // Disable input during connection attempt

            // Hide invite elements on manual connect too
            if(inviteButton) inviteButton.style.display = 'none';
            if(inviteLinkDisplay) inviteLinkDisplay.style.display = 'none';

            const newConn = peer.connect(remoteId, { reliable: true });
            setupConnection(newConn);
        });
    } else {
        console.error("Could not find connect button element!");
    }

    // Event listener for the invite button
    if (inviteButton) {
        inviteButton.addEventListener('click', () => {
            if (!myId) {
                alert("Please wait for your ID to be generated.");
                return;
            }

            const baseUrl = window.location.origin + window.location.pathname;
            const inviteUrl = `${baseUrl}?join=${myId}`;

            if(inviteLinkDisplay) {
                inviteLinkDisplay.textContent = `Share this link: ${inviteUrl}`;
                inviteLinkDisplay.style.display = 'block'; // Show the link
            }

            // Attempt to copy to clipboard
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(inviteUrl).then(() => {
                    alert("Invite link copied to clipboard!");
                }).catch(err => {
                    console.error('Failed to copy invite link automatically: ', err);
                    alert("Could not copy link automatically. Please copy it manually.");
                });
            } else {
                alert("Please copy the invite link shown below."); // Fallback
            }
        });
    }

    // Sets up event listeners for a PeerJS connection object
    function setupConnection(newConn) {
        conn = newConn; // Store the connection object

        conn.on('open', () => {
            console.log(`Connection established with ${conn.peer}`);
            remoteId = conn.peer;
            connectionStatus.textContent = `Status: Connected to ${conn.peer}`;

            // Ensure UI reflects connected state
            if(remoteIdInput) {
                remoteIdInput.value = remoteId;
                remoteIdInput.disabled = true;
            }
            if (connectButton) connectButton.disabled = true;

            // Hide invite elements on successful connection
            if(inviteButton) inviteButton.style.display = 'none';
            if(inviteLinkDisplay) inviteLinkDisplay.style.display = 'none';

            assignPlayerColors(); // Determine and apply player colors
            resetGameVariables(); // Reset scores and game state
            showGameArea(); // Display the main game interface
            updateBar(); // Initialize the progress bar to 50/50
        });

        // Handle received data (clicks, ready status, etc.)
        conn.on('data', (data) => {
            // console.log('Data received:', data); // Can be noisy, uncomment if needed
            handleData(data);
        });

        // Handle connection closing
        conn.on('close', () => {
            console.log(`Connection with ${conn.peer || remoteId} closed.`);
            handleDisconnect(); // Trigger disconnection logic
        });

        // Handle connection errors
        conn.on('error', (err) => {
            console.error(`Connection error with ${conn.peer || remoteId}: `, err);
            handleDisconnect(); // Treat connection errors as disconnections
        });
    }

    // Assigns player colors based on their role (P1 or P2)
    function assignPlayerColors() {
        if (amIPlayer1 === null) {
            console.error("Player role (amIPlayer1) not assigned before assigning colors!");
            return;
        }
        if (amIPlayer1) { // Player 1 is Green
            myPlayerColor = 'var(--player1-color)';
            myPlayerColorDark = 'var(--player1-color-dark)';
            console.log("My color: Green");
        } else { // Player 2 is Red
            myPlayerColor = 'var(--player2-color)';
            myPlayerColorDark = 'var(--player2-color-dark)';
            console.log("My color: Red");
        }
        applyClickButtonColor(); // Apply the assigned color to the button
    }

    // Applies the assigned color style to the main click button
    function applyClickButtonColor() {
        if (!clickButton || !myPlayerColor || !myPlayerColorDark) return; // Safety check

        clickButton.style.backgroundColor = myPlayerColor;
        // Use the dark color variable directly for the box-shadow
        clickButton.style.boxShadow = `0 4px 0px ${amIPlayer1 ? 'var(--player1-color-dark)' : 'var(--player2-color-dark)'}`;
    }

    // Resets the click button style to its default (usually when disabled or disconnected)
    function resetClickButtonStyle() {
        if (!clickButton) return;
        clickButton.style.backgroundColor = ''; // Revert to CSS default
        clickButton.style.boxShadow = '';
    }

    // Handles disconnection logic
    function handleDisconnect(critical = false) {
        // Clear the play again timeout if it's pending
        if (playAgainTimeoutId) {
            clearTimeout(playAgainTimeoutId);
            playAgainTimeoutId = null;
            console.log("Cleared play again timeout due to disconnect.");
        }

        if (conn) {
            conn.close(); // Attempt to gracefully close the connection
            conn = null;
            alert('Opponent disconnected or connection lost.');
        }
        clearTimers(); // Stop any game timers
        resetGameVariables(); // Reset scores and flags
        hideGameArea(); // Show the connection area again
        resetClickButtonStyle(); // Reset button style

        // Reset player role and color assignment
        amIPlayer1 = null;
        myPlayerColor = '';
        myPlayerColorDark = '';

        // Handle critical errors or standard disconnect UI reset
        if (critical && peer) {
            connectionStatus.textContent = 'Status: Critical error. Please reload.';
            myIdDisplay.textContent = "Error";
            peer.destroy(); // Destroy the peer object
            peer = null;
        } else if (peer && myId) {
            // UI should already be mostly reset by hideGameArea()
        }
    }

    // --- P2P Data Logic ---

    // Processes data received from the opponent
    function handleData(data) {
        switch (data.type) {
            case 'click': // Opponent clicked
                if (gameActive) {
                    opponentScore++;
                    triggerShake(); // Visual feedback
                    updateBar(); // Update progress bar
                    checkWinCondition(); // Check if opponent won
                }
                break;
            case 'ready': // Opponent is ready
                opponentReady = true;
                statusMessage.textContent = 'Opponent is ready!';
                showStatusOverlay(true, 'status');
                checkBothReady(); // Check if game can start
                break;
            case 'reset': // Opponent requests reset (e.g., after game ends)
                console.log("Opponent requested reset.");
                resetGameUI(); // Reset the game UI for a new round
                break;
        }
    }

    // Sends data to the connected opponent
    function sendData(type, payload = {}) {
        if (conn && conn.open) {
            try {
                conn.send({ type, ...payload });
            } catch (error) {
                console.error("Error sending data:", error);
                handleDisconnect(); // Disconnect if sending fails
            }
        } else {
            console.warn("Attempting to send data without an active connection.");
        }
    }

    // --- Game Logic ---

    // Resets core game variables (scores, flags)
    function resetGameVariables() {
        myScore = 0;
        opponentScore = 0;
        gameActive = false;
        imReady = false;
        opponentReady = false;
        timeLeft = GAME_DURATION;
        countdownLeft = COUNTDOWN_DURATION;
    }

    // Resets the game UI to the state before a match starts
    function resetGameUI() {
        resetGameVariables(); // Reset underlying variables
        clearTimers(); // Stop any active timers

        // Reset overlay style before showing status
        if(statusOverlay) {
            statusOverlay.classList.remove('status-win', 'status-loss', 'status-draw');
        }

        updateBar(); // Set bar to 50/50
        if(timerDisplay) {
            timerDisplay.textContent = `Time: ${GAME_DURATION}s`;
            timerDisplay.style.visibility = 'hidden'; // Hide timer initially
        }
        if(countdownDisplay) countdownDisplay.textContent = '';
        if(resultDisplay) resultDisplay.textContent = '';
        if(statusMessage) statusMessage.textContent = 'Click "Play Again?" to start a new match!'; // Update text
        showStatusOverlay(true, 'status'); // Show status message (will have default style)

        if(clickButton) clickButton.disabled = true;
        applyClickButtonColor(); // Apply color to disabled button

        // Handle the 'Play Again?' button state
        if(readyButton) {
            readyButton.disabled = false; // Should be enabled here after reset
            readyButton.textContent = "Play Again?";
            readyButton.classList.remove('hidden');
        }
        if(controlsDiv) controlsDiv.style.visibility = 'visible';
    }

    // Updates the width of the player fill divs based on scores
    function updateBar() {
        let scoreDifference;
        if (amIPlayer1 === null) return; // Don't update if role isn't set

        // Calculate difference from Player 1's perspective (P1 Score - P2 Score)
        if (amIPlayer1) {
            scoreDifference = myScore - opponentScore;
        } else {
            scoreDifference = opponentScore - myScore; // opponentScore is P1 score
        }

        // Map difference to a percentage for Player 1 (0-100)
        let player1Percentage = 50 + (scoreDifference / CLICKS_TO_WIN_DIFFERENCE) * 50;
        player1Percentage = Math.max(0, Math.min(100, player1Percentage)); // Clamp

        const player2Percentage = 100 - player1Percentage;

        // Apply widths (CSS handles the colors via variables)
        if(player1Fill) player1Fill.style.width = `${player1Percentage}%`; // Green fill %
        if(player2Fill) player2Fill.style.width = `${player2Percentage}%`; // Red fill %
    }

    // Triggers a visual shake effect on the progress bar
    let shakeTimeout = null;
    function triggerShake() {
        if (shakeTimeout) clearTimeout(shakeTimeout); // Prevent overlapping shakes
        if (tugBarContainer) {
            tugBarContainer.classList.add('shake');
            shakeTimeout = setTimeout(() => {
                if (tugBarContainer) tugBarContainer.classList.remove('shake');
            }, 150); // Duration slightly longer than CSS animation
        }
    }

    // Event listener for the main click button
    if (clickButton) {
        clickButton.addEventListener('click', () => {
            if (!gameActive || !conn) return; // Only works during active game
            myScore++;
            triggerShake(); // Visual feedback
            updateBar(); // Update progress
            sendData('click'); // Inform opponent
            checkWinCondition(); // Check if local player won
        });
    } else { console.error("Click button not found"); }

    // Event listener for the "Ready" / "Play Again?" button
    if (readyButton) {
        readyButton.addEventListener('click', () => {
            if (!conn || !conn.open) {
                alert("You need to be connected to an opponent first!");
                return;
            }
            if (imReady) return; // Prevent multiple clicks

            imReady = true;
            readyButton.disabled = true;
            readyButton.textContent = "Waiting for Opponent...";
            if(statusMessage) statusMessage.textContent = 'You are ready! Waiting for opponent...';
            showStatusOverlay(true, 'status');
            sendData('ready'); // Inform opponent
            checkBothReady(); // Check if game can start
        });
    } else { console.error("Ready button not found"); }

    // Checks if both players are ready and starts the countdown
    function checkBothReady() {
        if (imReady && opponentReady) {
            console.log("Both ready! Starting countdown...");
            if(statusMessage) statusMessage.textContent = ''; // Clear status message
            showStatusOverlay(true, 'countdown'); // Show countdown display
            if(controlsDiv) controlsDiv.style.visibility = 'hidden'; // Hide buttons during countdown
            startCountdown();
        }
    }

    // Starts the pre-game countdown timer
    function startCountdown() {
        countdownLeft = COUNTDOWN_DURATION;
        if(countdownDisplay) countdownDisplay.textContent = countdownLeft;
        if(timerDisplay) timerDisplay.style.visibility = 'hidden'; // Timer not visible yet
        if(clickButton) clickButton.disabled = true; // Clicking disabled during countdown
        applyClickButtonColor(); // Ensure button color is correct (though disabled)

        clearTimers(); // Clear any residual timers

        countdownInterval = setInterval(() => {
            countdownLeft--;
            if(countdownDisplay) countdownDisplay.textContent = countdownLeft > 0 ? countdownLeft : 'GO!';
            if (countdownLeft <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                // Brief pause after "GO!" before starting the game
                setTimeout(() => {
                    showStatusOverlay(false); // Hide the overlay
                    startGame(); // Start the actual game
                }, 500); // 0.5 second delay
            }
        }, 1000);
    }

    // Starts the main game logic and timer
    function startGame() {
        console.log("Game started!");
        gameActive = true;
        timeLeft = GAME_DURATION; // Reset timer

        if(resultDisplay) resultDisplay.textContent = ''; // Clear previous result
        if(timerDisplay) {
            timerDisplay.textContent = `Time: ${timeLeft}s`;
            timerDisplay.style.visibility = 'visible'; // Show timer
        }
        if(clickButton) clickButton.disabled = false; // ENABLE CLICKING!
        applyClickButtonColor(); // Ensure correct color for enabled state
        if(controlsDiv) controlsDiv.style.visibility = 'visible'; // Show controls (mainly click button)
        if(readyButton) readyButton.classList.add('hidden'); // Hide 'Ready' button during the match

        clearTimers(); // Clear countdown timer if somehow still running

        timerInterval = setInterval(() => {
            timeLeft--;
            if(timerDisplay) timerDisplay.textContent = `Time: ${timeLeft}s`;
            if (timeLeft <= 0) {
                endGame(false); // End game if time runs out
            }
        }, 1000);
    }

    // Clears all game-related timers (countdown and main game timer)
    function clearTimers() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // Checks if a player has won by pushing the bar fully
    function checkWinCondition() {
        if (!gameActive || amIPlayer1 === null) return;

        // Calculate difference from Player 1's perspective
        let scoreDifference;
        if (amIPlayer1) {
            scoreDifference = myScore - opponentScore;
        } else {
            scoreDifference = opponentScore - myScore;
        }

        // Check win conditions based on P1's advantage
        if (scoreDifference >= CLICKS_TO_WIN_DIFFERENCE) { // P1 wins
            if(player1Fill) player1Fill.style.width = '100%'; // Ensure visual completion
            if(player2Fill) player2Fill.style.width = '0%';
            endGame(true, amIPlayer1 ? 'You' : 'Opponent'); // Determine winner name
        } else if (scoreDifference <= -CLICKS_TO_WIN_DIFFERENCE) { // P2 wins
            if(player1Fill) player1Fill.style.width = '0%';
            if(player2Fill) player2Fill.style.width = '100%';
            endGame(true, !amIPlayer1 ? 'You' : 'Opponent'); // Determine winner name
        }
    }

    // Handles the end of the game (win, lose, draw, time up)
    function endGame(wonByPush, winnerName = null) { // winnerName is 'You' or 'Opponent'
        // Prevent multiple calls if already ended
        if (!gameActive && !wonByPush && !timerInterval && !countdownInterval) {
            return;
        }

        console.log("Game Over!");
        const wasActive = gameActive; // Store if game was truly active before this call
        gameActive = false; // Stop the game state
        if(clickButton) clickButton.disabled = true;
        applyClickButtonColor(); // Keep color, but button is disabled
        clearTimers(); // Stop game timers

        // Clear any pending Play Again enable timeout
        if (playAgainTimeoutId) {
            clearTimeout(playAgainTimeoutId);
            playAgainTimeoutId = null;
            console.log("Cleared previous play again timeout.");
        }

        let winner = 'Draw'; // Default result
        let finalMessage = ''; // Variable for the main win/loss/draw message

        // --- Determine the actual winner ('You', 'Opponent', or 'Draw') ---
        if (wonByPush) {
            winner = winnerName; // Winner determined by push
        } else { // Time ran out, determine by score
            if (amIPlayer1 !== null) {
                let p1Score = amIPlayer1 ? myScore : opponentScore;
                let p2Score = !amIPlayer1 ? myScore : opponentScore;
                let winnerPlayer = 'Draw';
                if (p1Score > p2Score) winnerPlayer = 'P1';
                else if (p2Score > p1Score) winnerPlayer = 'P2';

                if (winnerPlayer === 'P1') winner = amIPlayer1 ? 'You' : 'Opponent';
                else if (winnerPlayer === 'P2') winner = !amIPlayer1 ? 'You' : 'Opponent';
                else winner = 'Draw';
            } else {
                winner = 'Draw'; // Fallback if role is somehow unknown
                console.error("Cannot determine winner by score, amIPlayer1 is null.");
            }
        }
        // --- End of Winner Determination ---


        // --- Set Message, Style Overlay, and Trigger Confetti ---
        if(statusOverlay) { // Ensure overlay exists
            // Reset overlay classes first
            statusOverlay.classList.remove('status-win', 'status-loss', 'status-draw');

            if (winner === 'You') {
                finalMessage = "You WIN!";
                statusOverlay.classList.add('status-win'); // Add WIN class
                console.log("Winner: You! Firing confetti!");
                // Check if confetti function exists (from the library)
                if (typeof confetti === 'function') {
                    confetti({
                        particleCount: 150,
                        spread: 100,
                        origin: { y: 0.7 }
                    });
                } else {
                    console.warn("Confetti function not found. Was the library loaded?");
                }
            } else if (winner === 'Opponent') {
                finalMessage = "You LOSE...";
                statusOverlay.classList.add('status-loss'); // Add LOSS class
                console.log("Winner: Opponent.");
            } else { // Draw
                finalMessage = "It's a Draw!";
                statusOverlay.classList.add('status-draw'); // Add DRAW class
                console.log("Result: Draw.");
            }
        }
        // ---------------------------------------------------------

        // Append scores for context (wrap score in a span for potential styling)
        const scoreString = `<span>(${myScore} vs ${opponentScore})</span>`;
        // Use innerHTML to render the span correctly
        if(resultDisplay) resultDisplay.innerHTML = `${finalMessage} ${scoreString}`;
        showStatusOverlay(true, 'result'); // Show the result overlay

        // Prepare the 'Play Again?' button state
        imReady = false;
        opponentReady = false;
        if(readyButton) {
            readyButton.textContent = "Play Again?";
            readyButton.classList.remove('hidden');
            readyButton.disabled = true; // *** START DISABLED ***
        }
       if(controlsDiv) controlsDiv.style.visibility = 'visible';

        // Start 3-second delay before enabling 'Play Again?'
        console.log("Starting 3-second delay before enabling Play Again button.");
        playAgainTimeoutId = setTimeout(() => {
            // Only enable if still connected and game hasn't restarted/readied
            if (conn && conn.open && !gameActive && !imReady && readyButton) {
                readyButton.disabled = false; // *** ENABLE AFTER DELAY ***
                console.log("Play Again button enabled after delay.");
            } else {
                console.log("Play Again button NOT enabled (disconnected, game restarted, or already ready?).");
                if ((!conn || !conn.open) && readyButton) {
                    readyButton.disabled = true; // Keep disabled if disconnected
                }
            }
            playAgainTimeoutId = null; // Clear the ID
        }, 3000); // 3 seconds

        // Inform opponent to reset their UI if the game was active
        if (wasActive) {
            // Send reset slightly delayed to allow result message display
            setTimeout(() => sendData('reset'), 100);
        }
    }


    // --- Initialization ---
    initializePeer(); // Start PeerJS setup

    // Set initial UI state based on URL parameters
    if (!joinId) {
        showConnectionArea(); // Show connection area normally
    } else {
        // If joining, connection area is shown, but some parts are modified/disabled
        showConnectionArea(); // Still need to hide game area
    }
    if(timerDisplay) timerDisplay.style.visibility = 'hidden'; // Hide timer initially
    if(controlsDiv) controlsDiv.style.visibility = 'hidden'; // Hide game controls initially

}); // End of DOMContentLoaded listener