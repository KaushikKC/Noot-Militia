const WebSocket = require("ws");
const http = require("http");

// Create an HTTP server
const server = http.createServer();

// Create a WebSocket server instance
const wss = new WebSocket.Server({ server });

// Store connected players
const connectedPlayers = new Map();
let nextPlayerId = 1;

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("New client connected");
  const clientId = nextPlayerId++;

  // Set initial player data
  let playerData = {
    id: clientId,
    address: null,
    ready: false,
    timestamp: Date.now(),
  };

  // Store the connection
  connectedPlayers.set(clientId, { ws, data: playerData });

  // Send initial player list to the new client
  const initialPlayers = Array.from(connectedPlayers.values()).map(
    (p) => p.data
  );
  ws.send(
    JSON.stringify({
      type: "init",
      players: initialPlayers,
    })
  );

  // Handle messages from clients
  ws.on("message", (message) => {
    try {
      const data = JSON.stringify(JSON.parse(message)); // Parse and stringify to validate JSON
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.type === "register") {
        // Store the player's wallet address
        playerData.address = parsedMessage.address;

        // Notify all clients about the player list update
        broadcastPlayers();
      } else if (parsedMessage.type === "ready") {
        // Update the player's ready status
        playerData.ready = parsedMessage.ready;

        // Notify all clients about the player list update
        broadcastPlayers();
      } else if (parsedMessage.type === "start-game") {
        // Check if all players are ready
        const allPlayersReady = Array.from(connectedPlayers.values()).every(
          (p) => p.data.ready
        );

        if (allPlayersReady) {
          // Notify all clients to start the game
          broadcast(
            JSON.stringify({
              type: "game-starting",
              countdown: 5,
            })
          );
        }
      }
    } catch (error) {
      console.error("Invalid message format:", error);
    }
  });

  // Handle client disconnection
  ws.on("close", () => {
    console.log("Client disconnected:", clientId);
    connectedPlayers.delete(clientId);
    broadcastPlayers();
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    connectedPlayers.delete(clientId);
    broadcastPlayers();
  });

  // Broadcast the updated player list to all clients
  function broadcastPlayers() {
    const players = Array.from(connectedPlayers.values()).map((p) => p.data);
    broadcast(
      JSON.stringify({
        type: "players-update",
        players: players,
      })
    );
  }

  // Broadcast a message to all connected clients
  function broadcast(message) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});

module.exports = server;
