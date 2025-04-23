// --- Elementos do DOM ---
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id-input');
const connectButton = document.getElementById('connect-button');
const connectionStatus = document.getElementById('connection-status');
const connectionGroup = document.getElementById('connection-group'); // Novo
const gameGroup = document.getElementById('game-group'); // Novo

// Elementos dentro do gameGroup
const statusOverlay = document.getElementById('status-overlay'); // Novo
const statusMessage = document.getElementById('status-message');
const countdownDisplay = document.getElementById('countdown');
const resultDisplay = document.getElementById('result');
const timerDisplay = document.getElementById('timer');
const tugBarContainer = document.getElementById('tug-bar-container'); // Container da barra
const player1Fill = document.getElementById('player1-fill'); // Novo
const player2Fill = document.getElementById('player2-fill'); // Novo
const clickButton = document.getElementById('click-button');
const readyButton = document.getElementById('ready-button');
const controlsDiv = document.querySelector('.controls'); // Div dos botões


// --- Constantes e Variáveis de Estado ---
const GAME_DURATION = 20;
const COUNTDOWN_DURATION = 5;
const CLICKS_TO_WIN_DIFFERENCE = 50; // Mantém a mesma lógica de diferença

let peer = null;
let conn = null;
let myId = null;
let remoteId = null;

let myScore = 0;
let opponentScore = 0;
let gameActive = false;
let timerInterval = null;
let countdownInterval = null;
let timeLeft = GAME_DURATION;
let countdownLeft = COUNTDOWN_DURATION;
let imReady = false;
let opponentReady = false;

// --- Funções Auxiliares de UI ---

function showConnectionArea() {
    connectionGroup.classList.remove('hidden');
    gameGroup.classList.add('hidden');
    statusOverlay.classList.remove('visible'); // Garante que overlay esteja oculto
}

function showGameArea() {
    connectionGroup.classList.add('hidden');
    gameGroup.classList.remove('hidden');

    // Status inicial é mostrado no overlay
    statusMessage.textContent = conn ? 'Conectado! Clique em "Estou Pronto!"' : 'Aguardando conexão...';
    resultDisplay.textContent = ''; // Limpa resultado
    countdownDisplay.textContent = ''; // Limpa countdown
    showStatusOverlay(true, 'status'); // Mostra overlay com a mensagem de status inicial

    // *** ADICIONAR ESTAS DUAS LINHAS ***
    controlsDiv.style.visibility = 'visible'; // Torna o container dos botões visível
    readyButton.classList.remove('hidden'); // Garante que o botão "Pronto" especificamente não esteja escondido

    // Garante que o botão de clique comece desabilitado e o de pronto habilitado
    clickButton.disabled = true;
    readyButton.disabled = false;
    readyButton.textContent = "Estou Pronto!"; // Reseta o texto do botão
}

function hideGameArea() { // Chamado na desconexão
    gameGroup.classList.add('hidden');
    connectionGroup.classList.remove('hidden');
    statusOverlay.classList.remove('visible');
    // Resetar UI da conexão
    remoteIdInput.disabled = false;
    connectButton.disabled = false;
    connectionStatus.textContent = myId ? 'Status: Aguardando conexão...' : 'Status: Desconectado';
}

// Controla a visibilidade e o conteúdo principal do overlay de status
function showStatusOverlay(show, contentType = 'status' | 'countdown' | 'result') {
    if (show) {
        // Esconde todos os conteúdos primeiro
        statusMessage.style.display = 'none';
        countdownDisplay.style.display = 'none';
        resultDisplay.style.display = 'none';

        // Mostra o conteúdo desejado
        if (contentType === 'status') statusMessage.style.display = 'block';
        if (contentType === 'countdown') countdownDisplay.style.display = 'block';
        if (contentType === 'result') resultDisplay.style.display = 'block';

        statusOverlay.classList.add('visible');
    } else {
        statusOverlay.classList.remove('visible');
    }
}


