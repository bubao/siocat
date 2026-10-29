const io = require('socket.io-client-4');

// Connect to the server
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');

  // Listen for newMessage event
  socket.on('newMessage', (data) => {
    console.log('Received newMessage:', data);
  });

  // Listen for messageSent event (acknowledgement)
  socket.on('messageSent', (data) => {
    console.log('Received messageSent:', data);
  });

  // Listen for joinedRoom event
  socket.on('joinedRoom', (data) => {
    console.log('Received joinedRoom:', data);
  });

  // Send a chat message
  console.log('Sending chatMessage event');
  socket.emit('chatMessage', { message: 'Hello from test client' }, (response) => {
    console.log('Acknowledgement received:', response);

    // Close connection after receiving acknowledgement
    setTimeout(() => {
      socket.close();
      process.exit(0);
    }, 1000);
  });
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.log('Connection error:', error.message);
  process.exit(1);
});
