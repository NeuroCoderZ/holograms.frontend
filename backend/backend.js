const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Подключение к MongoDB (пример, замените на свои данные)
mongoose.connect('mongodb+srv://<username>:<password>@<your-cluster>.mongodb.net/holograms', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Схема для жестов (пример)
const GestureSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  gestureData: Object,
  timestamp: { type: Date, default: Date.now }
});

const Gesture = mongoose.model('Gesture', GestureSchema);

// Обработка статических файлов (наш Frontend)
app.use(express.static('../public')); // Предполагается, что папка с фронтендом называется "public" и находится на том же уровне, что и папка backend

app.use(express.json()); // Middleware для обработки JSON

function checkSignature(initData, botToken) {
  const crypto = require('crypto');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedSignature = crypto.createHmac('sha256', secretKey).update(new URLSearchParams(initData).toString()).digest('hex');
  return initData.hash === expectedSignature;
}

io.on('connection', (socket) => {
  console.log('Новый пользователь подключился:', socket.id);

    socket.on('authenticate', (data) => {
    const { initData } = data;
    const botToken = 'YOUR_TELEGRAM_BOT_TOKEN'; // Замените на токен вашего бота

    if (checkSignature(initData, botToken)) {
      const userId = initData.user.id;
      socket.userId = userId; // Сохраняем userId в объекте socket
      console.log(`Пользователь ${userId} успешно аутентифицирован.`);
      socket.emit('auth-success', { userId: userId });
    } else {
      console.log('Ошибка аутентификации.');
      socket.emit('auth-failed');
      socket.disconnect(true);
    }
  });

    socket.on('join-room', (data) => {
        const { roomId, userId } = data;
        socket.join(roomId); // Подключаем пользователя к комнате
        console.log(`Пользователь ${userId} присоединился к комнате ${roomId}`);
        socket.to(roomId).emit('user-joined', { userId: userId, socketId: socket.id }); // Сообщаем другим в комнате о присоединении
    });

  // Обмен данными для установки соединения WebRTC
  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', data); // Отправляем offer конкретной комнате
  });

  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', data); // Отправляем answer конкретной комнате
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', data); // Отправляем ice-candidate конкретной комнате
  });

  // Обработка жестов
  socket.on('gesture', async (gestureData) => {
    console.log('Получен жест:', gestureData);

    // Сохранение жеста в MongoDB (пример)
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

    // Отправка жеста другим пользователям (пока всем)
    socket.broadcast.emit('gesture', gestureData);
  });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
  });
});

// Получение жестов пользователя
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
