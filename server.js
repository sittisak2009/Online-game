const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// Google Sheets / Database Configuration (ลิงก์เดิมของนาย)
// ----------------------------------------------------
// ถ้าโปรเจกต์ของนายใช้ Google Apps Script Web App URL หรือ Google Sheets API สามารถใส่ตรงนี้ได้เลยครับ
const USERS_DB_URL = process.env.USERS_DB_URL || 'https://sheetdb.io/api/v1/yt7phya14ic0d'; 

// ตัวแปรเก็บข้อมูลสำรองชั่วคราว
const users = []; 
const rooms = {}; 
let waitingPlayer = null; 

// ----------------------------------------------------
// API: สมัครสมาชิก / เข้าสู่ระบบ / ตารางอันดับ
// ----------------------------------------------------
app.post('/api/register', (req, res) => {
    const { username, password, country } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'กรอกข้อมูลไม่ครบ' });
    
    const existing = users.find(u => u.username === username);
    if (existing) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });

    const newUser = { username, password, country: country || 'TH', wins: 0, total_games: 0 };
    users.push(newUser);
    res.json({ success: true, user: newUser });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    res.json({ success: true, user });
});

app.get('/api/leaderboard', (req, res) => {
    const countryFilter = req.query.country;
    let list = [...users];
    if (countryFilter && countryFilter !== 'ALL') {
        list = list.filter(u => u.country === countryFilter);
    }
    // เรียงตามจำนวนชนะ จากมากไปน้อย
    list.sort((a, b) => b.wins - a.wins);
    res.json(list);
});

// ----------------------------------------------------
// ฟังก์ชันสร้างโจทย์เลขตามความยาก
// ----------------------------------------------------
function generateQuestion(diff) {
    let num1 = Math.floor(Math.random() * 20) + 1;
    let num2 = Math.floor(Math.random() * 20) + 1;
    let op = '+';
    let text = '';
    let correctAnswer = 0;

    if (diff === 'easy') {
        op = Math.random() > 0.5 ? '+' : '-';
        if (op === '-' && num1 < num2) [num1, num2] = [num2, num1];
        correctAnswer = op === '+' ? num1 + num2 : num1 - num2;
    } else if (diff === 'medium') {
        const ops = ['+', '-', '*'];
        op = ops[Math.floor(Math.random() * ops.length)];
        if (op === '*') {
            num1 = Math.floor(Math.random() * 12) + 1;
            num2 = Math.floor(Math.random() * 12) + 1;
        }
        if (op === '-' && num1 < num2) [num1, num2] = [num2, num1];
        correctAnswer = op === '+' ? num1 + num2 : (op === '-' ? num1 - num2 : num1 * num2);
    } else {
        const ops = ['+', '-', '*', '/'];
        op = ops[Math.floor(Math.random() * ops.length)];
        if (op === '/') {
            num2 = Math.floor(Math.random() * 10) + 1;
            correctAnswer = Math.floor(Math.random() * 10) + 1;
            num1 = num2 * correctAnswer;
        } else if (op === '*') {
            num1 = Math.floor(Math.random() * 15) + 1;
            num2 = Math.floor(Math.random() * 15) + 1;
            correctAnswer = num1 * num2;
        } else {
            correctAnswer = op === '+' ? num1 + num2 : num1 - num2;
            if (op === '-' && num1 < num2) [num1, num2] = [num2, num1];
        }
    }

    text = `${num1} ${op === '*' ? '×' : (op === '/' ? '÷' : op)} ${num2} = ?`;
    return { text, correctAnswer };
}

// ----------------------------------------------------
// Socket.io Real-time Game Logic
// ----------------------------------------------------
io.on('connection', (socket) => {
    
    socket.on('findMatch', ({ user, config }) => {
        socket.user = user;
        socket.gameConfig = config;

        if (!waitingPlayer) {
            waitingPlayer = socket;
        } else {
            const player1 = waitingPlayer;
            const player2 = socket;
            waitingPlayer = null;

            const roomId = 'room_' + Date.now();
            player1.join(roomId);
            player2.join(roomId);

            const totalQ = parseInt(config.questions) || 10;
            const questions = [];
            for (let i = 0; i < totalQ; i++) {
                questions.push(generateQuestion(config.diff));
            }

            const roomData = {
                roomId,
                players: [player1.user, player2.user],
                sockets: [player1, player2],
                config,
                questions,
                currentQIndex: 0,
                scores: [0, 0]
            };

            rooms[roomId] = roomData;

            io.to(roomId).emit('matchFound', {
                roomId,
                players: roomData.players
            });

            setTimeout(() => {
                io.to(roomId).emit('newQuestion', {
                    qIndex: 1,
                    totalQ: totalQ,
                    question: questions[0].text,
                    timeLimit: config.time
                });
            }, 1000);
        }
    });

    socket.on('cancelMatch', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
    });

    socket.on('submitAnswer', ({ roomId, answer }) => {
        const room = rooms[roomId];
        if (!room) return;

        const pIndex = room.sockets.indexOf(socket);
        if (pIndex === -1) return;

        const currentQ = room.questions[room.currentQIndex];
        if (currentQ && Number(answer) === currentQ.correctAnswer) {
            room.scores[pIndex] += 10;
        }

        io.to(roomId).emit('updateScore', room.scores);

        room.currentQIndex++;

        if (room.currentQIndex < room.questions.length) {
            io.to(roomId).emit('newQuestion', {
                qIndex: room.currentQIndex + 1,
                totalQ: room.questions.length,
                question: room.questions[room.currentQIndex].text,
                timeLimit: room.config.time
            });
        } else {
            let winnerIdx = -1;
            if (room.scores[0] > room.scores[1]) winnerIdx = 0;
            else if (room.scores[1] > room.scores[0]) winnerIdx = 1;

            if (winnerIdx !== -1) {
                const winnerObj = users.find(u => u.username === room.players[winnerIdx].username);
                const loserObj = users.find(u => u.username === room.players[winnerIdx === 0 ? 1 : 0].username);
                if (winnerObj) { winnerObj.wins++; winnerObj.total_games++; }
                if (loserObj) { loserObj.total_games++; }
            } else {
                room.players.forEach(p => {
                    const uObj = users.find(u => u.username === p.username);
                    if (uObj) uObj.total_games++;
                });
            }

            io.to(roomId).emit('gameOver', { scores: room.scores });
            delete rooms[roomId];
        }
    });

    socket.on('surrender', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const pIndex = room.sockets.indexOf(socket);
        if (pIndex === -1) return;

        const winnerIdx = pIndex === 0 ? 1 : 0;
        const surrenderingUser = room.players[pIndex].username;

        const winnerObj = users.find(u => u.username === room.players[winnerIdx].username);
        const loserObj = users.find(u => u.username === surrenderingUser);
        if (winnerObj) { winnerObj.wins++; winnerObj.total_games++; }
        if (loserObj) { loserObj.total_games++; }

        io.to(roomId).emit('gameOver', {
            surrenderedBy: surrenderingUser,
            scores: room.scores
        });

        delete rooms[roomId];
    });

    socket.on('sendEmote', ({ roomId, emoji, from }) => {
        io.to(roomId).emit('receiveEmote', { emoji, from });
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket) waitingPlayer = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
              
