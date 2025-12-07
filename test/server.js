const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Handle socket connections
io.on('connection', (socket) => {
  console.log('A user connected with socket id:', socket.id);
  
  // Send welcome message when client connects
  socket.emit('welcome', {
    message: 'Welcome to the Socket.IO test server!',
    clientId: socket.id,
    timestamp: new Date()
  });
  
  // Join room event
  socket.on('joinRoom', (data) => {
    console.log('User joined room:', data);
    socket.join(data.room);
    socket.emit('joinedRoom', { room: data.room, timestamp: new Date() });
  });
  
  // Chat message event
  socket.on('chatMessage', (data) => {
    console.log('Chat message received:', data);
    
    // Broadcast to room or everyone
    if (data.room) {
      socket.to(data.room).emit('newMessage', {
        from: socket.id,
        message: data.message,
        timestamp: new Date()
      });
    } else {
      socket.broadcast.emit('newMessage', {
        from: socket.id,
        message: data.message,
        timestamp: new Date()
      });
    }
    
    // Send acknowledgment back to sender
    socket.emit('messageSent', {
      status: 'success',
      message: data.message,
      timestamp: new Date()
    });
  });
  
  // Custom event
  socket.on('customEvent', (data, callback) => {
    console.log('Custom event received:', data);
    
    // If callback is provided, send response back
    if (typeof callback === 'function') {
      callback({
        status: 'processed',
        receivedData: data,
        processedAt: new Date()
      });
    }
  });
  
  // Disconnect event
  socket.on('disconnect', () => {
    console.log('User disconnected with socket id:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO test server listening on port ${PORT}`);
  console.log(`Connect to this server with: node bin/siocat.js http://localhost:${PORT}`);
});