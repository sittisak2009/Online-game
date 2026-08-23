const socket = io();

let currentRoomId = null;
let isMyTurn = true;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    const target = document.getElementById(screenId);
    if (target) target.style.display = 'block';
}

async function handleLogin(event) {
    if (event) event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('user', JSON.stringify(data.user));
            alert('เข้าสู่ระบบสำเร็จ!');
            showScreen('mainMenuScreen');
            loadLeaderboard();
        } else {
            alert(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
        }
    } catch (err) {
        console.error("Login error:", err);
    }
}

async function handleRegister(event) {
    if (event) event.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const country = document.getElementById('regCountry') ? document.getElementById('regCountry').value : 'TH';

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, country })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('user', JSON.stringify(data.user));
            alert('สมัครสมาชิกสำเร็จ!');
            showScreen('mainMenuScreen');
            loadLeaderboard();
        } else {
            alert(data.message || 'สมัครสมาชิกไม่สำเร็จ');
        }
    } catch (err) {
        console.error("Register error:", err);
    }
}

async function loadLeaderboard() {
    try {
        const countrySelect = document.getElementById('countryFilter');
        const country = countrySelect ? countrySelect.value : 'ALL';
        
        const response = await fetch(`/api/leaderboard?country=${country}`);
        const data = await response.json();
        
        const leaderboardTableBody = document.getElementById('leaderboardBody');
        if (!leaderboardTableBody) return;

        leaderboardTableBody.innerHTML = '';

        data.forEach((player, index) => {
            const wins = Number(player.wins || 0);
            const losses = Number(player.losses || 0);
            const draws = Number(player.draws || 0);
            const totalGames = wins + losses + draws;

            let winRate = 0;
            if (totalGames > 0) {
                winRate = ((wins / totalGames) * 100).toFixed(1);
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>#${index + 1}</td>
                <td>${player.username}</td>
                <td>${player.country || 'TH'}</td>
                <td>${wins}</td>
                <td>${losses}</td>
                <td>${draws}</td>
                <td>${totalGames}</td>
                <td style="color: #4CAF50; font-weight: bold;">${winRate}%</td>
            `;
            leaderboardTableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error loading leaderboard:", err);
    }
}

function startMatchmaking() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        alert('กรุณาเข้าสู่ระบบก่อน!');
        showScreen('loginScreen');
        return;
    }

    const diff = document.getElementById('diffSelect').value;
    const questions = document.getElementById('qCountSelect').value;
    const time = document.getElementById('timeSelect').value;

    const config = { diff, questions, time };

    showScreen('waitingScreen');
    socket.emit('findMatch', { user, config });
}

function cancelMatchmaking() {
    socket.emit('cancelMatch');
    showScreen('mainMenuScreen');
}

function submitPlayerAnswer() {
    const answerInput = document.getElementById('answerInput');
    if (!answerInput) return;
    const answer = answerInput.value;
    if (answer === '') return;

    socket.emit('submitAnswer', { roomId: currentRoomId, answer: Number(answer) });
    answerInput.value = '';
}

function surrenderGame() {
    if (confirm('คุณต้องการยอมแพ้ใช่หรือไม่?')) {
        socket.emit('surrender', { roomId: currentRoomId });
    }
}

socket.on('matchFound', (data) => {
    currentRoomId = data.roomId;
    showScreen('gameScreen');
    
    const p1Name = document.getElementById('p1Name');
    const p2Name = document.getElementById('p2Name');
    if (p1Name && data.players[0]) p1Name.innerText = data.players[0].username;
    if (p2Name && data.players[1]) p2Name.innerText = data.players[1].username;
});

socket.on('newQuestion', (data) => {
    const qText = document.getElementById('questionText');
    const qCounter = document.getElementById('questionCounter');
    
    if (qText) qText.innerText = data.question;
    if (qCounter) qCounter.innerText = `ข้อที่ ${data.qIndex} / ${data.totalQ}`;
});

socket.on('updateScore', (scores) => {
    const p1Score = document.getElementById('p1Score');
    const p2Score = document.getElementById('p2Score');
    if (p1Score) p1Score.innerText = scores[0];
    if (p2Score) p2Score.innerText = scores[1];
});

socket.on('wrongAnswer', (data) => {
    alert(data.message);
});

socket.on('gameOver', (data) => {
    alert('เกมจบแล้ว!');
    showScreen('mainMenuScreen');
    loadLeaderboard();
    currentRoomId = null;
});

window.onload = () => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
        showScreen('mainMenuScreen');
        loadLeaderboard();
    } else {
        showScreen('loginScreen');
    }
};
    
