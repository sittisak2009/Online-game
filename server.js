const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Database Setup (SQLite ถาวร)
const db = new Database('game.db');
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        country TEXT,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0
    )
`);

app.use(express.static('public'));

let matchmakingQueue = [];
const games = {};

function generateProblem(difficulty) {
    let num1, num2, isAdd, answer, text;
    if (difficulty === 'easy') {
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        isAdd = Math.random() > 0.5;
        text = isAdd ? `${num1} + ${num2}` : `${Math.max(num1, num2)} - ${Math.min(num1, num2)}`;
        answer = isAdd ? num1 + num2 : Math.abs(num1 - num2);
    } else if (difficulty === 'medium') {
        const type = Math.floor(Math.random() * 3);
        num1 = Math.floor(Math.random() * 30) + 2;
        num2 = Math.floor(Math.random() * 12) + 2;
        if (type === 0) { text = `${num1} + ${num2}`; answer = num1 + num2; }
        else if (type === 1) { text = `${Math.max(num1, num2)} - ${Math.min(num1, num2)}`; answer = Math.abs(num1 - num2); }
        else { text = `${num1} × ${num2}`; answer = num1 * num2; }
    } else {
        const type = Math.floor(Math.random() * 2);
        if (type === 0) {
            num1 = Math.floor(Math.random() * 50) + 10;
            num2 = Math.floor(Math.random() * 20) + 2;
            text = `${num1} × ${num2}`;
            answer = num1 * num2;
        } else {
            num2 = Math.floor(Math.random() * 12) + 2;
            answer = Math.floor(Math.random() * 20) + 2;
            num1 = num2 * answer;
            text = `${num1} ÷ ${num2}`;
        }
    }
    return { text, answer };
}

function updateStats(p1User, p2User, resultType, winnerUsername) {
    if (resultType === 'draw') {
        db.prepare('UPDATE users SET draws = draws + 1 WHERE username = ?').run(p1User);
        db.prepare('UPDATE users SET draws = draws + 1 WHERE username = ?').run(p2User);
    } else {
        const loserUsername = winnerUsername === p1User ? p2User : p1User;
        db.prepare('UPDATE users SET wins = wins + 1 WHERE username = ?').run(winnerUsername);
        db.prepare('UPDATE users SET losses = losses + 1 WHERE username = ?').run(loserUsername);
    }
}

function nextRound(roomId) {
    const game = games[roomId];
    if (!game) return;

    if (game.currentQuestion >= game.totalQuestions) {
        if (game.timer) clearInterval(game.timer);
        
        const p1 = game.p1;
        const p2 = game.p2;
        let resultType = 'winner';
        let winnerId = null;
        let winnerUsername = null;

        if (p1.score > p2.score) { winnerId = p1.id; winnerUsername = p1.username; }
        else if (p2.score > p1.score) { winnerId = p2.id; winnerUsername = p2.username; }
        else { resultType = 'draw'; }

        updateStats(p1.username, p2.username, resultType, winnerUsername);

        io.to(roomId).emit('gameOver', { 
            resultType: resultType,
            winnerId: winnerId, 
            scores: { [p1.id]: p1.score, [p2.id]: p2.score } 
        });
        delete games[roomId];
        return;
    }

    game.currentQuestion += 1;
    game.currentProblem = generateProblem(game.difficulty);

    io.to(roomId).emit('nextProblem', {
        currentQuestion: game.currentQuestion,
        totalQuestions: game.totalQuestions,
        problem: game.currentProblem.text,
        scores: { [game.p1.id]: game.p1.score, [game.p2.id]: game.p2.score }
    });

    startTimer(roomId);
}

function startTimer(roomId) {
    const game = games[roomId];
    if (!game) return;

    if (game.timer) clearInterval(game.timer);

    if (game.timeLimit === 'unlimited') {
        io.to(roomId).emit('timerUpdate', { isUnlimited: true });
        return;
    }

    const timeLimitNum = Number(game.timeLimit);
    game.timeLeft = timeLimitNum;
    io.to(roomId).emit('timerUpdate', { timeLeft: game.timeLeft, maxTime: timeLimitNum, isUnlimited: false });

    game.timer = setInterval(() => {
        game.timeLeft -= 1;
        io.to(roomId).emit('timerUpdate', { timeLeft: game.timeLeft, maxTime: timeLimitNum, isUnlimited: false });

        if (game.timeLeft <= 0) {
            nextRound(roomId);
        }
    }, 1000);
}

io.on('connection', (socket) => {

    // Auth: Register
    socket.on('register', ({ username, password, country }) => {
        try {
            const stmt = db.prepare('INSERT INTO users (username, password, country) VALUES (?, ?, ?)');
            stmt.run(username, password, country);
            socket.emit('authSuccess', { username, country });
        } catch (err) {
            socket.emit('authError', 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
        }
    });

    // Auth: Login
    socket.on('login', ({ username, password }) => {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
        if (user) {
            socket.emit('authSuccess', { username: user.username, country: user.country });
        } else {
            socket.emit('authError', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
    });

    // Leaderboard Data
    socket.on('getLeaderboard', ({ country }) => {
        let query = 'SELECT username, country, wins, losses, draws FROM users';
        let params = [];
        if (country && country !== 'ALL') {
            query += ' WHERE country = ?';
            params.push(country);
        }
        query += ' ORDER BY wins DESC LIMIT 20';

        const list = db.prepare(query).all(...params);
        socket.emit('leaderboardData', list);
    });

    // Matchmaking
    socket.on('findMatch', ({ username, difficulty, timeLimit, totalQuestions }) => {
        matchmakingQueue = matchmakingQueue.filter(p => p.id !== socket.id);

        const timeLimitStr = String(timeLimit);
        const totalQNum = Number(totalQuestions);

        const opponentIndex = matchmakingQueue.findIndex(
            p => p.difficulty === difficulty && 
                 String(p.timeLimit) === timeLimitStr && 
                 Number(p.totalQuestions) === totalQNum
        );

        if (opponentIndex !== -1) {
            const opponent = matchmakingQueue.splice(opponentIndex, 1)[0];
            const p1Socket = io.sockets.sockets.get(opponent.id);
            const p2Socket = socket;

            if (p1Socket && p2Socket) {
                const roomId = `room_${opponent.id}_${socket.id}`;
                p1Socket.join(roomId);
                p2Socket.join(roomId);

                games[roomId] = {
                    p1: { id: opponent.id, username: opponent.username, score: 0 },
                    p2: { id: socket.id, username: username, score: 0 },
                    difficulty: difficulty,
                    timeLimit: timeLimitStr,
                    totalQuestions: totalQNum,
                    currentQuestion: 1,
                    timeLeft: timeLimitStr === 'unlimited' ? null : Number(timeLimitStr),
                    currentProblem: generateProblem(difficulty),
                    timer: null
                };

                io.to(roomId).emit('gameStart', {
                    roomId: roomId,
                    currentQuestion: 1,
                    totalQuestions: totalQNum,
                    problem: games[roomId].currentProblem.text,
                    players: {
                        [opponent.id]: opponent.username,
                        [socket.id]: username
                    },
                    scores: { [opponent.id]: 0, [socket.id]: 0 }
                });

                startTimer(roomId);
            }
        } else {
            matchmakingQueue.push({ id: socket.id, username, difficulty, timeLimit: timeLimitStr, totalQuestions: totalQNum });
            socket.emit('waiting', 'กำลังรอผู้เล่นอื่นที่เลือกเงื่อนไขเดียวกัน...');
        }
    });

    socket.on('cancelMatch', () => {
        matchmakingQueue = matchmakingQueue.filter(p => p.id !== socket.id);
        socket.emit('matchCancelled');
    });

    socket.on('submitAnswer', ({ roomId, answer }) => {
        const game = games[roomId];
        if (!game) return;

        if (parseInt(answer) === game.currentProblem.answer) {
            if (socket.id === game.p1.id) game.p1.score += 10;
            if (socket.id === game.p2.id) game.p2.score += 10;

            nextRound(roomId);
        } else {
            socket.emit('wrongAnswer');
        }
    });

    socket.on('disconnect', () => {
        matchmakingQueue = matchmakingQueue.filter(p => p.id !== socket.id);
        for (const roomId in games) {
            if (games[roomId].p1.id === socket.id || games[roomId].p2.id === socket.id) {
                if (games[roomId].timer) clearInterval(games[roomId].timer);
                io.to(roomId).emit('playerLeft');
                delete games[roomId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
        
