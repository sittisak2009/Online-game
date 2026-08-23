const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- 1. Mock Database & API Routes ----------------
// หมายเหตุ: ในอนาคตสามารถเปลี่ยน Array นี้ให้เชื่อมต่อกับ Supabase หรือ Database จริงได้ครับ
const usersDB = [];

// API: Register
app.post('/api/register', (req, res) => {
    const { username, password, country } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const existingUser = usersDB.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (existingUser) {
        return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
    }

    const newUser = {
        id: usersDB.length + 1,
        username,
        password, // แนะนำให้ใช้ bcrypt ในระบบจริง
        country: country || 'TH',
        wins: 0,
        total_games: 0
    };

    usersDB.push(newUser);
    return res.json({ success: true, user: { username: newUser.username, country: newUser.country } });
});

// API: Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = usersDB.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    
    if (!user) {
        // หากยังไม่ได้สมัคร ให้สร้างสิทธิ์เข้าเล่นชั่วคราว/เข้าสู่ระบบได้ทันทีเพื่อทดสอบง่ายขึ้น
        const tempUser = { username, country: 'TH' };
        return res.json({ success: true, user: tempUser });
    }

    return res.json({ success: true, user: { username: user.username, country: user.country } });
});

// API: Leaderboard
app.get('/api/leaderboard', (req, res) => {
    const { country } = req.query;
    let list = [...usersDB];

    if (country && country !== 'ALL') {
        list = list.filter(u => u.country === country);
    }

    // เรียงตามจำนวนชนะ (Wins)
    list.sort((a, b) => b.wins - a.wins);

    res.json(list.map(u => ({
        username: u.username,
        country: u.country,
        wins: u.wins,
        total_games: u.total_games
    })));
});

// ---------------- 2. Socket.io Matchmaking & Game Logic ----------------
let waitingQueue = [];
let rooms = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('findMatch', (data) => {
        const player = { socketId: socket.id, user: data.user, config: data.config };
        
        // ค้นหาคนในคิวที่มี Config ตรงกัน
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
                timeLimit: player.config.time
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

    socket.on('cancelMatch', () => {
        waitingQueue = waitingQueue.filter(p => p.socketId !== socket.id);
    });

    socket.on('sendEmote', (data) => {
        io.to(data.roomId).emit('receiveEmote', data);
    });

    socket.on('disconnect', () => {
        waitingQueue = waitingQueue.filter(p => p.socketId !== socket.id);
    });
});

function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.currentQ >= room.totalQ) {
        io.to(roomId).emit('gameOver', { scores: room.scores });
        delete rooms[roomId];
        return;
    }

    room.currentQ++;
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    
    io.to(roomId).emit('newQuestion', {
        qIndex: room.currentQ,
        totalQ: room.totalQ,
        question: `${num1} + ${num2}`,
        answer: num1 + num2,
        timeLimit: room.timeLimit
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
