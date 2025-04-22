const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

// Create the Express app, HTTP server, and Socket.io instance
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*", // In production, restrict this to your domain
    methods: ["GET", "POST"],
  },
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "../public")));

// ===============================================
// PLAYER MATCHING SYSTEM
// ===============================================

// Matching system state
const lobbies = new Map(); // Map of lobby IDs to lobby objects
const playerLobbyMap = new Map(); // Map of player IDs to lobby IDs
let nextLobbyId = 1;

// Create a new lobby object
function createLobby() {
  const lobbyId = `lobby_${nextLobbyId++}`;
  const lobby = {
    id: lobbyId,
    players: new Map(), // Map of player IDs to player objects
    state: "waiting", // waiting, starting, or active
    countdown: null, // Countdown timer reference
  };

  lobbies.set(lobbyId, lobby);
  console.log(`Created new lobby: ${lobbyId}`);
  return lobby;
}

// Add player to a lobby (creates a new lobby if none exists with space)
function addPlayerToLobby(socket, playerAddress) {
  // Check if player is already in a lobby
  if (playerLobbyMap.has(socket.id)) {
    return playerLobbyMap.get(socket.id);
  }

  // Find a lobby with space or create a new one
  let lobby = null;

  // Try to find a waiting lobby first
  for (const [lobbyId, existingLobby] of lobbies.entries()) {
    if (existingLobby.state === "waiting" && existingLobby.players.size < 4) {
      lobby = existingLobby;
      break;
    }
  }

  // If no waiting lobby found, create a new one
  if (!lobby) {
    lobby = createLobby();
  }

  // Add player to the lobby
  const player = {
    id: socket.id,
    address: playerAddress,
    ready: false,
    socket: socket,
    joinedAt: Date.now(),
  };

  lobby.players.set(socket.id, player);
  playerLobbyMap.set(socket.id, lobby.id);

  console.log(
    `Added player ${socket.id} (${playerAddress}) to lobby ${lobby.id}`
  );

  // Notify all players in the lobby about the updated player list
  broadcastLobbyUpdate(lobby);

  return lobby;
}

// Remove player from their lobby
function removePlayerFromLobby(socketId) {
  const lobbyId = playerLobbyMap.get(socketId);
  if (!lobbyId) return;

  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  // Remove player from lobby
  lobby.players.delete(socketId);
  playerLobbyMap.delete(socketId);
  console.log(`Removed player ${socketId} from lobby ${lobbyId}`);

  // If lobby is empty, delete it
  if (lobby.players.size === 0) {
    // Clear any existing countdown
    if (lobby.countdown) {
      clearTimeout(lobby.countdown);
    }

    lobbies.delete(lobbyId);
    console.log(`Deleted empty lobby ${lobbyId}`);
    return;
  }

  // Otherwise, broadcast updated player list
  broadcastLobbyUpdate(lobby);
}

// Broadcast lobby status to all players in the lobby
function broadcastLobbyUpdate(lobby) {
  const playerData = Array.from(lobby.players.values()).map((player) => ({
    id: player.id,
    address: player.address,
    ready: player.ready,
  }));

  // Send update to all players
  lobby.players.forEach((player) => {
    player.socket.emit("lobby-update", {
      lobbyId: lobby.id,
      players: playerData,
      state: lobby.state,
    });
  });
}

// Start a lobby countdown when all players are ready
function startLobbyCountdown(lobby) {
  if (lobby.state !== "waiting") return;

  // Check if all players are ready
  const allReady = Array.from(lobby.players.values()).every(
    (player) => player.ready
  );
  if (!allReady || lobby.players.size < 2) return;

  // Start countdown
  lobby.state = "starting";
  let countdown = 5; // 5 seconds countdown

  // Clear any existing countdown
  if (lobby.countdown) {
    clearTimeout(lobby.countdown);
  }

  // Notify players that countdown has started
  lobby.players.forEach((player) => {
    player.socket.emit("game-countdown", {
      countdown: countdown,
    });
  });

  const tick = () => {
    countdown--;

    // Send countdown update
    lobby.players.forEach((player) => {
      player.socket.emit("game-countdown", {
        countdown: countdown,
      });
    });

    if (countdown <= 0) {
      // Start the game
      startGame(lobby);
    } else {
      // Continue countdown
      lobby.countdown = setTimeout(tick, 1000);
    }
  };

  // Start the countdown
  lobby.countdown = setTimeout(tick, 1000);
}

// Start the game for a lobby
function startGame(lobby) {
  lobby.state = "active";

  // Prepare player data for game initialization
  const gameData = {
    players: Array.from(lobby.players.values()).map((player, index) => ({
      id: player.id,
      address: player.address,
      spawnPointIndex: index % 2, // Alternate spawn points
    })),
  };

  // Signal all players to start the game
  lobby.players.forEach((player) => {
    player.socket.emit("game-start", gameData);
  });

  // After a short delay, move all players to the game namespace
  setTimeout(() => {
    lobby.players.forEach((player) => {
      // This will be handled client-side by navigating to the game page
      player.socket.emit("navigate-to-game");
    });
  }, 1000);
}

