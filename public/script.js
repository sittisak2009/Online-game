const socket = io();

let currentTab = 'login';
let currentUser = null;
let currentRoom = null;
let myIndex = null;
let timerInterval = null;

function showModal(title, msg, icon = '🏆') {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-msg').innerText = msg;
    document.getElementById('modal-icon').innerText = icon;
    document.getElementById('modal-box').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-box').classList.add('hidden');
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
    document.getElementById('tab-reg-btn').classList.toggle('active', tab === 'reg');
    document.getElementById('country-group').classList.toggle('hidden', tab === 'login');
    document.getElementById('auth-submit-btn').innerText = tab === 'login' ? 'เข้าสู่สนามรบ 🚀' : 'สมัครสมาชิก & ลุยเลย! 🚀';
    document.getElementById('auth-error').innerText = '';
}

async function handleAuthSubmit() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const country = document.getElementById('auth-country').value;
    const errorMsg = document.getElementById('auth-error');

    if (!username || !password) {
        errorMsg.innerText = 'กรุณากรอกข้อมูลให้ครบ';
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
            errorMsg.innerText = data.message || 'เกิดข้อผิดพลาด';
        }
    } catch (err) {
        errorMsg.innerText = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    }
}

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

async function getLeaderboard() {
    const filter = document.getElementById('lb-country-filter').value;
    const tbody = document.getElementById('lb-list-body');
    
    document.getElementById('lobby-box').classList.add('hidden');
    document.getElementById('lb-box').classList.remove('hidden');

    tbody.innerHTML = '<tr><td colspan="5" style="color: #00d2ff;">กำลังโหลดข้อมูล...</td></tr>';

    try {
        const res = await fetch(`/api/leaderboard?country=${filter}&timestamp=${Date.now()}`);
        const list = await res.json();
        
        tbody.innerHTML = '';

        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">ยังไม่มีข้อมูลอันดับ</td></tr>';
            return;
        }

        list.forEach((item, index) => {
            const name = item.username || item.Name || item.User || 'ไม่ระบุชื่อ';
            const country = item.country || 'TH';
            const wins = Number(item.wins) || 0;
            const total = Number(item.total_games) || 0;
            const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
            const rankClass = index === 0 ? 'rank-1' : (index === 1 ? 'rank-2' : '');
            
            tbody.innerHTML += `
                <tr class="${rankClass}">
                    <td>${index + 1}</td>
                    <td style="text-align: left;">${name}</td>
                    <td>${country}</td>
                    <td>${wins}</td>
                    <td>${winRate}%</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" style="color: #ff416c;">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    }
}

function backToLobby() {
    document.getElementById('lb-box').classList.add('hidden');
    document.getElementById('lobby-box').classList.remove('hidden');
}

// Socket Events
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

socket.on('gameOver', (data) => {
    clearInterval(timerInterval);
    
    if (data.message) {
        showModal('ชนะบาย! 🎉', data.message, '👑');
    } else {
        showModal('จบการแข่งขัน! 🏁', `คะแนนของคุณ: ${data.scores[myIndex]} คะแนน`, '⚔️');
    }
    
    document.getElementById('game-box').classList.add('hidden');
    document.getElementById('lobby-box').classList.remove('hidden');
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
        if (left <= 0) clearInterval(timerInterval);
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
