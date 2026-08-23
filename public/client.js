const socket = io();

let currentRoomId = null;

// UI Elements
const lobbyBox = document.getElementById('lobby-box');
const statusBox = document.getElementById('status-box');
const gameBox = document.getElementById('game-box');

const statusText = document.getElementById('status-text');
const matchInfo = document.getElementById('match-info');
const problemEl = document.getElementById('problem');
const answerInput = document.getElementById('answer');
const timerBar = document.getElementById('timer-bar');

const difficultySelect = document.getElementById('difficulty-select');
const timeSelect = document.getElementById('time-select');

const findMatchBtn = document.getElementById('find-match-btn');
const cancelMatchBtn = document.getElementById('cancel-match-btn');
const submitBtn = document.getElementById('submit-btn');

const myScoreEl = document.getElementById('my-score');
const opponentScoreEl = document.getElementById('opponent-score');

// Modal Elements
const modal = document.getElementById('modal');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');

findMatchBtn.addEventListener('click', () => {
    const diff = difficultySelect.value;
    const time = timeSelect.value;

    lobbyBox.classList.add('hidden');
    statusBox.classList.remove('hidden');
    
    matchInfo.innerText = `เงื่อนไข: ความยาก [${diff}] | เวลา [${time}s]`;
    socket.emit('findMatch', { difficulty: diff, timeLimit: time });
});

cancelMatchBtn.addEventListener('click', () => {
    socket.emit('cancelMatch');
});

socket.on('matchCancelled', () => {
    statusBox.classList.add('hidden');
    lobbyBox.classList.remove('hidden');
});

socket.on('waiting', (msg) => {
    statusText.innerText = msg;
});

socket.on('gameStart', (data) => {
    currentRoomId = data.roomId;
    statusBox.classList.add('hidden');
    gameBox.classList.remove('hidden');
    problemEl.innerText = data.problem;
    updateScores(data.scores);
    answerInput.focus();
});

socket.on('timerUpdate', ({ timeLeft, maxTime }) => {
    const percentage = (timeLeft / maxTime) * 100;
    timerBar.style.width = `${percentage}%`;
    
    if (percentage <= 30) {
        timerBar.className = "bg-rose-500 h-full rounded-full transition-all duration-200";
    } else {
        timerBar.className = "bg-cyan-400 h-full rounded-full transition-all duration-200";
    }
});

socket.on('nextProblem', (data) => {
    problemEl.innerText = data.problem;
    answerInput.value = '';
    updateScores(data.scores);
});

socket.on('wrongAnswer', () => {
    answerInput.classList.add('shake');
    setTimeout(() => answerInput.classList.remove('shake'), 350);
});

socket.on('gameOver', (data) => {
    updateScores(data.scores);
    const isWinner = data.winnerId === socket.id;
    
    modalIcon.innerText = isWinner ? "👑" : "💀";
    modalTitle.innerText = isWinner ? "VICTORY!" : "DEFEAT!";
    modalTitle.className = `text-2xl font-black mb-2 ${isWinner ? 'text-cyan-400' : 'text-rose-500'}`;
    modalDesc.innerText = isWinner ? "ชนะแล้ว! ทำคะแนนถึงเป้าหมายก่อน" : "แพ้แล้ว! คู่แข่งทำคะแนนได้เร็วกว่า";
    
    modal.classList.remove('hidden');
});

socket.on('playerLeft', () => {
    modalIcon.innerText = "🚪";
    modalTitle.innerText = "PLAYER LEFT";
    modalTitle.className = "text-2xl font-black mb-2 text-amber-400";
    modalDesc.innerText = "คู่แข่งของคุณออกจากเกม";
    modal.classList.remove('hidden');
});

function sendAnswer() {
    const val = answerInput.value.trim();
    if (val !== '' && currentRoomId) {
        socket.emit('submitAnswer', { roomId: currentRoomId, answer: val });
    }
}

function updateScores(scores) {
    const myId = socket.id;
    myScoreEl.innerText = scores[myId] || 0;
    const opponentId = Object.keys(scores).find(id => id !== myId);
    opponentScoreEl.innerText = opponentId ? scores[opponentId] : 0;
}

submitBtn.addEventListener('click', sendAnswer);
answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAnswer();
});