// --- Inicialização do PeerJS (sem mudanças significativas) ---
function initializePeer() {
    peer = new Peer(); // ID gerado automaticamente

    peer.on('open', (id) => {
        console.log('Meu Peer ID é:', id);
        myId = id;
        myIdDisplay.textContent = id;
        connectionStatus.textContent = 'Status: Aguardando conexão...';
    });

    peer.on('connection', (newConn) => {
        console.log('Recebi uma conexão de:', newConn.peer);
        if (conn && conn.open) {
            newConn.close();
            return;
        }
        setupConnection(newConn);
        remoteId = newConn.peer;
        remoteIdInput.value = remoteId;
        remoteIdInput.disabled = true;
        connectButton.disabled = true;
        connectionStatus.textContent = `Status: Conectado com ${remoteId}`;
        resetGameVariables(); // Reseta ao conectar
        showGameArea(); // Mostra a área do jogo
        updateBar(); // Define a barra para 50/50
    });

    peer.on('disconnected', () => {
        console.log('Desconectado do servidor PeerJS. Tentando reconectar...');
        // Tenta reconectar após um pequeno atraso
        setTimeout(() => {
             if(peer && !peer.destroyed) {
                try {
                 peer.reconnect();
                } catch (error) {
                    console.error("Erro ao reconectar:", error);
                    handleDisconnect(true); // Erro crítico
                }
             }
        }, 3000);
    });

    peer.on('close', () => {
        console.log('Conexão Peer fechada.');
        handleDisconnect(true); // Considera como desconexão crítica
    });

    peer.on('error', (err) => {
        console.error('Erro PeerJS:', err);
        connectionStatus.textContent = `Status: Erro (${err.type})`;
        // alert(`Erro de conexão: ${err.message}`); // Pode ser irritante
        connectButton.disabled = false;
        remoteIdInput.disabled = false;
         if (err.type === 'peer-unavailable') {
             alert(`Oponente com ID ${remoteIdInput.value} não encontrado.`);
             connectionStatus.textContent = 'Status: Oponente não encontrado.';
         } else {
              alert(`Erro de conexão: ${err.message}`);
         }
    });
}

// --- Conexão (sem mudanças significativas) ---
connectButton.addEventListener('click', () => {
    remoteId = remoteIdInput.value.trim();
    if (!peer || !remoteId) {
        alert('Aguarde seu ID ser gerado e insira o ID do oponente.');
        return;
    }
    if (remoteId === myId) {
        alert('Você não pode se conectar a si mesmo!');
        return;
    }

    console.log(`Tentando conectar com: ${remoteId}`);
    connectionStatus.textContent = `Status: Conectando a ${remoteId}...`;
    connectButton.disabled = true;
    remoteIdInput.disabled = true;

    const newConn = peer.connect(remoteId, { reliable: true });
    setupConnection(newConn);
});

function setupConnection(newConn) {
    conn = newConn;

    conn.on('open', () => {
        console.log(`Conexão estabelecida com ${conn.peer}`);
        remoteId = conn.peer; // Garante que remoteId está correto
        connectionStatus.textContent = `Status: Conectado com ${conn.peer}`;
        remoteIdInput.value = remoteId;
        remoteIdInput.disabled = true;
        connectButton.disabled = true;
        resetGameVariables(); // Reseta ao conectar
        showGameArea(); // Mostra a área de jogo
        updateBar(); // Define a barra para 50/50
    });

    conn.on('data', (data) => {
        console.log('Dados recebidos:', data);
        handleData(data);
    });

    conn.on('close', () => {
        console.log(`Conexão com ${conn.peer || remoteId} fechada.`);
        handleDisconnect();
    });

    conn.on('error', (err) => {
        console.error(`Erro na conexão com ${conn.peer || remoteId}:`, err);
        handleDisconnect(); // Considera como desconexão
    });
}

function handleDisconnect(critical = false) {
    if (conn) { // Evita múltiplas chamadas
        conn = null; // Limpa a conexão
        alert('O oponente desconectou ou a conexão foi perdida.');
    }
    clearTimers();
    resetGameVariables();
    hideGameArea(); // Volta para a tela de conexão

    if (critical && peer) {
         connectionStatus.textContent = 'Status: Erro crítico. Recarregue a página.';
         myIdDisplay.textContent = "Erro";
         peer.destroy(); // Destroi o peer em caso de erro crítico irrecuperável
         peer = null;
    } else if (peer && myId) {
         connectionStatus.textContent = 'Status: Aguardando conexão...';
    }
}

