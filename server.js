const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// เปิดให้บริการไฟล์สแตติกจากโฟลเดอร์ public
app.use(express.static('public'));

let waitingPlayer = null;
const games = {};

// ฟังก์ชันสุ่มโจทย์คณิตศาสตร์
function generateProblem() {
    const num1 = Math.floor(Math.random() * 25) + 1;
    const num2 = Math.floor(Math.random() * 25) + 1;
    const isAddition = Math.random() > 0.5;
    
    return {
        text: isAddition ? `${num1} + ${num2}` : `${Math.max(num1, num2)} - ${Math.min(num1, num2)}`,
        answer: isAddition ? num1 + num2 : Math.abs(num1 - num2)
    };
}

io.on('connection', (socket) => {
    console.log(`[Connect] Player joined: ${socket.id}`);

    // ระบบจับคู่ผู้เล่น (Matchmaking Queue)
    if (!waitingPlayer) {
        waitingPlayer = socket;
        socket.emit('waiting', 'กำลังรอผู้เล่นคนที่ 2 เข้ามาจับคู่...');
    } else {
        const roomId = `room_${waitingPlayer.id}_${socket.id}`;
        const p1 = waitingPlayer;
        const p2 = socket;
        waitingPlayer = null;

        p1.join(roomId);
        p2.join(roomId);

        games[roomId] = {
            p1: { id: p1.id, score: 0 },
            p2: { id: p2.id, score: 0 },
            currentProblem: generateProblem()
        };

        io.to(roomId).emit('gameStart', {
            roomId: roomId,
            problem: games[roomId].currentProblem.text,
            scores: { [p1.id]: 0, [p2.id]: 0 }
        });
    }

    // ตรวจสอบคำตอบจากผู้เล่น
    socket.on('submitAnswer', ({ roomId, answer }) => {
        const game = games[roomId];
        if (!game) return;

        if (parseInt(answer) === game.currentProblem.answer) {
            // ปรับคะแนนให้คนที่ตอบถูกก่อน
            if (socket.id === game.p1.id) game.p1.score += 10;
            if (socket.id === game.p2.id) game.p2.score += 10;

            const p1Score = game.p1.score;
            const p2Score = game.p2.score;

            // ตรวจสอบเงื่อนไขการชนะ (ถึง 50 คะแนนก่อน)
            if (p1Score >= 50 || p2Score >= 50) {
                const winnerId = p1Score >= 50 ? game.p1.id : game.p2.id;
                io.to(roomId).emit('gameOver', { 
                    winnerId: winnerId, 
                    scores: { [game.p1.id]: p1Score, [game.p2.id]: p2Score } 
                });
                delete games[roomId];
            } else {
                // สุ่มโจทย์ข้อถัดไป
                game.currentProblem = generateProblem();
                io.to(roomId).emit('nextProblem', {
                    problem: game.currentProblem.text,
                    scores: { [game.p1.id]: p1Score, [game.p2.id]: p2Score }
                });
            }
        } else {
            socket.emit('wrongAnswer');
        }
    });

    // จัดการกรณีผู้เล่นออกจากระบบหรือเน็ตหลุด
    socket.on('disconnect', () => {
        console.log(`[Disconnect] Player left: ${socket.id}`);
        
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }

        for (const roomId in games) {
            if (games[roomId].p1.id === socket.id || games[roomId].p2.id === socket.id) {
                io.to(roomId).emit('playerLeft');
                delete games[roomId];
                break;
            }
        }
    });
});

// กำหนด PORT รองรับ Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
