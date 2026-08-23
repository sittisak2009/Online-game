const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ⚠️ ใส่ลิงก์ SheetDB ของนายตรงนี้
const SHEETDB_URL = 'https://sheetdb.io/api/v1/yt7phya14ic0d';

// API: Register
app.post('/api/register', async (req, res) => {
    const { username, password, country } = req.body;
    try {
        const checkRes = await fetch(SHEETDB_URL);
        const users = await checkRes.json();
        
        if (Array.isArray(users) && users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
        }

        const newUser = { data: [{ username, password, country: country || 'TH', wins: 0, total_games: 0 }] };
        await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUser)
        });

        res.json({ success: true, user: { username, country: country || 'TH' } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'เชื่อมต่อ SheetDB ไม่สำเร็จ' });
    }
});

// API: Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const checkRes = await fetch(SHEETDB_URL);
        const users = await checkRes.json();
        const user = Array.isArray(users) ? users.find(u => u.username === username && u.password === password) : null;

        if (user) {
            res.json({ success: true, user: { username: user.username, country: user.country } });
        } else {
            res.status(400).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'เชื่อมต่อ SheetDB ไม่สำเร็จ' });
    }
});

// API: Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    const { country } = req.query;
    try {
        const checkRes = await fetch(SHEETDB_URL);
        let users = await checkRes.json();

        if (!Array.isArray(users)) users = [];

        if (country && country !== 'ALL') {
            users = users.filter(u => u.country === country);
        }

        users.sort((a, b) => (Number(b.wins) || 0) - (Number(a.wins) || 0));
        res.json(users);
    } catch (err) {
        res.json([]);
    }
});

// ---------------- Socket.io Game Engine ----------------
let waitingQueue = [];
let rooms = {};

io.on('connection', (socket) => {
    socket.on('findMatch', (data) => {
        const player = { socketId: socket.id, user: data.user, config: data.config };
        
        const matchIndex = waitingQueue.findIndex(p => 
            p.config.diff === player.config.diff &&
            p.config.time === player.config.time &&
            p.config.questions === player.config.questions
        );

        if (matchIndex !== -1) {
            const opponent = waitingQueue.splice(matchIndex, 1)[0];
            const roomId = `room_${socket.id}_${opponent.socketId}`;

            rooms[roomId] = {
                players: [opponent, player],
                scores: [0, 0],
                currentQ: 0,
                totalQ: parseInt(player.config.questions) || 10,
                timeLimit: player.config.time,
                diff: player.config.diff,
                timer: null
            };

            socket.join(roomId);
            io.sockets.sockets.get(opponent.socketId)?.join(roomId);

            io.to(roomId).emit('matchFound', {
                roomId,
                players: [opponent.user, player.user]
            });

            sendNextQuestion(roomId);
        } else {
            waitingQueue.push(player);
        }
    });

    socket.on('submitAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;

        if (data.answer === room.currentAnswer) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                room.scores[playerIndex] += 1;
                io.to(data.roomId).emit('updateScore', room.scores);
                sendNextQuestion(data.roomId);
            }
        }
    });

    socket.on('sendEmote', (data) => {
        io.to(data.roomId).emit('receiveEmote', data);
    });

    socket.on('cancelMatch', () => {
        waitingQueue = waitingQueue.filter(p => p.socketId !== socket.id);
    });

    // ⚡ ระบบตรวจเช็กการเชื่อมต่อหลุด (Disconnect)
    socket.on('disconnect', () => {
        // 1. ลบออกจากคิวรอแข่ง (กรณีหลุดตอนกำลังค้นหาห้อง)
        waitingQueue = waitingQueue.filter(p => p.socketId !== socket.id);

        // 2. เช็กว่าอยู่ในห้องแข่งที่กำลังเล่นอยู่หรือไม่
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);

            if (playerIndex !== -1) {
                // ล้าง Timer ของห้อง
                if (room.timer) clearTimeout(room.timer);

                // แจ้งเตือนผู้เล่นอีกคนที่ยังอยู่ในห้อง
                io.to(roomId).emit('gameOver', {
                    scores: room.scores,
                    message: 'คู่ต่อสู้ออกจากเกมแล้ว คุณเป็นฝ่ายชนะ!'
                });

                // ลบห้องแข่งออกจากระบบ
                delete rooms[roomId];
                break;
            }
        }
    });
});

function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.timer) clearTimeout(room.timer);

    if (room.currentQ >= room.totalQ) {
        io.to(roomId).emit('gameOver', { scores: room.scores });
        delete rooms[roomId];
        return;
    }

    room.currentQ++;
    let num1 = Math.floor(Math.random() * 10) + 1;
    let num2 = Math.floor(Math.random() * 10) + 1;
    let op = '+';

    if (room.diff === 'medium') {
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        op = ['+', '-', '*'][Math.floor(Math.random() * 3)];
    } else if (room.diff === 'hard') {
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        op = ['+', '-', '*'][Math.floor(Math.random() * 3)];
    }

    let ans = num1 + num2;
    if (op === '-') ans = num1 - num2;
    if (op === '*') ans = num1 * num2;

    room.currentAnswer = ans;

    io.to(roomId).emit('newQuestion', {
        qIndex: room.currentQ,
        totalQ: room.totalQ,
        question: `${num1} ${op} ${num2}`,
        timeLimit: room.timeLimit
    });

    if (room.timeLimit && room.timeLimit !== 'unlimited') {
        const timeoutMs = (parseInt(room.timeLimit) + 1) * 1000;
        room.timer = setTimeout(() => {
            sendNextQuestion(roomId);
        }, timeoutMs);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
