const socket = io();

let currentRoomId = null;
let currentUser = null;
let energy = 0;

// UI Panels
const authBox = document.getElementById('auth-box');
const lobbyBox = document.getElementById('lobby-box');
const leaderboardBox = document.getElementById('leaderboard-box');
const statusBox = document.getElementById('status-box');
const gameBox = document.getElementById('game-box');

// Auth Elements
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// Game Elements
const statusText = document.getElementById('status-text');
const matchInfo = document.getElementById('match-info');
const problemEl = document.getElementById('problem');
const problemBox = document.getElementById('problem-box');
const answerInput = document.getElementById('answer');
const timerBar = document.getElementById('timer-bar');
const energyBar = document.getElementById('energy-bar');
const questionTracker = document.getElementById('question-tracker');
const comboTracker = document.getElementById('combo-tracker');

const skillFreezeBtn = document.getElementById('skill-freeze-btn');
const skillBlindBtn = document.getElementById('skill-blind-btn');

const difficultySelect = document.getElementById('difficulty-select');
const timeSelect = document.getElementById('time-select');
const questionCountSelect = document.getElementById('question-count-select');

const findMatchBtn = document.getElementById('find-match-btn');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const cancelMatchBtn = document.getElementById('cancel-match-btn');
const submitBtn = document.getElementById('submit-btn');

const myScoreEl = document.getElementById('my-score');
const opponentScoreEl = document.getElementById('opponent-score');
const myNameDisplay = document.getElementById('my-name-display');
const opponentNameDisplay = document.getElementById('opponent-name-display');

const leaderboardCountryFilter = document.getElementById('leaderboard-country-filter');
const leaderboardList = document.getElementById('leaderboard-list');

// Modal
const modal = document.getElementById('modal');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');

// Tabs
tabLogin.addEventListener('click', () => {
    tabLogin.className = "w-1/2 py-2 text-center text-sm font-bold border-b-2 border-cyan-400 text-cyan-400";
    tabRegister.className = "w-1/2 py-2 text-center text-sm font-bold border-b-2 border-transparent text-slate-500";
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
    tabRegister.className = "w-1/2 py-2 text-center text-sm font-bold border-b-2 border-cyan-400 text-cyan-400";
    tabLogin.className = "w-1/2 py-2 text-center text-sm font-bold border-b-2 border-transparent text-slate-500";
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    socket.emit('login', {
        username: document.getElementById('login-username').value.trim(),
        password: document.getElementById('login-password').value
    });
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    socket.emit('register', {
        username: document.getElementById('reg-username').value.trim(),
        password: document.getElementById('reg-password').value,
        country: document.getElementById('reg-country').value
    });
});

socket.on('authError', (msg) => {
    authError.innerText = msg;
    authError.classList.remove('hidden');
});

socket.on('authSuccess', (userData) => {
    currentUser = userData;
    localStorage.setItem('math_user', JSON.stringify(userData));
    showLobby();
});

function showLobby() {
    authBox.classList.add('hidden');
    leaderboardBox.classList.add('hidden');
    lobbyBox.classList.remove('hidden');
    userDisplay.innerText = `🎮 ${currentUser.username} (${currentUser.country})`;
}

const savedUser = localStorage.getItem('math_user');
if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showLobby();
}

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('math_user');
    location.reload();
});

// Leaderboard
leaderboardBtn.addEventListener('click', () => {
    lobbyBox.classList.add('hidden');
    leaderboardBox.classList.remove('hidden');
    fetchLeaderboard();
});

backToLobbyBtn.addEventListener('click', showLobby);
leaderboardCountryFilter.addEventListener('change', fetchLeaderboard);

function fetchLeaderboard() {
    socket.emit('getLeaderboard', { country: leaderboardCountryFilter.value });
}

socket.on('leaderboardData', (data) => {
    leaderboardList.innerHTML = '';
    data.forEach((item, index) => {
        const totalGames = item.wins + item.losses + item.draws;
        const winRate = totalGames > 0 ? ((item.wins / totalGames) * 100).toFixed(1) : 0;
        
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-900";
        tr.innerHTML = `
            <td class="p-1 font-bold ${index === 0 ? 'text-amber-400' : 'text-slate-400'}">${index + 1}</td>
            <td class="p-1 font-semibold">${item.username}</td>
            <td class="p-1 text-slate-400">${item.country}</td>
            <td class="p-1 text-center font-bold text-cyan-400">${item.wins}</td>
            <td class="p-1 text-right font-bold text-emerald-400">${winRate}%</td>
        `;
        leaderboardList.appendChild(tr);
    });
});

// Matchmaking
findMatchBtn.addEventListener('click', () => {
    const diff = difficultySelect.value;
    const time = timeSelect.value;
    const totalQ = questionCountSelect.value;

    lobbyBox.classList.add('hidden');
    statusBox.classList.remove('hidden');
    
    matchInfo.innerHTML = `โหมด: <span class="text-cyan-400 font-bold">${diff}</span> | เวลา: <span class="text-cyan-400 font-bold">${time}s</span> | <span class="text-cyan-400 font-bold">${totalQ} ข้อ</span>`;
    
    socket.emit('findMatch', { 
        username: currentUser.username, 
        difficulty: diff, 
        timeLimit: time, 
        totalQuestions: totalQ 
    });
});

