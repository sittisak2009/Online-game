const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let matchmakingQueue = []; // คิวสำหรับเก็บคนที่กดค้นหาห้อง
const games = {};

function generateProblem() {
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const isAddition = Math.random() > 0.5;
    return {
        text: isAddition ? `${num1} + ${num2}` : `${Math.max(num1, num2)} - ${Math.min(num1, num2)}`,
        answer: isAddition ? num1 + num2 : Math.abs(num1 - num2)
    };
}

io.on('connection', (socket) => {

    // เมื่อผู้เล่นกดปุ่ม "หาห้อง"
    socket.on('findMatch', () => {
        // หากอยู่ในคิวแล้ว ไม่ต้องใส่ซ้ำ
        if (matchmakingQueue.includes(socket.id)) return;

        matchmakingQueue.push(socket.id);

        // ถ้ามีคนรอในคิวอย่างน้อย 2 คน ให้จับคู่ทันที
        if (matchmakingQueue.length >= 2) {
            const p1Id = matchmakingQueue.shift();
            const p2Id = matchmakingQueue.shift();

            const p1Socket = io.sockets.sockets.get(p1Id);
            const p2Socket = io.sockets.sockets.get(p2Id);

            if (p1Socket && p2Socket) {
                const roomId = `room_${p1Id}_${p2Id}`;
                p1Socket.join(roomId);
                p2Socket.join(roomId);

                games[roomId] = {
                    p1: { id: p1Id, score: 0 },
                    p2: { id: p2Id, score: 0 },
                    currentProblem: generateProblem()
                };

                io.to(roomId).emit('gameStart', {
                    roomId: roomId,
                    problem: games[roomId].currentProblem.text,
                    scores: { [p1Id]: 0, [p2Id]: 0 }
                });
            }
        } else {
            socket.emit('waiting', 'กำลังรอผู้เล่นอื่นกดเข้าร่วม...');
        }
    });

    // ยกเลิกการหาห้อง
    socket.on('cancelMatch', () => {
        matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
        socket.emit('matchCancelled');
    });

    // ตรวจคำตอบ
    socket.on('submitAnswer', ({ roomId, answer }) => {
        const game = games[roomId];
        if (!game) return;

        if (parseInt(answer) === game.currentProblem.answer) {
            if (socket.id === game.p1.id) game.p1.score += 10;
            if (socket.id === game.p2.id) game.p2.score += 10;

            const p1Score = game.p1.score;
            const p2Score = game.p2.score;

            if (p1Score >= 50 || p2Score >= 50) {
                const winnerId = p1Score >= 50 ? game.p1.id : game.p2.id;
                io.to(roomId).emit('gameOver', { 
                    winnerId: winnerId, 
                    scores: { [game.p1.id]: p1Score, [game.p2.id]: p2Score } 
                });
                delete games[roomId];
            } else {
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

    socket.on('disconnect', () => {
        matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
        for (const roomId in games) {
            if (games[roomId].p1.id === socket.id || games[roomId].p2.id === socket.id) {
                io.to(roomId).emit('playerLeft');
                delete games[roomId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
                        