// --- Lógica de Dados P2P (sem mudanças significativas) ---
function handleData(data) {
    switch (data.type) {
        case 'click':
            if (gameActive) {
                opponentScore++;
                triggerShake(); // Opcional: Tremer a barra com clique do oponente
                updateBar();
                checkWinCondition();
            }
            break;
        case 'ready':
            opponentReady = true;
            statusMessage.textContent = 'Oponente está pronto!';
            showStatusOverlay(true, 'status'); // Mostra no overlay
            checkBothReady();
            break;
        case 'reset':
             console.log("Oponente solicitou reset.");
             resetGameUI();
             break;
    }
}

function sendData(type, payload = {}) {
    if (conn && conn.open) {
        try {
            conn.send({ type, ...payload });
        } catch (error) {
            console.error("Erro ao enviar dados:", error);
            handleDisconnect(); // Desconecta se houver erro ao enviar
        }
    } else {
        console.warn("Tentativa de enviar dados sem conexão ativa.");
        // Talvez desconectar aqui também?
        // handleDisconnect();
    }
}

// --- Lógica do Jogo ---

function resetGameVariables() {
    myScore = 0;
    opponentScore = 0;
    gameActive = false;
    imReady = false;
    opponentReady = false;
    timeLeft = GAME_DURATION;
    countdownLeft = COUNTDOWN_DURATION;
}

function resetGameUI() {
    resetGameVariables();
    clearTimers();

    updateBar(); // Reseta a barra para 50/50
    timerDisplay.textContent = `Tempo: ${GAME_DURATION}s`;
    timerDisplay.style.visibility = 'hidden'; // Esconde timer até começar
    countdownDisplay.textContent = '';
    resultDisplay.textContent = '';
    statusMessage.textContent = 'Clique em "Estou Pronto!" para jogar novamente.';
    showStatusOverlay(true, 'status'); // Mostra overlay com status

    clickButton.disabled = true;
    readyButton.disabled = false;
    readyButton.textContent = "Jogar Novamente?";
    controlsDiv.style.visibility = 'visible'; // Garante que botões estejam visíveis
}

// *** FUNÇÃO PRINCIPAL DA BARRA ATUALIZADA ***
function updateBar() {
    const difference = myScore - opponentScore;
    // Calcula a porcentagem controlada pelo jogador 1 (0 a 100)
    let player1Percentage = 50 + (difference / CLICKS_TO_WIN_DIFFERENCE) * 50;
    player1Percentage = Math.max(0, Math.min(100, player1Percentage)); // Limita entre 0 e 100

    const player2Percentage = 100 - player1Percentage;

    player1Fill.style.width = `${player1Percentage}%`;
    player2Fill.style.width = `${player2Percentage}%`;

    // Opcional: Mudar a cor da barra ou adicionar efeito quando perto do fim?
    // Ex: container.style.borderColor = player1Percentage > 90 ? 'gold' : 'initial';
}

// Opcional: Função para tremer a barra
let shakeTimeout = null;
function triggerShake() {
    if(shakeTimeout) clearTimeout(shakeTimeout); // Evita acumular timeouts
    tugBarContainer.classList.add('shake');
    shakeTimeout = setTimeout(() => {
        tugBarContainer.classList.remove('shake');
    }, 150); // Duração do shake (ligeiramente maior que a animação CSS)
}


clickButton.addEventListener('click', () => {
    if (!gameActive || !conn) return;

    myScore++;
    triggerShake(); // Tremer a barra ao clicar
    updateBar();
    sendData('click');
    checkWinCondition();
});

readyButton.addEventListener('click', () => {
    if (!conn || !conn.open) {
        alert("Você precisa estar conectado a um oponente primeiro!");
        return;
    }
    imReady = true;
    readyButton.disabled = true;
    readyButton.textContent = "Aguardando Oponente...";
    statusMessage.textContent = 'Você está pronto! Aguardando oponente...';
    showStatusOverlay(true, 'status'); // Atualiza overlay
    sendData('ready');
    checkBothReady();
});

function checkBothReady() {
    if (imReady && opponentReady) {
        console.log("Ambos prontos! Iniciando contagem regressiva...");
        statusMessage.textContent = ''; // Limpa mensagem de status
        showStatusOverlay(true, 'countdown'); // Mostra overlay com countdown
        controlsDiv.style.visibility = 'hidden'; // Esconde botões durante countdown/jogo
        startCountdown();
    }
}