cancelMatchBtn.addEventListener('click', () => {
    socket.emit('cancelMatch');
});

socket.on('matchCancelled', showLobby);

socket.on('waiting', (msg) => {
    statusText.innerText = msg;
});

socket.on('gameStart', (data) => {
    currentRoomId = data.roomId;
    energy = 0;
    updateEnergyBar();

    statusBox.classList.add('hidden');
    gameBox.classList.remove('hidden');
    problemEl.innerText = data.problem;
    questionTracker.innerText = `ข้อที่ ${data.currentQuestion} / ${data.totalQuestions}`;
    comboTracker.innerText = `COMBO x0 🔥`;

    const myId = socket.id;
    const opponentId = Object.keys(data.players).find(id => id !== myId);
    
    myNameDisplay.innerText = currentUser.username;
    opponentNameDisplay.innerText = data.players[opponentId] || 'ENEMY';

    updateScores(data.scores);
    answerInput.focus();
});

socket.on('timerUpdate', ({ timeLeft, maxTime, isUnlimited }) => {
    if (isUnlimited) {
        timerBar.style.width = '100%';
        return;
    }
    const percentage = (timeLeft / maxTime) * 100;
    timerBar.style.width = `${percentage}%`;
});

socket.on('nextProblem', (data) => {
    problemEl.innerText = data.problem;
    questionTracker.innerText = `ข้อที่ ${data.currentQuestion} / ${data.totalQuestions}`;
    answerInput.value = '';
    updateScores(data.scores);
});

socket.on('correctAnswerBonus', ({ combo }) => {
    comboTracker.innerText = `COMBO x${combo} 🔥`;
    energy = Math.min(100, energy + 50);
    updateEnergyBar();
});

socket.on('wrongAnswer', () => {
    comboTracker.innerText = `COMBO x0 🔥`;
    answerInput.classList.add('shake');
    setTimeout(() => answerInput.classList.remove('shake'), 300);
});

// Energy & Skills
function updateEnergyBar() {
    energyBar.style.width = `${energy}%`;
    if (energy >= 100) {
        skillFreezeBtn.disabled = false;
        skillBlindBtn.disabled = false;
        skillFreezeBtn.classList.remove('opacity-50');
        skillBlindBtn.classList.remove('opacity-50');
    } else {
        skillFreezeBtn.disabled = true;
        skillBlindBtn.disabled = true;
        skillFreezeBtn.classList.add('opacity-50');
        skillBlindBtn.classList.add('opacity-50');
    }
}

skillFreezeBtn.addEventListener('click', () => {
    if (energy >= 100) {
        energy = 0;
        updateEnergyBar();
        socket.emit('useSkill', { roomId: currentRoomId, skillType: 'freeze' });
    }
});

skillBlindBtn.addEventListener('click', () => {
    if (energy >= 100) {
        energy = 0;
        updateEnergyBar();
        socket.emit('useSkill', { roomId: currentRoomId, skillType: 'blind' });
    }
});

// Receive Skill Attacks
socket.on('receiveAttack', ({ skillType }) => {
    if (skillType === 'freeze') {
        answerInput.disabled = true;
        answerInput.placeholder = "❄️ โดนแช่แข็ง! (3 วินาที)";
        setTimeout(() => {
            answerInput.disabled = false;
            answerInput.placeholder = "ป้อนคำตอบ...";
            answerInput.focus();
        }, 3000);
    } else if (skillType === 'blind') {
        problemBox.classList.add('blur-effect');
        setTimeout(() => {
            problemBox.classList.remove('blur-effect');
        }, 4000);
    }
});

socket.on('gameOver', (data) => {
    updateScores(data.scores);
    
    if (data.resultType === 'draw') {
        modalIcon.innerText = "🤝";
        modalTitle.innerText = "DRAW!";
        modalTitle.className = "text-2xl font-black mb-1 text-amber-400";
        modalDesc.innerText = "ฝีมือสูสีมาก เสมอกันไปอย่างสมเกียรติ!";
    } else {
        const isWinner = data.winnerId === socket.id;
        modalIcon.innerText = isWinner ? "👑" : "💀";
        modalTitle.innerText = isWinner ? "VICTORY!" : "DEFEAT!";
        modalTitle.className = `text-2xl font-black mb-1 ${isWinner ? 'text-cyan-400' : 'text-rose-500'}`;
        modalDesc.innerText = isWinner ? "เฉียบขาดมาก! คว้าชัยชนะและเพิ่มอันดับขึ้น Leaderboard" : "โดนคู่แข่งสยบเข้าให้ ฝึกสมองแล้วกลับมาแก้มือใหม่!";
    }
    
    modal.classList.remove('hidden');
});

socket.on('playerLeft', () => {
    modalIcon.innerText = "🚪";
    modalTitle.innerText = "PLAYER LEFT";
    modalTitle.className = "text-2xl font-black mb-1 text-amber-400";
    modalDesc.innerText = "คู่แข่งทนความโหดไม่ไหว กดออกจากเกมกะทันหัน";
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
    