// ===============================================
// GAME MECHANICS (Your existing game logic)
// ===============================================

// Game state
const players = {};
const SPAWN_POINTS = [
  { x: 200, y: 686 }, // Left side spawn
  { x: 3000, y: 686 }, // Right side spawn
];

// Handle socket connections
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // ===============================================
  // MATCHING SYSTEM SOCKET HANDLERS
  // ===============================================

  // Handle player joining the matching system
  socket.on("join-matching", (data) => {
    console.log(
      `Player ${socket.id} joining matching with address ${data.address}`
    );

    // Add player to a lobby
    const lobby = addPlayerToLobby(socket, data.address);

    // Send initial lobby state to the player
    const playerData = Array.from(lobby.players.values()).map((player) => ({
      id: player.id,
      address: player.address,
      ready: player.ready,
    }));

    socket.emit("matching-joined", {
      success: true,
      lobbyId: lobby.id,
      players: playerData,
      state: lobby.state,
    });
  });

  // Handle player ready status
  socket.on("player-ready", (data) => {
    const lobbyId = playerLobbyMap.get(socket.id);
    if (!lobbyId) return;

    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.state !== "waiting") return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    // Update player ready status
    player.ready = data.ready;
    console.log(`Player ${socket.id} ready status: ${player.ready}`);

    // Broadcast updated player list
    broadcastLobbyUpdate(lobby);

    // Check if all players are ready to start the countdown
    if (data.ready) {
      startLobbyCountdown(lobby);
    } else {
      // If a player is no longer ready, cancel the countdown
      if (lobby.countdown) {
        clearTimeout(lobby.countdown);
        lobby.countdown = null;
        lobby.state = "waiting";

        // Notify players that countdown has been cancelled
        lobby.players.forEach((p) => {
          p.socket.emit("countdown-cancelled");
        });
      }
    }
  });

  // Handle player requesting to start the game
  socket.on("start-game", () => {
    const lobbyId = playerLobbyMap.get(socket.id);
    if (!lobbyId) return;

    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.state !== "waiting") return;

    // Check if all players are ready
    const allReady = Array.from(lobby.players.values()).every(
      (player) => player.ready
    );
    if (!allReady || lobby.players.size < 2) return;

    // Start the countdown
    startLobbyCountdown(lobby);
  });

  // Handle player leaving the matching system
  socket.on("leave-matching", () => {
    removePlayerFromLobby(socket.id);
  });

  // ===============================================
  // GAME MECHANICS SOCKET HANDLERS (Your existing code)
  // ===============================================

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
    health: 10, // Starting health
    isDead: false, // Death state
    lastHitBy: null, // Track who hit this player last
    respawning: false, // Track if player is in respawn cooldown
  };

  // Send the current players to the new player
  socket.emit("currentPlayers", players);

  // Inform all other players about the new player
  socket.broadcast.emit("newPlayer", players[socket.id]);

  // Handle player movement
  socket.on("playerMovement", (movementData) => {
    // Skip if player is dead or doesn't exist
    if (!players[socket.id] || players[socket.id].isDead) return;

    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    players[socket.id].flipX = movementData.flipX;

    // If client sent health, update it (only accept if lower to prevent cheating)
    if (
      movementData.health !== undefined &&
      movementData.health < players[socket.id].health
    ) {
      players[socket.id].health = movementData.health;
    }

    // Broadcast the movement to all other players
    socket.broadcast.emit("playerMoved", players[socket.id]);
  });

  // Handle player shooting
  socket.on("playerShoot", (bulletData) => {
    // Skip if player is dead or doesn't exist
    if (!players[socket.id] || players[socket.id].isDead) return;

    // Broadcast the bullet to all other players
    socket.broadcast.emit("bulletCreated", {
      ...bulletData,
      playerId: socket.id,
    });
  });

  // Handle bullet hit detection
  socket.on("hitPlayer", (data) => {
    const { targetId } = data;

    // Validate target exists and is not already dead
    if (!players[targetId] || players[targetId].isDead) {
      console.log(
        `Bullet hit invalid: Target ${targetId} doesn't exist or is already dead`
      );
      return;
    }

    // Record who hit this player
    players[targetId].lastHitBy = socket.id;

    // Reduce target health - but make sure it doesn't go below 0
    players[targetId].health = Math.max(0, players[targetId].health - 1);

    console.log(`BULLET HIT: Player ${targetId} hit by ${socket.id}`);
    console.log(`New Health: ${players[targetId].health}`);

    // Broadcast damage to all players
    io.emit("playerDamaged", {
      playerId: targetId,
      health: players[targetId].health,
      shooterId: socket.id,
    });

    // Check if player died from this hit - only if health is exactly 0
    // This prevents handling death multiple times for the same player
    if (players[targetId].health === 0 && !players[targetId].isDead) {
      console.log(`Player ${targetId} killed - health reached 0`);
      handlePlayerDeath(targetId, socket.id);
    } else {
      console.log(
        `Player ${targetId} still alive with ${players[targetId].health} health`
      );
    }
  });

  // Handle player being hit by a bullet
  socket.on("bulletHitMe", (data) => {
    console.log("SERVER: bulletHitMe event data:", data);
    // Use a fallback ID if shooterId is undefined
    const shooterId = data.shooterId || "SYSTEM";

    console.log(
      `SERVER: bulletHitMe event - Player ${socket.id} hit by ${shooterId}`
    );

    // Skip if player doesn't exist or is already dead
    if (!players[socket.id] || players[socket.id].isDead) {
      console.log(
        `SERVER: bulletHitMe invalid - Player doesn't exist or is already dead`
      );
      return;
    }

    // Record who hit this player
    players[socket.id].lastHitBy = shooterId;

    // Reduce health
    const previousHealth = players[socket.id].health;
    players[socket.id].health = Math.max(0, players[socket.id].health - 1);

    console.log(
      `SERVER: Health BEFORE: ${previousHealth}, AFTER: ${
        players[socket.id].health
      }`
    );

    // Broadcast damage to all players
    io.emit("playerDamaged", {
      playerId: socket.id,
      health: players[socket.id].health,
      shooterId: shooterId,
    });

    // Check if player died from this hit
    if (players[socket.id].health === 0 && !players[socket.id].isDead) {
      console.log(
        `SERVER: Player ${socket.id} health reached 0 - triggering death`
      );
      handlePlayerDeath(socket.id, shooterId);
    } else {
      console.log(
        `SERVER: Player ${socket.id} still alive with ${
          players[socket.id].health
        } health`
      );
    }
  });

  // Handle player death signal from client
  socket.on("playerDied", () => {
    if (!players[socket.id] || players[socket.id].isDead) return;

    handlePlayerDeath(socket.id, players[socket.id].lastHitBy);
  });

  // Handle player respawn signal from client
  socket.on("playerRespawned", (data) => {
    if (!players[socket.id]) return;

    // Use client position if provided, otherwise use spawn point
    if (data && data.x !== undefined && data.y !== undefined) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
    } else {
      // Alternate spawn points for fairness
      players[socket.id].spawnPointIndex =
        (players[socket.id].spawnPointIndex + 1) % SPAWN_POINTS.length;
      const spawnPoint = SPAWN_POINTS[players[socket.id].spawnPointIndex];
      players[socket.id].x = spawnPoint.x;
      players[socket.id].y = spawnPoint.y;
    }

    // Reset player state
    players[socket.id].health = 10;
    players[socket.id].isDead = false;
    players[socket.id].respawning = false;

    // Broadcast respawn to all players
    io.emit("playerRespawned", {
      playerId: socket.id,
      x: players[socket.id].x,
      y: players[socket.id].y,
    });
  });

  // Handle player disconnection
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    // Remove from matching system if they're in a lobby
    removePlayerFromLobby(socket.id);

    // Remove the player from the game
    delete players[socket.id];

    // Inform all other players
    io.emit("playerDisconnected", socket.id);
  });
});

