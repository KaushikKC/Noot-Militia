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
    flipX: false,
    health: 10,               // Starting health
    isDead: false,            // Death state
    lastHitBy: null,          // Track who hit this player last
    respawning: false         // Track if player is in respawn cooldown
  };
  
  // Send the current players to the new player
  socket.emit('currentPlayers', players);
  
  // Inform all other players about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    // Skip if player is dead or doesn't exist
    if (!players[socket.id] || players[socket.id].isDead) return;
    
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    players[socket.id].flipX = movementData.flipX;
    
    // If client sent health, update it (only accept if lower to prevent cheating)
    if (movementData.health !== undefined && movementData.health < players[socket.id].health) {
      players[socket.id].health = movementData.health;
    }
    
    // Broadcast the movement to all other players
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });
  
  // Handle player shooting
  socket.on('playerShoot', (bulletData) => {
    // Skip if player is dead or doesn't exist
    if (!players[socket.id] || players[socket.id].isDead) return;
    
    // Broadcast the bullet to all other players
    socket.broadcast.emit('bulletCreated', {
      ...bulletData,
      playerId: socket.id
    });
  });
  
  // Handle bullet hit detection
  socket.on('bulletHit', (data) => {
    const { targetId } = data;
    
    // Validate target exists and is not already dead
    if (!players[targetId] || players[targetId].isDead) return;
    
    // Record who hit this player
    players[targetId].lastHitBy = socket.id;
    
    // Reduce target health
    players[targetId].health -= 1;
    
    // Broadcast damage to all players
    io.emit('playerDamaged', {
      playerId: targetId,
      health: players[targetId].health,
      shooterId: socket.id
    });
    
    // Check if player died from this hit
    if (players[targetId].health <= 0 && !players[targetId].isDead) {
      handlePlayerDeath(targetId, socket.id);
    }
  });
  
  // Handle player death signal from client
  socket.on('playerDied', () => {
    if (!players[socket.id] || players[socket.id].isDead) return;
    
    handlePlayerDeath(socket.id, players[socket.id].lastHitBy);
  });
  
  // Handle player respawn signal from client
  socket.on('playerRespawned', (data) => {
    if (!players[socket.id]) return;
    
    // Use client position if provided, otherwise use spawn point
    if (data && data.x !== undefined && data.y !== undefined) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
    } else {
      // Alternate spawn points for fairness
      players[socket.id].spawnPointIndex = (players[socket.id].spawnPointIndex + 1) % SPAWN_POINTS.length;
      const spawnPoint = SPAWN_POINTS[players[socket.id].spawnPointIndex];
      players[socket.id].x = spawnPoint.x;
      players[socket.id].y = spawnPoint.y;
    }
    
    // Reset player state
    players[socket.id].health = 10;
    players[socket.id].isDead = false;
    players[socket.id].respawning = false;
    
    // Broadcast respawn to all players
    io.emit('playerRespawned', {
      playerId: socket.id,
      x: players[socket.id].x,
      y: players[socket.id].y
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

// Helper function to handle player death
function handlePlayerDeath(playerId, killerId) {
  if (!players[playerId] || players[playerId].isDead) return;
  
  // Mark player as dead
  players[playerId].isDead = true;
  players[playerId].health = 0;
  players[playerId].respawning = true;
  
  // Broadcast death to all players
  io.emit('playerDied', {
    playerId: playerId,
    killedBy: killerId
  });
  
  // Auto-respawn after 3 seconds
  setTimeout(() => {
    if (players[playerId] && players[playerId].isDead) {
      // Alternate spawn points for fairness
      players[playerId].spawnPointIndex = (players[playerId].spawnPointIndex + 1) % SPAWN_POINTS.length;
      const spawnPoint = SPAWN_POINTS[players[playerId].spawnPointIndex];
      
      // Reset player state
      players[playerId].x = spawnPoint.x;
      players[playerId].y = spawnPoint.y;
      players[playerId].health = 10;
      players[playerId].isDead = false;
      players[playerId].respawning = false;
      
      // Broadcast respawn to all players
      io.emit('playerRespawned', {
        playerId: playerId,
        x: players[playerId].x,
        y: players[playerId].y
      });
    }
  }, 3000);
  
  // Could add kill stats here if desired
  if (killerId && players[killerId]) {
    players[killerId].kills = (players[killerId].kills || 0) + 1;
    console.log(`Player ${killerId} now has ${players[killerId].kills} kills`);
  }
}

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});