function startCountdown() {
    countdownLeft = COUNTDOWN_DURATION;
    countdownDisplay.textContent = countdownLeft;
    timerDisplay.style.visibility = 'hidden'; // Esconde timer durante countdown
    clickButton.disabled = true;

    clearTimers();

    countdownInterval = setInterval(() => {
        countdownLeft--;
        countdownDisplay.textContent = countdownLeft > 0 ? countdownLeft : 'VAI!';
        if (countdownLeft <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            // Breve pausa antes de esconder o "VAI!" e começar
            setTimeout(() => {
                 showStatusOverlay(false); // Esconde o overlay
                 startGame();
            }, 500); // Meio segundo para ler "VAI!"
        }
    }, 1000);
}

function startGame() {
    console.log("Jogo iniciado!");
    gameActive = true;
    // Scores são resetados em resetGameUI/resetGameVariables
    // myScore = 0;
    // opponentScore = 0;
    timeLeft = GAME_DURATION;
    // updateBar(); // Barra já deve estar em 50/50 de resetGameUI

    resultDisplay.textContent = '';
    timerDisplay.textContent = `Tempo: ${timeLeft}s`;
    timerDisplay.style.visibility = 'visible'; // Mostra o timer
    clickButton.disabled = false;
    controlsDiv.style.visibility = 'visible'; // Mostra o botão de clique
    readyButton.classList.add('hidden'); // Esconde o botão "pronto"


    clearTimers();

    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = `Tempo: ${timeLeft}s`;

        if (timeLeft <= 0) {
            endGame(false); // Acabou o tempo
        }
    }, 1000);
}

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

function checkWinCondition() {
    if (!gameActive) return;

    const difference = myScore - opponentScore;

    if (difference >= CLICKS_TO_WIN_DIFFERENCE) {
        player1Fill.style.width = '100%'; // Garante preenchimento total visual
        player2Fill.style.width = '0%';
        endGame(true, 'Você');
    } else if (difference <= -CLICKS_TO_WIN_DIFFERENCE) {
        player1Fill.style.width = '0%';
        player2Fill.style.width = '100%'; // Garante preenchimento total visual
        endGame(true, 'Oponente');
    }
}


function endGame(wonByPush, winnerName = null) {
    if (!gameActive && !wonByPush) return; // Evita múltiplos chamados

    console.log("Fim do jogo!");
    const wasActive = gameActive; // Guarda se o jogo estava ativo antes de parar
    gameActive = false;
    clickButton.disabled = true;
    clearTimers();

    let winner = 'Empate'; // Padrão
    let resultMessage = '';

    if (wonByPush) {
         winner = winnerName;
         resultMessage = `${winner} venceu por dominar a barra!`;
    } else {
        // Se acabou o tempo, compara os scores
        if (myScore > opponentScore) {
            winner = 'Você';
        } else if (opponentScore > myScore) {
            winner = 'Oponente';
        }
        resultMessage = `Tempo Esgotado! ${winner === 'Empate' ? 'Empate!' : `${winner} venceu!`} (${myScore} x ${opponentScore} cliques)`;
    }

    console.log(`Resultado: ${winner}`);
    resultDisplay.textContent = resultMessage;
    showStatusOverlay(true, 'result'); // Mostra overlay com o resultado

    // Prepara para jogar novamente
    imReady = false;
    opponentReady = false;
    readyButton.disabled = false;
    readyButton.textContent = "Jogar Novamente?";
    readyButton.classList.remove('hidden'); // Mostra o botão "pronto/jogar de novo"
    controlsDiv.style.visibility = 'visible'; // Garante visibilidade

    // Envia pedido de reset apenas se o jogo estava realmente ativo
    // para evitar envios duplicados se ambos terminarem quase ao mesmo tempo
    if (wasActive) {
        sendData('reset');
    }
}

// --- Inicialização ---
initializePeer();
showConnectionArea(); // Começa mostrando a área de conexão
// Esconde elementos do jogo que não devem aparecer inicialmente
timerDisplay.style.visibility = 'hidden';
controlsDiv.style.visibility = 'hidden';