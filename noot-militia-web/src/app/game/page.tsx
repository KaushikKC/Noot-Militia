"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import Image from "next/image";
import Game from "@/components/Game";

interface GamePlayerData {
  id: string;
  address: string;
  spawnPointIndex: number;
}

function GamePage() {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const { address } = useAccount();

  const [isLoading, setIsLoading] = useState(true);
  const [gameData, setGameData] = useState<{
    players: GamePlayerData[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is authenticated
    if (!authenticated || !address) {
      router.push("/");
      return;
    }

    // Try to get game data from sessionStorage (set during the matching process)
    try {
      const storedGameData = sessionStorage.getItem("nootGameData");
      if (storedGameData) {
        const parsedData = JSON.parse(storedGameData);
        setGameData(parsedData);
        // Clear the data after retrieving it to prevent stale data on refresh
        sessionStorage.removeItem("nootGameData");
      } else {
        // If no data was passed from matching, we'll initialize with default data
        // This handles direct navigation to /game or page refreshes
        setGameData({
          players: [
            {
              id: "local-player",
              address: address as string,
              spawnPointIndex: 0,
            },
          ],
        });
      }
    } catch (err) {
      console.error("Error parsing game data:", err);
      setError("Failed to load game data. Please return to the main menu.");
    }

    // Simulate a brief loading screen for better UX
    const loadingTimer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(loadingTimer);
  }, [authenticated, address, router]);

  // If there's an error, show error screen
  if (error) {
    return (
      <div className="h-screen w-full bg-gray-900 flex flex-col items-center justify-center">
        <div className="bg-red-900/60 p-6 rounded-lg max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Error</h2>
          <p className="text-white mb-6">{error}</p>
          <button
            className="px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-600"
            onClick={() => router.push("/")}
          >
            Return to Main Menu
          </button>
        </div>
      </div>
    );
  }

  // If still loading, show loading screen
  if (isLoading || !gameData) {
    return (
      <div className="h-screen w-full bg-gray-900 flex flex-col items-center justify-center">
        <div className="absolute inset-0">
          <Image
            src="/game-bg.webp"
            alt="Game Background"
            fill
            style={{ objectFit: "cover" }}
            priority
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <motion.div
          className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full mb-6 z-10"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />

        <h2 className="text-3xl font-bold text-green-500 mb-2 z-10">
          Initializing Game
        </h2>
        <p className="text-green-300 z-10">Preparing battlefield...</p>
      </div>
    );
  }

  // Game loaded - render the actual game component with the data
  return (
    <div className="h-screen w-full overflow-hidden">
      <Game gameData={gameData} />
    </div>
  );
}

export default GamePage;
