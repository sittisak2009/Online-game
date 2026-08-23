const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SheetDB URL ของนาย
const SHEETDB_URL = process.env.SHEETDB_URL || 'https://sheetdb.io/api/v1/yt7phya14ic0d';

// ฟังก์ชันดึงข้อมูลผู้ใช้ทั้งหมดจาก SheetDB
async function fetchUsersFromSheet() {
    try {
        const response = await fetch(SHEETDB_URL);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error("Error fetching from SheetDB:", err);
        return [];
    }
}

// ฟังก์ชันเพิ่มผู้ใช้ใหม่ลง SheetDB (Columns: username, password, country, wins, losses, draws)
async function addUserToSheet(userData) {
    try {
        await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                data: [{
                    username: userData.username,
                    password: userData.password,
                    country: userData.country || 'TH',
                    wins: 0,
                    losses: 0,
                    draws: 0
                }] 
            })
        });
    } catch (err) {
        console.error("Error adding user to SheetDB:", err);
    }
}

// ฟังก์ชันอัปเดตสถิติหลังจบเกม (wins, losses, draws) ใน SheetDB
async function updatePlayerStatsInSheet(username, result) {
    try {
        const users = await fetchUsersFromSheet();
        const user = users.find(u => u.username === username);
        if (!user) return;

        let wins = Number(user.wins || 0);
        let losses = Number(user.losses || 0);
        let draws = Number(user.draws || 0);

        if (result === 'win') wins++;
        else if (result === 'loss') losses++;
        else if (result === 'draw') draws++;

        await fetch(`${SHEETDB_URL}/username/${username}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: { wins, losses, draws }
            })
        });
    } catch (err) {
        console.error("Error updating stats in SheetDB:", err);
    }
}

// ----------------------------------------------------
// API Routes
// ----------------------------------------------------
app.post('/api/register', async (req, res) => {
    const { username, password, country } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'กรอกข้อมูลไม่ครบ' });
    
    const users = await fetchUsersFromSheet();
    const existing = users.find(u => u.username === username);
    if (existing) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });

    const newUser = { username, password, country: country || 'TH', wins: 0, losses: 0, draws: 0 };
    await addUserToSheet(newUser);
    res.json({ success: true, user: newUser });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await fetchUsersFromSheet();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    
    user.wins = Number(user.wins || 0);
    user.losses = Number(user.losses || 0);
    user.draws = Number(user.draws || 0);

    res.json({ success: true, user });
});

app.get('/api/leaderboard', async (req, res) => {
    const countryFilter = req.query.country;
    let list = await fetchUsersFromSheet();
    
    if (countryFilter && countryFilter !== 'ALL') {
        list = list.filter(u => u.country === countryFilter);
    }
    
    list.forEach(u => {
        u.wins = Number(u.wins || 0);
        u.losses = Number(u.losses || 0);
        u.draws = Number(u.draws || 0);
    });

    list.sort((a, b) => b.wins - a.wins);
    res.json(list);
});

// ----------------------------------------------------
// Math Question Generator
// ----------------------------------------------------
function generateQuestion(diff) {
    let num1 = Math.floor(Math.random() * 20) + 1;
    let num2 = Math.floor(Math.random() * 20) + 1;
    let op = '+';
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

    const text = `${num1} ${op === '*' ? '×' : (op === '/' ? '÷' : op)} ${num2} = ?`;
    return { text, correctAnswer };
}

// ----------------------------------------------------
// Socket.io Real-time Game Logic & Fixed Matchmaking
// ----------------------------------------------------
const rooms = {}; 
const waitingPlayers = {}; // แยกคิวตามการตั้งค่าโหมด (แก้ปัญหาจับคู่ข้ามโหมด)

io.on('connection', (socket) => {
    
    // ระบบหาห้องดวล (แยกคิวตาม Config เป๊ะๆ)
    socket.on('findMatch', ({ user, config }) => {
        socket.user = user;
        socket.gameConfig = config;

        const matchKey = `${config.diff}_${config.questions}_${config.time}`;

        if (!waitingPlayers[matchKey]) {
            waitingPlayers[matchKey] = [];
        }

        waitingPlayers[matchKey].push(socket);

        if (waitingPlayers[matchKey].length >= 2) {
            const player1 = waitingPlayers[matchKey].shift();
            const player2 = waitingPlayers[matchKey].shift();

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
        for (let key in waitingPlayers) {
            waitingPlayers[key] = waitingPlayers[key].filter(s => s !== socket);
        }
    });

    // โหมดฝึกซ้อมคนเดียว (Solo Practice)
    socket.on('startSoloPractice', ({ config }) => {
        const totalQ = parseInt(config.questions) || 10;
        const questions = [];
        for (let i = 0; i < totalQ; i++) {
            questions.push(generateQuestion(config.diff));
        }
        
        socket.emit('soloGameStarted', {
            totalQ,
            question: questions[0].text,
            timeLimit: config.time,
            questionsList: questions
        });
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
                const winnerUser = room.players[winnerIdx].username;
                const loserUser = room.players[winnerIdx === 0 ? 1 : 0].username;
                updatePlayerStatsInSheet(winnerUser, 'win');
                updatePlayerStatsInSheet(loserUser, 'loss');
            } else {
                room.players.forEach(p => updatePlayerStatsInSheet(p.username, 'draw'));
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
        const winnerUser = room.players[winnerIdx].username;

        updatePlayerStatsInSheet(winnerUser, 'win');
        updatePlayerStatsInSheet(surrenderingUser, 'loss');

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
        for (let key in waitingPlayers) {
            waitingPlayers[key] = waitingPlayers[key].filter(s => s !== socket);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
        
