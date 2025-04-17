const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Create the Express app, HTTP server, and Socket.io instance
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*', // In production, restrict this to your domain
    methods: ['GET', 'POST']
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Game state
const players = {};
const SPAWN_POINTS = [
  { x: 200, y: 686 },  // Left side spawn
  { x: 3000, y: 686 }  // Right side spawn
];

// Handle socket connections
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Assign a spawn point (alternating between the two)
  const spawnPointIndex = Object.keys(players).length % 2;
  const spawnPoint = SPAWN_POINTS[spawnPointIndex];
  
  // Create a new player
  players[socket.id] = {
    x: spawnPoint.x,
    y: spawnPoint.y,
    playerId: socket.id,
    spawnPointIndex: spawnPointIndex,
    flipX: false
  };
  
  // Send the current players to the new player
  socket.emit('currentPlayers', players);
  
  // Inform all other players about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    players[socket.id].flipX = movementData.flipX;
    
    // Broadcast the movement to all other players
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });
  
  // Handle player shooting
  socket.on('playerShoot', (bulletData) => {
    // Broadcast the bullet to all other players
    socket.broadcast.emit('bulletCreated', {
      ...bulletData,
      playerId: socket.id
    });
  });
  
  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    // Remove the player from the game
    delete players[socket.id];
    
    // Inform all other players
    io.emit('playerDisconnected', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});