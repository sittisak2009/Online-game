const socket = io();

let currentRoomId = null;

// UI Boxes
const lobbyBox = document.getElementById('lobby-box');
const statusBox = document.getElementById('status-box');
const gameBox = document.getElementById('game-box');

// UI Elements
const statusText = document.getElementById('status-text');
const problemEl = document.getElementById('problem');
const answerInput = document.getElementById('answer');
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

// กดหาห้อง
findMatchBtn.addEventListener('click', () => {
    lobbyBox.classList.add('hidden');
    statusBox.classList.remove('hidden');
    socket.emit('findMatch');
});

// ยกเลิกหาห้อง
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
    modalDesc.innerText = isWinner ? "ชนะแล้ว! คะแนนสะสมครบถ้วน" : "พ่ายแพ้! คู่แข่งทำคะแนนได้ไวกว่า";
    
    modal.classList.remove('hidden');
});

socket.on('playerLeft', () => {
    modalIcon.innerText = "🚪";
    modalTitle.innerText = "PLAYER LEFT";
    modalTitle.className = "text-2xl font-black mb-2 text-amber-400";
    modalDesc.innerText = "คู่แข่งออกจากห้องการแข่งขัน";
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
