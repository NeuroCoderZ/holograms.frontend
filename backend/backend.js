const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Подключение к MongoDB Atlas (вставьте вашу строку подключения)
mongoose.connect('mongodb+srv://neurocoderz:fjpxHJRnmn8vC8Us@cluster0.vugws.mongodb.net/holograms?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Схема для жестов
const GestureSchema = new mongoose.Schema({
    userId: { type: Number, required: true }, // Используем Number для Telegram user_id
    gestureData: Object,
    timestamp: { type: Date, default: Date.now }
});

const Gesture = mongoose.model('Gesture', GestureSchema);

// Обработка статических файлов (фронтенд)
app.use(express.static('public'));

app.use(express.json()); // Middleware для обработки JSON

// Проверка подписи данных из Telegram Web App
function checkSignature(initData, botToken) {
    const crypto = require('crypto');
    const data = new URLSearchParams(initData);
    const hash = data.get('hash');
    data.delete('hash');

    const dataCheckString = Array.from(data.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return calculatedHash === hash;
}

io.on('connection', (socket) => {
    console.log('Новый пользователь подключился:', socket.id);

    // Аутентификация через Telegram Web App
    socket.on('authenticate', (data) => {
        const { initData } = data;
        const botToken = process.env.7452688207:AAFX9wGlF4LTL8aa2sd5mBO3HdLiE-3JMdk; // Берем токен бота из переменных окружения

        if (checkSignature(initData, botToken)) {
            const user = JSON.parse(decodeURIComponent(initData.user))
            const userId = user.id;
            socket.userId = userId; // Сохраняем userId в объекте socket
            console.log(`Пользователь ${userId} успешно аутентифицирован.`);
            socket.emit('auth-success', { userId: userId });
        } else {
            console.log('Ошибка аутентификации.');
            socket.emit('auth-failed');
            socket.disconnect(true); // Закрываем соединение, если аутентификация не удалась
        }
    });

    // Присоединение к комнате
    socket.on('join-room', (data) => {
        const { roomId, userId } = data;
        socket.join(roomId);
        console.log(`Пользователь ${userId} присоединился к комнате ${roomId}`);
        socket.to(roomId).emit('user-joined', { userId: userId, socketId: socket.id });
    });

    // Обмен данными для установки соединения WebRTC
    socket.on('offer', (data) => {
        socket.to(data.roomId).emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.to(data.roomId).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.roomId).emit('ice-candidate', data);
    });

    // Обработка жестов
    socket.on('gesture', async (gestureData) => {
        console.log('Получен жест:', gestureData);

        // Сохранение жеста в MongoDB (пример)
        if (socket.userId) {
            const gesture = new Gesture({
                userId: socket.userId,
                gestureData: gestureData
            });

            try {
                await gesture.save();
                console.log('Жест сохранен');
            } catch (err) {
                console.error('Ошибка сохранения жеста:', err);
            }
        }

        // Отправка жеста другим пользователям в той же комнате
        if (socket.rooms.size > 0) {
            socket.to(Array.from(socket.rooms)[0]).emit('gesture', gestureData);
        } else {
            socket.broadcast.emit('gesture', gestureData);
        }
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
    });
});

// Получение жестов пользователя (пример)
app.get('/api/gestures/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const gestures = await Gesture.find({ userId: parseInt(userId) }).sort({ timestamp: -1 });
        res.json(gestures);
    } catch (err) {
        console.error('Ошибка получения жестов:', err);
        res.status(500).send('Ошибка сервера');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
