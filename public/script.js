const socket = io();

// State Variables
let currentTab = 'login';
let currentUser = null;
let currentRoom = null;
let myIndex = null;
let timerInterval = null;

// ================= 1. TAB SWITCHING & AUTH =================
function switchTab(tab) {
    currentTab = tab;
    const loginBtn = document.getElementById('tab-login-btn');
    const regBtn = document.getElementById('tab-reg-btn');
    const countryGroup = document.getElementById('country-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const errorMsg = document.getElementById('auth-error');

    errorMsg.innerText = '';

    if (tab === 'login') {
        loginBtn.classList.add('active');
        regBtn.classList.remove('active');
        countryGroup.classList.add('hidden');
        submitBtn.innerText = 'เข้าสู่สนามรบ 🚀';
    } else {
        regBtn.classList.add('active');
        loginBtn.classList.remove('active');
        countryGroup.classList.remove('hidden');
        submitBtn.innerText = 'สมัครสมาชิก & ลุยเลย! 🚀';
    }
}

async function handleAuthSubmit() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const country = document.getElementById('auth-country').value;
    const errorMsg = document.getElementById('auth-error');

    if (!username || !password) {
        errorMsg.innerText = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ';
        return;
    }

    const endpoint = currentTab === 'login' ? '/api/login' : '/api/register';
    const payload = currentTab === 'login' ? { username, password } : { username, password, country };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
            currentUser = data.user;
            document.getElementById('display-user').innerText = currentUser.username;
            document.getElementById('display-country').innerText = currentUser.country || 'TH';
            document.getElementById('lb-user-name').innerText = currentUser.username;
            
            document.getElementById('auth-box').classList.add('hidden');
            document.getElementById('lobby-box').classList.remove('hidden');
        } else {
            errorMsg.innerText = data.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
        }
    } catch (err) {
        console.error(err);
        errorMsg.innerText = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    }
}

// ================= 2. MATCHMAKING & LOBBY =================
function findMatch() {
    const diff = document.getElementById('diff-select').value;
    const time = document.getElementById('time-select').value;
    const questions = document.getElementById('q-select').value;

    document.getElementById('queue-info').innerText = `โหมด: ${diff} | เวลา: ${time === 'unlimited' ? 'ไม่จำกัด' : time + 's'} | ${questions} ข้อ`;
    document.getElementById('queue-box').classList.remove('hidden');

    socket.emit('findMatch', {
        user: currentUser,
        config: { diff, time, questions }
    });
}

function cancelMatch() {
    socket.emit('cancelMatch');
    document.getElementById('queue-box').classList.add('hidden');
}

// ================= 3. LEADERBOARD =================
async function getLeaderboard() {
    const filter = document.getElementById('lb-country-filter').value;
    
    document.getElementById('lobby-box').classList.add('hidden');
    document.getElementById('lb-box').classList.remove('hidden');

    try {
        const res = await fetch(`/api/leaderboard?country=${filter}`);
        const list = await res.json();
        
        const tbody = document.getElementById('lb-list-body');
        tbody.innerHTML = '';

        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">ยังไม่มีข้อมูลอันดับ</td></tr>';
            return;
        }

        list.forEach((item, index) => {
            const winRate = item.total_games > 0 ? Math.round((item.wins / item.total_games) * 100) : 0;
            const rankClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : '');
            
            tbody.innerHTML += `
                <tr class="${rankClass}">
                    <td>${index + 1}</td>
                    <td style="text-align: left;">${item.username}</td>
                    <td>${item.country || 'TH'}</td>
                    <td>${item.wins}</td>
                    <td>${winRate}%</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

function backToLobby() {
    document.getElementById('lb-box').classList.add('hidden');
    document.getElementById('lobby-box').classList.remove('hidden');
}

// ================= 4. GAMEPLAY & SOCKET =================
socket.on('matchFound', (data) => {
    currentRoom = data.roomId;
    myIndex = data.players.findIndex(p => p.username === currentUser.username);
    const enemyIndex = myIndex === 0 ? 1 : 0;

    document.getElementById('p1-name').innerText = currentUser.username;
    document.getElementById('p2-name').innerText = data.players[enemyIndex].username;

    document.getElementById('queue-box').classList.add('hidden');
    document.getElementById('lobby-box').classList.add('hidden');
    document.getElementById('game-box').classList.remove('hidden');
});

socket.on('newQuestion', (data) => {
    document.getElementById('q-num').innerText = data.qIndex;
    document.getElementById('q-total').innerText = data.totalQ;
    document.getElementById('problem-text').innerText = data.question;
    document.getElementById('answer-input').value = '';
    document.getElementById('answer-input').focus();

    startTimer(data.timeLimit);
});

socket.on('updateScore', (scores) => {
    document.getElementById('p1-score').innerText = scores[myIndex];
    document.getElementById('p2-score').innerText = scores[myIndex === 0 ? 1 : 0];
});

function submitAnswer() {
    const ans = document.getElementById('answer-input').value;
    if (ans === '') return;
    
    socket.emit('submitAnswer', { roomId: currentRoom, answer: Number(ans) });
    document.getElementById('answer-input').value = '';
}

document.getElementById('answer-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitAnswer();
});

function startTimer(seconds) {
    clearInterval(timerInterval);
    if (!seconds || seconds === 'unlimited') {
        document.getElementById('time-left').innerText = '∞';
        return;
    }

    let left = parseInt(seconds);
    document.getElementById('time-left').innerText = left;

    timerInterval = setInterval(() => {
        left--;
        document.getElementById('time-left').innerText = left;
        if (left <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

function sendEmote(emoji) {
    socket.emit('sendEmote', { roomId: currentRoom, emoji, from: myIndex });
}

socket.on('receiveEmote', (data) => {
    const targetArea = data.from === myIndex ? document.getElementById('my-area') : document.getElementById('enemy-area');
    const pop = document.createElement('div');
    pop.className = 'emote-pop';
    pop.innerText = data.emoji;
    targetArea.appendChild(pop);
    setTimeout(() => pop.remove(), 1200);
});
        
