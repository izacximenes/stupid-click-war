// --- Elementos do DOM ---
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id-input');
const connectButton = document.getElementById('connect-button');
const connectionStatus = document.getElementById('connection-status');
const connectionArea = document.getElementById('connection-area');
const gameArea = document.getElementById('game-area');
const statusMessage = document.getElementById('status-message');
const tugMarker = document.getElementById('tug-marker');
const clickButton = document.getElementById('click-button');
const readyButton = document.getElementById('ready-button');
const timerDisplay = document.getElementById('timer');
const countdownDisplay = document.getElementById('countdown');
const resultDisplay = document.getElementById('result');

// --- Constantes e Variáveis de Estado ---
const GAME_DURATION = 20; // segundos
const COUNTDOWN_DURATION = 5; // segundos
// Define quantos cliques de *diferença* são necessários para vencer (empurrar totalmente)
// Ajuste esse valor para controlar a sensibilidade/duração
const CLICKS_TO_WIN_DIFFERENCE = 50;

let peer = null;
let conn = null; // Objeto de conexão com o outro peer
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

// --- Inicialização do PeerJS ---
function initializePeer() {
    // Cria um novo Peer. Se nenhum ID for fornecido, o servidor gerará um automaticamente.
    // Para simplicidade, usaremos um ID gerado automaticamente.
    // Em produção, você pode querer usar seu próprio servidor PeerJS.
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('Meu Peer ID é:', id);
        myId = id;
        myIdDisplay.textContent = id;
        connectionStatus.textContent = 'Status: Aguardando conexão...';
    });

    // Lidar com conexões de entrada
    peer.on('connection', (newConn) => {
        console.log('Recebi uma conexão de:', newConn.peer);
        if (conn && conn.open) {
            console.log("Já conectado, rejeitando nova conexão.");
            newConn.close(); // Rejeita se já estiver conectado
            return;
        }
        setupConnection(newConn);
        remoteId = newConn.peer;
        remoteIdInput.value = remoteId; // Preenche o campo com o ID do oponente
        remoteIdInput.disabled = true;
        connectButton.disabled = true;
        connectionStatus.textContent = `Status: Conectado com ${remoteId}`;
        statusMessage.textContent = 'Oponente conectado!';
        showGameArea();
    });

    peer.on('disconnected', () => {
        console.log('Desconectado do servidor PeerJS. Tentando reconectar...');
        // Tenta reconectar após um pequeno atraso
        setTimeout(() => peer.reconnect(), 3000);
    });

    peer.on('close', () => {
        console.log('Conexão Peer fechada.');
        handleDisconnect(); // Limpa o estado do jogo
    });

    peer.on('error', (err) => {
        console.error('Erro PeerJS:', err);
        connectionStatus.textContent = `Status: Erro (${err.type})`;
        alert(`Erro de conexão: ${err.message}`);
        // Habilita os botões novamente em caso de falha na tentativa de conexão
        connectButton.disabled = false;
        remoteIdInput.disabled = false;
    });
}

// --- Conexão ---
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

    const newConn = peer.connect(remoteId, { reliable: true }); // Usa canal de dados confiável
    setupConnection(newConn);
});

function setupConnection(newConn) {
    conn = newConn;

    conn.on('open', () => {
        console.log(`Conexão estabelecida com ${conn.peer}`);
        connectionStatus.textContent = `Status: Conectado com ${conn.peer}`;
        statusMessage.textContent = 'Conectado! Clique em "Estou Pronto!"';
        remoteId = conn.peer; // Garante que remoteId está correto
        remoteIdInput.value = remoteId;
        remoteIdInput.disabled = true;
        connectButton.disabled = true;
        showGameArea();
        resetGameVariables(); // Reseta para um novo jogo ao conectar
    });

    // Lidar com dados recebidos
    conn.on('data', (data) => {
        console.log('Dados recebidos:', data);
        handleData(data);
    });

    // Lidar com fechamento da conexão
    conn.on('close', () => {
        console.log(`Conexão com ${conn.peer} fechada.`);
        handleDisconnect();
    });

    conn.on('error', (err) => {
        console.error(`Erro na conexão com ${conn.peer}:`, err);
        handleDisconnect(); // Considera como desconexão
    });
}

