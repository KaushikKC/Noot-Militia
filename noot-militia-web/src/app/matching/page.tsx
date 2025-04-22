"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import matchingService from "@/utils/matchingService";

interface Player {
  id: number;
  address: string;
  ready: boolean;
  timestamp: number;
}

export default function MatchingPage() {
  const router = useRouter();
  const { authenticated, user: privyUser } = usePrivy();
  const { address } = useAccount();

  // States for matching and players
  const [isJoining, setIsJoining] = useState(true);
  const [hasJoined, setHasJoined] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [gameStarting, setGameStarting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [connectionError, setConnectionError] = useState(false);

  // Connect to the matching service when the component mounts
  useEffect(() => {
    if (!authenticated || !address) {
      // Redirect to home if not authenticated
      router.push("/");
      return;
    }

    // Show joining state
    setIsJoining(true);

    // Set up matching service event listeners
    matchingService.on("connected", handleConnected);
    matchingService.on("joined", handleJoined);
    matchingService.on("disconnected", handleDisconnected);
    matchingService.on("players-updated", handlePlayersUpdated);
    matchingService.on("countdown", handleCountdown);
    matchingService.on("countdown-cancelled", handleCountdownCancelled);
    matchingService.on("game-starting", handleGameStarting);
    matchingService.on("navigate-to-game", handleNavigateToGame);
    matchingService.on("error", handleError);

    // Connect to the matching service
    matchingService.connect(address);

    // Clean up event listeners when the component unmounts
    return () => {
      matchingService.removeListener("connected", handleConnected);
      matchingService.removeListener("joined", handleJoined);
      matchingService.removeListener("disconnected", handleDisconnected);
      matchingService.removeListener("players-updated", handlePlayersUpdated);
      matchingService.removeListener("countdown", handleCountdown);
      matchingService.removeListener(
        "countdown-cancelled",
        handleCountdownCancelled
      );
      matchingService.removeListener("game-starting", handleGameStarting);
      matchingService.removeListener("navigate-to-game", handleNavigateToGame);
      matchingService.removeListener("error", handleError);
      matchingService.disconnect();
    };
  }, [authenticated, address, router]);

  // Handler functions for matching service events
  const handleConnected = () => {
    setConnectionError(false);
  };

  const handleJoined = (lobbyId: string) => {
    setLobbyId(lobbyId);
    setIsJoining(false);
    setHasJoined(true);
    console.log(`Joined lobby: ${lobbyId}`);
  };

  const handleDisconnected = () => {
    // We could show a reconnecting message
    console.log("Disconnected from matching server");
  };

  const handlePlayersUpdated = (updatedPlayers: Player[]) => {
    setPlayers(updatedPlayers);

    // Update our ready state if it changed on the server
    const currentPlayer = updatedPlayers.find((p) => p.address === address);
    if (currentPlayer && currentPlayer.ready !== isReady) {
      setIsReady(currentPlayer.ready);
    }
  };

  const handleCountdown = (seconds: number) => {
    setGameStarting(true);
    setCountdown(seconds);
  };

  const handleCountdownCancelled = () => {
    setGameStarting(false);
    setCountdown(0);
  };

  const handleGameStarting = (gameData: any) => {
    console.log("Game starting with data:", gameData);

    // Store the game data in sessionStorage so the game page can access it
    try {
      sessionStorage.setItem("nootGameData", JSON.stringify(gameData));
    } catch (err) {
      console.error("Error storing game data:", err);
    }
  };

  const handleNavigateToGame = () => {
    // Navigate to the game page after a short delay to ensure data is stored
    setTimeout(() => {
      router.push("/game");
    }, 100);
  };

  const handleError = (error: any) => {
    console.error("Matching service error:", error);
    setConnectionError(true);
  };

  // Handle player ready status
  const handleToggleReady = () => {
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    matchingService.setReady(newReadyState);
  };

  // Handle starting the game
  const handleStartGame = () => {
    matchingService.startGame();
  };

  // Check if all players are ready
  const allPlayersReady =
    players.length >= 2 && players.every((player) => player.ready);

  // Generate random positions for the background particles
  const generateRandomPosition = () => {
    return {
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 10,
    };
  };

  // Create background particles
  const particles = Array.from({ length: 50 }, generateRandomPosition);

  return (
    <div className="h-screen w-full bg-gray-900 overflow-hidden relative">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <Image
          src="/game-bg.webp"
          alt="Game Background"
          fill
          style={{ objectFit: "cover" }}
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Floating particles */}
      {particles.map((particle, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full bg-green-500/30"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
          }}
          animate={{
            opacity: [0.2, 0.7, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 flex justify-center">
        <motion.div
          className="text-4xl font-bold text-green-500"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          NOOT MILITIA - PLAYER MATCHING
        </motion.div>
      </div>

      {/* Current player info */}
      <div className="absolute top-6 right-6 z-50">
        <motion.div
          className="px-4 py-2 rounded-lg bg-green-700 text-white flex items-center"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="max-w-[150px] truncate">
            {address
              ? `${address.slice(0, 6)}...${address.slice(-4)}`
              : "Connected"}
          </span>
        </motion.div>
      </div>

      {/* Connection status indicator */}
      <div className="absolute top-6 left-6 z-50">
        <motion.div
          className={`px-4 py-2 rounded-lg flex items-center ${
            connectionError
              ? "bg-red-700 text-white"
              : hasJoined
              ? "bg-green-700 text-white"
              : "bg-yellow-700 text-white"
          }`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className={`w-3 h-3 rounded-full mr-2 ${
              connectionError
                ? "bg-red-400"
                : hasJoined
                ? "bg-green-400"
                : "bg-yellow-400"
            }`}
          />
          <span>
            {connectionError
              ? "Connection Error"
              : isJoining
              ? "Connecting..."
              : "Connected"}
          </span>
        </motion.div>
      </div>

      {/* Main content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
        {/* Joining status */}
        {isJoining && (
          <motion.div
            className="bg-gray-800/70 rounded-lg p-8 max-w-md w-full text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex justify-center mb-4">
              <motion.div
                className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <h2 className="text-2xl font-bold text-green-400 mb-2">
              Joining Match...
            </h2>
            <p className="text-gray-300">
              Connecting to game servers and validating wallet...
            </p>

            {connectionError && (
              <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-white">
                <p className="font-bold mb-1">Connection Error</p>
                <p className="text-sm">
                  Could not connect to the matching server. Please check your
                  connection and try again.
                </p>
                <button
                  className="mt-3 px-4 py-2 bg-red-700 rounded-md hover:bg-red-600 transition-colors"
                  onClick={() => {
                    setConnectionError(false);
                    matchingService.connect(address || "");
                  }}
                >
                  Retry Connection
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Matchmaking lobby */}
        {hasJoined && (
          <motion.div
            className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-6 max-w-2xl w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-2xl font-bold text-green-400 mb-4 text-center">
              {gameStarting
                ? `Game Starting in ${countdown}...`
                : "Players Lobby"}
            </h2>

            {/* Players list */}
            <div className="mb-6 overflow-y-auto max-h-72">
              <div className="grid grid-cols-2 gap-4">
                {players.map((player, index) => (
                  <motion.div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      player.address === address
                        ? "bg-green-800/60 border border-green-500"
                        : "bg-gray-700/60"
                    }`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center mr-3">
                        <span className="text-gray-300 font-bold">
                          {index + 1}
                        </span>
                      </div>
                      <span className="text-white font-medium">
                        {player.address.slice(0, 6)}...
                        {player.address.slice(-4)}
                      </span>
                    </div>
                    <div
                      className={`w-3 h-3 rounded-full ${
                        player.ready ? "bg-green-500" : "bg-gray-500"
                      }`}
                    />
                  </motion.div>
                ))}

                {players.length < 1 && (
                  <motion.div
                    className="flex items-center justify-center p-3 rounded-lg bg-gray-700/30 border border-dashed border-gray-500 col-span-2"
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <span className="text-gray-400">
                      Waiting for other players to join...
                    </span>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Status and actions */}
            <div className="flex flex-col items-center">
              {gameStarting ? (
                <div className="text-center">
                  <motion.div
                    className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                  <p className="text-green-400 mb-2">
                    Initializing game environment...
                  </p>
                  <p className="text-gray-300 text-sm">
                    This may take a few seconds
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-4">
                    <p className="text-gray-300 mb-1">
                      {players.length < 2
                        ? "Open this page in another browser or device to see other players join"
                        : isReady
                        ? "You are ready! Waiting for others..."
                        : "Click Ready when you're prepared to start"}
                    </p>
                    <p className="text-white text-sm">
                      <span className="text-green-400 font-bold">
                        {players.filter((p) => p.ready).length}
                      </span>{" "}
                      of{" "}
                      <span className="text-green-400 font-bold">
                        {players.length}
                      </span>{" "}
                      players ready
                    </p>
                  </div>

                  <div className="flex space-x-4">
                    <motion.button
                      className={`px-5 py-3 rounded-lg ${
                        isReady ? "bg-yellow-600" : "bg-green-600"
                      } text-white font-bold`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleToggleReady}
                    >
                      {isReady ? "Not Ready" : "Ready"}
                    </motion.button>

                    <motion.button
                      className={`px-5 py-3 rounded-lg ${
                        allPlayersReady && isReady
                          ? "bg-blue-600"
                          : "bg-gray-600 cursor-not-allowed"
                      } text-white font-bold`}
                      whileHover={
                        allPlayersReady && isReady ? { scale: 1.05 } : {}
                      }
                      whileTap={
                        allPlayersReady && isReady ? { scale: 0.95 } : {}
                      }
                      onClick={
                        allPlayersReady && isReady ? handleStartGame : undefined
                      }
                      disabled={!allPlayersReady || !isReady}
                    >
                      Start Game
                    </motion.button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Back button */}
      <div className="absolute bottom-6 left-6">
        <motion.button
          className="px-4 py-2 rounded-lg bg-gray-700 text-white flex items-center"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push("/")}
          disabled={gameStarting}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" className="mr-2">
            <path
              d="M19 12H5M5 12L12 19M5 12L12 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Home
        </motion.button>
      </div>
    </div>
  );
}