// Helper function to handle player death
function handlePlayerDeath(playerId, killerId) {
  console.log(`SERVER: handlePlayerDeath called for ${playerId}`);
  console.log(
    `SERVER: Player state - Health: ${players[playerId]?.health}, IsDead: ${players[playerId]?.isDead}`
  );

  if (!players[playerId] || players[playerId].isDead) {
    console.log(
      `SERVER: Death handling aborted - Player doesn't exist or is already dead`
    );
    return;
  }

  // Mark player as dead
  players[playerId].isDead = true;
  players[playerId].health = 0;
  players[playerId].respawning = true;

  console.log(
    `SERVER: Player ${playerId} marked as dead, emitting playerDied event`
  );

  // Broadcast death to all players
  io.emit("playerDied", {
    playerId: playerId,
    killedBy: killerId,
  });

  // Auto-respawn after 3 seconds
  setTimeout(() => {
    if (players[playerId] && players[playerId].isDead) {
      // Alternate spawn points for fairness
      players[playerId].spawnPointIndex =
        (players[playerId].spawnPointIndex + 1) % SPAWN_POINTS.length;
      const spawnPoint = SPAWN_POINTS[players[playerId].spawnPointIndex];

      // Reset player state
      players[playerId].x = spawnPoint.x;
      players[playerId].y = spawnPoint.y;
      players[playerId].health = 10;
      players[playerId].isDead = false;
      players[playerId].respawning = false;

      // Broadcast respawn to all players
      io.emit("playerRespawned", {
        playerId: playerId,
        x: players[playerId].x,
        y: players[playerId].y,
      });
      console.log(`SERVER: Sent playerRespawned event for ${playerId}`);
    } else {
      console.log(
        `SERVER: Player ${playerId} no longer exists or is not dead - skipping respawn`
      );
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
  console.log(
    `Matching system and game server active at http://localhost:${PORT}`
  );
});
