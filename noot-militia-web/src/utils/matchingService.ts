import { EventEmitter } from "events";
import { io, Socket } from "socket.io-client";

interface Player {
  id: string;
  address: string;
  ready: boolean;
}

interface LobbyUpdate {
  lobbyId: string;
  players: Player[];
  state: string;
}

class MatchingService extends EventEmitter {
  private socket: Socket | null = null;
  private players: Player[] = [];
  private lobbyId: string | null = null;
  private connected = false;

  constructor() {
    super();
  }

  connect(address: string) {
    // Close existing connection if any
    if (this.socket) {
      this.disconnect();
    }

    try {
      // Connect to Socket.IO server - adjust URL based on your deployment
      const serverUrl =
        process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
      this.socket = io(serverUrl);

      // Handle connection
      this.socket.on("connect", () => {
        console.log("Connected to matching server");
        this.connected = true;

        // Join the matching system with the player's wallet address
        this.socket.emit("join-matching", { address });

        this.emit("connected");
      });

      // Handle successful join
      this.socket.on(
        "matching-joined",
        (data: {
          success: boolean;
          lobbyId: string;
          players: Player[];
          state: string;
        }) => {
          if (data.success) {
            this.lobbyId = data.lobbyId;
            this.players = data.players;
            this.emit("joined", this.lobbyId);
            this.emit("players-updated", this.players);
          }
        }
      );

      // Handle lobby updates
      this.socket.on("lobby-update", (update: LobbyUpdate) => {
        this.players = update.players;
        this.emit("players-updated", this.players);
      });

      // Handle game countdown
      this.socket.on("game-countdown", (data: { countdown: number }) => {
        this.emit("countdown", data.countdown);
      });

      // Handle countdown cancellation
      this.socket.on("countdown-cancelled", () => {
        this.emit("countdown-cancelled");
      });

      // Handle game start
      this.socket.on("game-start", (gameData: any) => {
        this.emit("game-starting", gameData);
      });

      // Handle navigation to game
      this.socket.on("navigate-to-game", () => {
        this.emit("navigate-to-game");
      });

      // Handle disconnection
      this.socket.on("disconnect", () => {
        this.connected = false;
        this.emit("disconnected");
      });
    } catch (error) {
      console.error("Error connecting to matching server:", error);
      this.emit("error", error);
    }
  }

  disconnect() {
    if (this.socket) {
      // Leave the matching system before disconnecting
      if (this.connected) {
        this.socket.emit("leave-matching");
      }

      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  setReady(isReady: boolean) {
    if (this.socket && this.connected) {
      this.socket.emit("player-ready", { ready: isReady });
    } else {
      console.warn("Cannot set ready state, not connected to server");
    }
  }

  startGame() {
    if (this.socket && this.connected) {
      this.socket.emit("start-game");
    } else {
      console.warn("Cannot start game, not connected to server");
    }
  }

  getPlayers() {
    return this.players;
  }

  getLobbyId() {
    return this.lobbyId;
  }

  isConnected() {
    return this.connected;
  }
}

// Create a singleton instance
const matchingService = new MatchingService();

export default matchingService;
