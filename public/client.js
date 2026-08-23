const socket = io();

let currentRoomId = null;

const statusEl = document.getElementById('status-text');
const gameBox = document.getElementById('game-box');
const problemEl = document.getElementById('problem');
const answerInput = document.getElementById('answer');
const submitBtn = document.getElementById('submit-btn');
const myScoreEl = document.getElementById('my-score');
const opponentScoreEl = document.getElementById('opponent-score');

// Modal Elements
const modal = document.getElementById('modal');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');

socket.on('waiting', (msg) => {
    statusEl.innerText = msg;
});

socket.on('gameStart', (data) => {
    currentRoomId = data.roomId;
    document.getElementById('status').classList.add('hidden');
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
    modalDesc.innerText = isWinner ? "คุณทำคะแนนครบ 50 ก่อน ยอดเยี่ยมมาก!" : "คู่แข่งทำคะแนนถึงเป้าหมายก่อน ลองใหม่อีกครั้ง";
    
    modal.classList.remove('hidden');
});

socket.on('playerLeft', () => {
    modalIcon.innerText = "🚪";
    modalTitle.innerText = "PLAYER LEFT";
    modalTitle.className = "text-2xl font-black mb-2 text-amber-400";
    modalDesc.innerText = "คู่แข่งของคุณออกจากการเชื่อมต่อแล้ว";
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
