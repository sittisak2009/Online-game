const socket = io();

let currentRoomId = null;

const statusEl = document.getElementById('status');
const gameBox = document.getElementById('game-box');
const problemEl = document.getElementById('problem');
const answerInput = document.getElementById('answer');
const submitBtn = document.getElementById('submit-btn');
const myScoreEl = document.getElementById('my-score');
const opponentScoreEl = document.getElementById('opponent-score');

// รอการจับคู่
socket.on('waiting', (msg) => {
    statusEl.innerText = msg;
});

// เริ่มเกมเมื่อจับคู่สำเร็จ
socket.on('gameStart', (data) => {
    currentRoomId = data.roomId;
    statusEl.innerText = "จับคู่สำเร็จ! ตอบถูกข้อละ 10 คะแนน (ใครถึง 50 ก่อนชนะ)";
    gameBox.style.display = "block";
    problemEl.innerText = data.problem;
    updateScores(data.scores);
});

// เปลี่ยนข้อใหม่เมื่อมีคนตอบถูก
socket.on('nextProblem', (data) => {
    problemEl.innerText = data.problem;
    answerInput.value = '';
    updateScores(data.scores);
});

// เมื่อตอบผิด ให้ขอบช่องกรอกขึ้นสีแดงชั่วคราว
socket.on('wrongAnswer', () => {
    answerInput.style.borderColor = "#ef4444";
    setTimeout(() => {
        answerInput.style.borderColor = "#334155";
    }, 400);
});

// สรุปผลการแข่งขันเมื่อจบเกม
socket.on('gameOver', (data) => {
    updateScores(data.scores);
    if (data.winnerId === socket.id) {
        alert("🎉 ยินดีด้วย! คุณเป็นฝ่ายชนะ!");
    } else {
        alert("❌ คุณแพ้! พยายามใหม่อีกครั้ง");
    }
    location.reload();
});

// เมื่อคู่แข่งกดปิดหน้าเว็บหรือหลุด
socket.on('playerLeft', () => {
    alert("คู่แข่งออกจากระบบแล้ว");
    location.reload();
});

// ส่งคำตอบไปยังเซิร์ฟเวอร์
function sendAnswer() {
    const val = answerInput.value.trim();
    if (val !== '' && currentRoomId) {
        socket.emit('submitAnswer', { roomId: currentRoomId, answer: val });
    }
}

// อัปเดตการแสดงผลคะแนน
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
