const socket = io();

let myUsername = '';
let currentRoomId = '';

const audioCorrect = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3');
const audioWrong = new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3');

function login() {
    const user = document.getElementById('auth-username').value;
    const pass = document.getElementById('auth-password').value;
    socket.emit('login', { username: user, password: pass });
}

function register() {
    const user = document.getElementById('auth-username').value;
    const pass = document.getElementById('auth-password').value;
    const country = document.getElementById('auth-country').value;
    socket.emit('register', { username: user, password: pass, country: country });
}

socket.on('authSuccess', ({ username, rank }) => {
    myUsername = username;
    document.getElementById('auth-box').classList.add('hidden');
    document.getElementById('lobby-box').classList.remove('hidden');
    document.getElementById('display-user').innerText = username;
    
    if (rank) {
        const rBadge = document.getElementById('display-rank');
        rBadge.innerText = rank.title;
        rBadge.className = `rank-badge ${rank.class}`;
    }
});

socket.on('authError', (msg) => {
    document.getElementById('auth-error').innerText = msg;
});

function findMatch() {
    const diff = document.getElementById('diff-select').value;
    const time = document.getElementById('time-select').value;
    const q = document.getElementById('q-select').value;

    socket.emit('findMatch', { username: myUsername, difficulty: diff, timeLimit: time, totalQuestions: q });
}

socket.on('waiting', (msg) => {
    document.getElementById('status-text').innerText = msg;
});

socket.on('gameStart', ({ roomId, currentQuestion, totalQuestions, problem, players, scores }) => {
    currentRoomId = roomId;
    document.getElementById('lobby-box').classList.add('hidden');
    document.getElementById('game-box').classList.remove('hidden');

    document.getElementById('q-num').innerText = currentQuestion;
    document.getElementById('q-total').innerText = totalQuestions;
    document.getElementById('problem-text').innerText = problem;

    const pIds = Object.keys(players);
    const myId = socket.id;
    const enemyId = pIds.find(id => id !== myId);

    document.getElementById('p1-name').innerText = players[myId];
    document.getElementById('p2-name').innerText = players[enemyId] || 'คู่ต่อสู้';
    document.getElementById('p1-score').innerText = scores[myId] || 0;
    document.getElementById('p2-score').innerText = scores[enemyId] || 0;
});

socket.on('nextProblem', ({ currentQuestion, totalQuestions, problem, scores }) => {
    document.getElementById('q-num').innerText = currentQuestion;
    document.getElementById('problem-text').innerText = problem;
    document.getElementById('answer-input').value = '';
    document.getElementById('answer-input').focus();

    const pIds = Object.keys(scores);
    const myId = socket.id;
    const enemyId = pIds.find(id => id !== myId);

    document.getElementById('p1-score').innerText = scores[myId];
    document.getElementById('p2-score').innerText = scores[enemyId];
});

socket.on('timerUpdate', ({ timeLeft, isUnlimited }) => {
    document.getElementById('time-left').innerText = isUnlimited ? '∞' : timeLeft;
});

function submitAnswer() {
    const ans = document.getElementById('answer-input').value;
    if (ans !== '') {
        socket.emit('submitAnswer', { roomId: currentRoomId, answer: ans });
    }
}

document.getElementById('answer-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitAnswer();
});

socket.on('correctAnswerBonus', ({ combo }) => {
    audioCorrect.play();
    document.getElementById('my-combo').innerText = combo > 1 ? `🔥 Combo x${combo}` : '';
});

socket.on('wrongAnswer', () => {
    audioWrong.play();
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 300);
    document.getElementById('my-combo').innerText = '';
});

function sendEmote(emote) {
    if (currentRoomId) {
        socket.emit('sendEmote', { roomId: currentRoomId, emote });
    }
}

socket.on('receiveEmote', ({ senderId, emote }) => {
    const isMe = senderId === socket.id;
    const targetArea = isMe ? document.getElementById('my-area') : document.getElementById('enemy-area');

    const emoteEl = document.createElement('div');
    emoteEl.className = 'emote-pop';
    emoteEl.innerText = emote;
    targetArea.appendChild(emoteEl);

    setTimeout(() => emoteEl.remove(), 1200);
});

socket.on('gameOver', ({ resultType, winnerId }) => {
    let msg = 'เสมอ!';
    if (resultType === 'winner') {
        msg = winnerId === socket.id ? '🎉 คุณชนะ!' : '❌ คุณแพ้!';
    }
    alert(`จบเกม! ${msg}`);
    location.reload();
});

function getLeaderboard() {
    socket.emit('getLeaderboard', { country: 'ALL' });
}

socket.on('leaderboardData', (data) => {
    document.getElementById('lobby-box').classList.add('hidden');
    document.getElementById('lb-box').classList.remove('hidden');

    const list = document.getElementById('lb-list');
    list.innerHTML = data.map((u, i) => `
        <div style="padding: 8px; border-bottom: 1px solid #334155; text-align: left;">
            ${i+1}. <b>${u.username}</b> <span class="rank-badge ${u.rank.class}">${u.rank.title}</span> - ชนะ: ${u.wins}
        </div>
    `).join('');
});

function backToLobby() {
    document.getElementById('lb-box').classList.add('hidden');
    document.getElementById('lobby-box').classList.remove('hidden');
}