function handleDisconnect() {
    alert('O oponente desconectou ou a conexão foi perdida.');
    connectionStatus.textContent = 'Status: Desconectado';
    conn = null;
    remoteId = null;
    remoteIdInput.value = '';
    remoteIdInput.disabled = false;
    connectButton.disabled = false;
    hideGameArea();
    resetGameVariables(); // Reseta tudo
    clearTimers();
    // Habilita a área de conexão novamente se o peer ainda estiver ativo
    if (peer && !peer.destroyed) {
         connectionStatus.textContent = 'Status: Aguardando conexão...';
    } else {
         connectionStatus.textContent = 'Status: Erro crítico. Recarregue a página.';
    }
}

// --- Lógica de Dados P2P ---
function handleData(data) {
    switch (data.type) {
        case 'click':
            if (gameActive) {
                opponentScore++;
                updateBar();
                checkWinCondition(); // Verifica se o oponente venceu ao receber o clique
            }
            break;
        case 'ready':
            opponentReady = true;
            statusMessage.textContent = 'Oponente está pronto!';
            checkBothReady();
            break;
        case 'reset': // Oponente pediu para resetar (ex: jogar novamente)
             console.log("Oponente solicitou reset.");
             resetGameUI(); // Prepara para um novo jogo
             break;
        // Adicione mais tipos de mensagem se necessário (ex: 'sync_score')
    }
}

function sendData(type, payload = {}) {
    if (conn && conn.open) {
        conn.send({ type, ...payload });
    } else {
        console.warn("Tentativa de enviar dados sem conexão ativa.");
    }
}

// --- Lógica do Jogo ---

function showGameArea() {
    connectionArea.classList.add('hidden');
    gameArea.classList.remove('hidden');
}

function hideGameArea() {
    gameArea.classList.add('hidden');
    connectionArea.classList.remove('hidden');
     // Garante que a área de conexão esteja habilitada se voltarmos para ela
    remoteIdInput.disabled = false;
    connectButton.disabled = false;
    if(myId) connectionStatus.textContent = 'Status: Aguardando conexão...';

}

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
    resetGameVariables(); // Reseta as variáveis lógicas
    clearTimers(); // Para quaisquer timers/contagens existentes

    tugMarker.style.left = '50%';
    timerDisplay.textContent = `Tempo: ${GAME_DURATION}s`;
    countdownDisplay.textContent = '';
    resultDisplay.textContent = '';
    statusMessage.textContent = 'Conectado! Clique em "Estou Pronto!" para jogar novamente.';
    clickButton.disabled = true; // Desabilita o botão de clique
    readyButton.disabled = false; // Habilita o botão de pronto
    readyButton.textContent = "Estou Pronto!";
}

function updateBar() {
    // Calcula a posição da barra baseada na diferença de scores
    // A barra vai de 0% (oponente venceu) a 100% (você venceu)
    // 50% é o meio
    const difference = myScore - opponentScore;
    // Mapeia a diferença para a porcentagem da barra (0 a 100)
    // O centro (50%) corresponde a diferença 0.
    // A borda direita (100%) corresponde a diferença +CLICKS_TO_WIN_DIFFERENCE
    // A borda esquerda (0%) corresponde a diferença -CLICKS_TO_WIN_DIFFERENCE
    let percentage = 50 + (difference / CLICKS_TO_WIN_DIFFERENCE) * 50;

    // Garante que a porcentagem fique entre 0 e 100
    percentage = Math.max(0, Math.min(100, percentage));

    tugMarker.style.left = `${percentage}%`;
}

clickButton.addEventListener('click', () => {
    if (!gameActive || !conn) return;

    myScore++;
    updateBar();
    sendData('click'); // Informa o oponente sobre o clique
    checkWinCondition(); // Verifica se eu venci após meu clique
});

readyButton.addEventListener('click', () => {
    imReady = true;
    readyButton.disabled = true;
    readyButton.textContent = "Aguardando Oponente...";
    statusMessage.textContent = 'Você está pronto! Aguardando oponente...';
    sendData('ready');
    checkBothReady();
});

function checkBothReady() {
    if (imReady && opponentReady) {
        console.log("Ambos prontos! Iniciando contagem regressiva...");
        statusMessage.textContent = 'Ambos prontos! Iniciando...';
        readyButton.disabled = true; // Garante que fique desabilitado
        startCountdown();
    }
}

function startCountdown() {
    countdownLeft = COUNTDOWN_DURATION;
    countdownDisplay.textContent = `Começando em: ${countdownLeft}s`;
    clickButton.disabled = true; // Impede cliques durante a contagem

    clearTimers(); // Limpa timers anteriores

    countdownInterval = setInterval(() => {
        countdownLeft--;
        countdownDisplay.textContent = `Começando em: ${countdownLeft}s`;
        if (countdownLeft <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            countdownDisplay.textContent = 'VAI!';
            startGame();
        }
    }, 1000);
}

function startGame() {
    console.log("Jogo iniciado!");
    gameActive = true;
    myScore = 0;
    opponentScore = 0;
    timeLeft = GAME_DURATION;
    updateBar(); // Reseta a posição visual da barra
    resultDisplay.textContent = ''; // Limpa resultados anteriores
    statusMessage.textContent = 'Clique o mais rápido que puder!';
    timerDisplay.textContent = `Tempo: ${timeLeft}s`;
    clickButton.disabled = false; // Habilita o botão de clique

    clearTimers(); // Limpa timers anteriores (exceto o de countdown que acabou de terminar)

    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = `Tempo: ${timeLeft}s`;

        if (timeLeft <= 0) {
            endGame(false); // Acabou o tempo, ninguém empurrou totalmente
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
    if (!gameActive) return; // Não verifica se o jogo não está ativo

    const difference = myScore - opponentScore;

    if (difference >= CLICKS_TO_WIN_DIFFERENCE) {
        endGame(true, 'Você'); // Você venceu
    } else if (difference <= -CLICKS_TO_WIN_DIFFERENCE) {
        endGame(true, 'Oponente'); // Oponente venceu
    }
    // Se não, o jogo continua até o tempo acabar ou alguém atingir a diferença
}


function endGame(wonByPush, winnerName = null) {
    if (!gameActive && !wonByPush) return; // Evita múltiplos chamados se o tempo já acabou

    console.log("Fim do jogo!");
    gameActive = false;
    clickButton.disabled = true;
    clearTimers(); // Para o timer principal

    let winner = 'Empate'; // Padrão

    if (wonByPush) {
         winner = winnerName; // Alguém empurrou até o fim
         resultDisplay.textContent = `Fim de Jogo! ${winner} venceu por empurrar a barra!`;
         statusMessage.textContent = "Para jogar novamente, clique em 'Estou Pronto!'";
    } else {
        // Se acabou o tempo, compara os scores
        if (myScore > opponentScore) {
            winner = 'Você';
        } else if (opponentScore > myScore) {
            winner = 'Oponente';
        }
        resultDisplay.textContent = `Tempo Esgotado! ${winner === 'Empate' ? 'Empate!' : `${winner} venceu com mais cliques!`} (${myScore} vs ${opponentScore})`;
        statusMessage.textContent = "Para jogar novamente, clique em 'Estou Pronto!'";
    }

    console.log(`Resultado: ${winner}`);

    // Prepara para jogar novamente
    imReady = false;
    opponentReady = false;
    readyButton.disabled = false; // Habilita para jogar novamente
    readyButton.textContent = "Jogar Novamente?";

    // Informa o outro jogador para resetar também (opcional, mas bom)
    // Evita que um clique 'reset' enquanto o outro ainda processa o fim do jogo
    // Poderia mandar o resultado final também: sendData('game_over', { winner: winner });
     sendData('reset'); // Pede ao outro para resetar a UI para o estado 'pronto'
}


// --- Inicialização ---
initializePeer();