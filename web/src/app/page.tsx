"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Html,
  PerspectiveCamera,
  useTexture,
} from "@react-three/drei";
import {
  Physics,
  useBox,
  useSphere,
  usePlane,
  useCylinder,
} from "@react-three/cannon";
import * as THREE from "three";
import { Wallet } from "lucide-react";

// Game Constants
const GAME_DURATION = 600; // 10 minutes in seconds
const TOWER_RADIUS = 5;
const TOWER_HEIGHT = 50;
const PLATFORM_MIN_HEIGHT = 0.3;
const PLATFORM_MAX_HEIGHT = 0.8;
const CHARACTER_SPEED = 1.0; // Slightly reduced from 1.2
const JUMP_FORCE = 10; // Reduced from 40 for more controlled jumping
const GRAVITY = -9.81;
const PATH_SEGMENT_LENGTH = 4; // Length of path segments
const MAX_JUMP_DISTANCE = 3; // Maximum distance between platforms

// Loading Screen Component
function LoadingScreen() {
  return (
    <Html center>
      <div className="bg-black bg-opacity-75 text-white p-4 rounded">
        <div>Loading game...</div>
      </div>
    </Html>
  );
}

// Camera Controller
function CameraController({ targetPosition }) {
  const { camera } = useThree();

  useFrame(() => {
    if (
      targetPosition &&
      Array.isArray(targetPosition) &&
      targetPosition.length === 3
    ) {
      const [x, y, z] = targetPosition;
      // Only update if we have valid coordinates
      if (x !== undefined && y !== undefined && z !== undefined) {
        camera.position.y = y + 10;
        // Create a proper THREE.Vector3 for lookAt to avoid the isVector3 error
        camera.lookAt(new THREE.Vector3(x, y, z));
      }
    }
  });

  return null;
}

// Character Component with fixed movement
function Character({ position, onRef, keys, canJump }) {
  const { camera } = useThree();
  const [ref, api] = useBox(() => ({
    mass: 1,
    position: position,
    args: [0.5, 1, 0.5], // Box shape for humanoid character
    type: "Dynamic",
    material: {
      friction: 0.1,
      restitution: 0,
    },
    fixedRotation: true, // Prevent character from rotating/rolling
    linearDamping: 0.5, // Increased damping for more precise control
  }));

  // Track jumping state
  const isJumping = useRef(false);
  const isGrounded = useRef(true);
  const lastJumpTime = useRef(0);
  const jumpKeyReleased = useRef(true); // New ref to track if space key was released

  useEffect(() => {
    if (api) {
      onRef(api);
    }
  }, [api, onRef]);

  // Apply movement forces based on pressed keys and camera orientation
  useFrame(() => {
    if (!api) return;

    // Get the camera's forward and right vectors
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Get the right vector by crossing the up vector with the forward vector
    const cameraRight = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection)
      .normalize();

    // Get the forward vector (relative to the XZ plane for side movement)
    const cameraForward = new THREE.Vector3(
      cameraDirection.x,
      0,
      cameraDirection.z
    ).normalize();

    // Calculate the movement direction based on keys pressed
    const movement = new THREE.Vector3(0, 0, 0);

    // Only allow movement if the character is grounded
    if (isGrounded.current) {
      // Fixed: Removed the negation of cameraRight for left/right movement
      if (keys.current.arrowUp || keys.current.keyW) {
        movement.add(cameraForward);
      }
      if (keys.current.arrowDown || keys.current.keyS) {
        movement.sub(cameraForward);
      }
      if (keys.current.arrowRight || keys.current.keyD) {
        movement.add(cameraRight); // Fixed: Changed from sub to add
      }
      if (keys.current.arrowLeft || keys.current.keyA) {
        movement.sub(cameraRight); // Fixed: Changed from add to sub
      }

      // Normalize to prevent diagonal movement from being faster
      if (movement.length() > 0) {
        movement.normalize();
        movement.multiplyScalar(CHARACTER_SPEED);
        // Apply velocity directly with balanced multiplier
        api.velocity.set(movement.x * 10, null, movement.z * 10);
      } else {
        // Only reset horizontal velocity when grounded and not moving
        api.velocity.set(0, null, 0);
      }
    }

    // Handle jumping with proper debouncing
    const currentTime = Date.now();

    // Only allow jump if space key was released and is now pressed
    if (keys.current.space && jumpKeyReleased.current) {
      jumpKeyReleased.current = false;

      if (
        isGrounded.current &&
        !isJumping.current &&
        currentTime - lastJumpTime.current > 350
      ) {
        isJumping.current = true;
        isGrounded.current = false;
        lastJumpTime.current = currentTime;

        // Apply jump velocity while maintaining horizontal movement
        api.velocity.set(null, JUMP_FORCE, null);
      }
    } else if (!keys.current.space) {
      jumpKeyReleased.current = true;
    }
  });

  // Check ground contact and reset jump state
  useEffect(() => {
    // Function to check if grounded based on velocity and position
    const checkGrounded = () => {
      if (api) {
        // Subscribe to velocity to check if falling has stopped
        const unsubscribeVel = api.velocity.subscribe((vel) => {
          // If velocity is near zero or positive, we might be grounded
          if (vel[1] >= -0.1 && vel[1] <= 0.1 && !isGrounded.current) {
            isGrounded.current = true;
            isJumping.current = false;
          } else if (vel[1] < -0.5) {
            // Character is falling
            isGrounded.current = false;
          }
        });

        // Subscribe to position for additional ground checking
        const unsubscribePos = api.position.subscribe((pos) => {
          if (pos[1] <= 0.6) {
            // If very close to ground level
            isGrounded.current = true;
            isJumping.current = false;
          }
        });

        return () => {
          unsubscribeVel();
          unsubscribePos();
        };
      }
    };

    const cleanup = checkGrounded();
    return cleanup;
  }, [api]);

  return (
    <mesh ref={ref} castShadow>
      {/* Body */}
      <boxGeometry args={[0.5, 1, 0.5]} />
      <meshStandardMaterial color="blue" metalness={0.3} roughness={0.7} />

      {/* Head */}
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial color="lightblue" />
      </mesh>
    </mesh>
  );
}

// Platform Base Class
function PlatformBase({ args, position, material, children, ...props }) {
  const [ref] = useBox(() => ({
    args,
    position,
    type: "Static",
    ...props,
  }));

  return (
    <mesh ref={ref} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial {...material} />
      {children}
    </mesh>
  );
}

// Rotating Platform
function RotatingPlatform({ position, rotation, speed = 0.01 }) {
  const [ref, api] = useBox(() => ({
    args: [3, 0.5, 0.5],
    position,
    rotation,
    type: "Kinematic",
  }));

  useFrame((state) => {
    const elapsedTime = state.clock.getElapsedTime();
    api.rotation.set(0, elapsedTime * speed, 0);
  });

  return (
    <mesh ref={ref} castShadow receiveShadow>
      <boxGeometry args={[3, 0.5, 0.5]} />
      <meshStandardMaterial color="#ff6b6b" />
    </mesh>
  );
}

// Disappearing Platform
function DisappearingPlatform({ position, interval = 5, activeTime = 2 }) {
  const [visible, setVisible] = useState(true);
  const [ref, api] = useBox(() => ({
    args: [2, 0.5, 2],
    position,
    type: "Static",
  }));

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((v) => !v);
      api.mass.set(visible ? 0 : 1000);
    }, interval * 1000);

    return () => clearInterval(timer);
  }, [interval, visible, api]);

  return (
    <mesh ref={ref} castShadow receiveShadow visible={visible}>
      <boxGeometry args={[2, 0.5, 2]} />
      <meshStandardMaterial
        color={visible ? "#feca57" : "#ff9f43"}
        transparent
        opacity={visible ? 1 : 0.3}
      />
    </mesh>
  );
}

// Bouncy Platform
function BouncyPlatform({ position }) {
  const [ref] = useBox(() => ({
    args: [3, 0.5, 3],
    position,
    type: "Static",
    material: { restitution: 1.5 },
  }));

  return (
    <mesh ref={ref} castShadow receiveShadow>
      <boxGeometry args={[3, 0.5, 3]} />
      <meshStandardMaterial color="#2ecc71" />
    </mesh>
  );
}

// Path Platform - For creating path segments
function PathPlatform({ start, end, width = 1.5, height = 0.5 }) {
  // Calculate the midpoint and direction
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;
  const midY = (start[1] + end[1]) / 2;

  const length = Math.sqrt(
    Math.pow(end[0] - start[0], 2) + Math.pow(end[2] - start[2], 2)
  );

  // Calculate rotation angle
  const angle = Math.atan2(end[2] - start[2], end[0] - start[0]);

  const [ref] = useBox(() => ({
    args: [length, height, width],
    position: [midX, midY, midZ],
    rotation: [0, angle, 0],
    type: "Static",
  }));

  return (
    <mesh ref={ref} castShadow receiveShadow>
      <boxGeometry args={[length, height, width]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

// Generate Tower with a more walkable path
function generateTowerPath() {
  const platforms = [];
  const pathPoints = [];

  // Start point at the base
  let currentPoint = [0, 1, 0];
  pathPoints.push([...currentPoint]);

  // Define parameters for consistent path generation
  const angleIncrement = Math.PI / 6; // 30 degrees per step
  const heightIncrement = 1.5; // Very gradual vertical increase
  const radiusVariation = 0.8; // Small variation in radius

  let currentAngle = 0;
  let currentRadius = 3;

  // Create a smooth spiral path
  for (let i = 1; i < 18; i++) {
    // Reduced number of iterations for more controlled path
    // Gradually increase height and angle
    const newHeight = currentPoint[1] + heightIncrement;
    currentAngle += angleIncrement;

    // Slight variation in radius for more natural path
    currentRadius = 3 + Math.sin(currentAngle * 2) * radiusVariation;

    // Calculate next position
    const nextX = Math.cos(currentAngle) * currentRadius;
    const nextZ = Math.sin(currentAngle) * currentRadius;
    const nextPoint = [nextX, newHeight, nextZ];

    // Ensure the distance is jumpable
    const distance = Math.sqrt(
      Math.pow(nextPoint[0] - currentPoint[0], 2) +
        Math.pow(nextPoint[1] - currentPoint[1], 2) +
        Math.pow(nextPoint[2] - currentPoint[2], 2)
    );

    // If distance is too large, create an intermediate platform
    if (distance > MAX_JUMP_DISTANCE) {
      const intermX = (currentPoint[0] + nextX) / 2;
      const intermZ = (currentPoint[2] + nextZ) / 2;
      const intermY = currentPoint[1] + heightIncrement / 2;
      const intermPoint = [intermX, intermY, intermZ];

      // Add intermediate path segment
      platforms.push({
        type: "path",
        start: currentPoint,
        end: intermPoint,
      });

      // Add segment from intermediate to next
      platforms.push({
        type: "path",
        start: intermPoint,
        end: nextPoint,
      });

      currentPoint = nextPoint;
      pathPoints.push(intermPoint);
      pathPoints.push(nextPoint);
    } else {
      // Add normal path segment
      platforms.push({
        type: "path",
        start: currentPoint,
        end: nextPoint,
      });

      currentPoint = nextPoint;
      pathPoints.push(nextPoint);
    }

    // Add occasional special platforms
    if (i % 4 === 0) {
      const specialType = ["rotating", "disappearing", "bouncy"][i % 3];
      platforms.push({
        type: specialType,
        position: [nextX, newHeight + 0.5, nextZ],
        rotation: [0, currentAngle, 0],
      });
    }
  }

  return platforms;
}

// Tower Component
function Tower({ platformsData, setMaxHeight }) {
  return (
    <>
      {/* Base Level */}
      <PlatformBase
        args={[20, 1, 20]}
        position={[0, 0, 0]}
        material={{ color: "#333" }}
      />

      {platformsData.map((platform, index) => {
        switch (platform.type) {
          case "path":
            return (
              <PathPlatform
                key={index}
                start={platform.start}
                end={platform.end}
              />
            );
          case "static":
            return (
              <PlatformBase
                key={index}
                args={[2, 0.5, 2]}
                position={platform.position}
                material={{ color: "#888" }}
              />
            );
          case "rotating":
            return (
              <RotatingPlatform
                key={index}
                position={platform.position}
                rotation={platform.rotation}
                speed={0.02}
              />
            );
          case "disappearing":
            return (
              <DisappearingPlatform key={index} position={platform.position} />
            );
          case "bouncy":
            return <BouncyPlatform key={index} position={platform.position} />;
          default:
            return null;
        }
      })}
    </>
  );
}

// Game UI
function UI({ timeLeft, height, maxHeight, gameState, keyState }) {
  // Renders the key state for debugging
  const renderKeyState = () => {
    if (!keyState) return null;

    return (
      <div className="mt-2 text-xs">
        <div>
          Keys:{" "}
          {Object.entries(keyState.current)
            .filter(([_, value]) => value)
            .map(([key]) => key)
            .join(", ")}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed top-0 left-0 p-4 flex flex-col gap-2 z-10">
      <div className="bg-black bg-opacity-75 text-white p-3 rounded">
        <div>
          Time: {Math.floor(timeLeft / 60)}:
          {(timeLeft % 60).toString().padStart(2, "0")}
        </div>
        <div>Height: {height.toFixed(1)}m</div>
        <div>Max Height: {maxHeight.toFixed(1)}m</div>
        <div>State: {gameState.toUpperCase()}</div>
        {renderKeyState()}
      </div>

      <div className="mt-2 bg-black bg-opacity-75 text-white p-3 rounded">
        <div className="text-sm">
          Controls:
          <div className="text-xs mt-1">WASD or Arrow Keys: Move</div>
          <div className="text-xs">Space: Jump (Press once per jump)</div>
          <div className="text-xs mt-1 text-yellow-300">
            Movement is relative to camera view
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Scene for when the game is not active
function SimpleScene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[20, 1, 20]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <OrbitControls makeDefault />
    </>
  );
}

// Main Game Component
export default function ObstacleTowerGame() {
  const [gameState, setGameState] = useState("start"); // 'start', 'playing', 'finish'
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [characterPosition, setCharacterPosition] = useState([0, 2, 0]);
  const [height, setHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [platformsData, setPlatformsData] = useState([]);
  const [walletConnected, setWalletConnected] = useState(false);
  const characterApi = useRef(null);
  const [velocity, setVelocity] = useState([0, 0, 0]);
  const [showDebug, setShowDebug] = useState(true);
  const [error, setError] = useState(null);

  // Track key state with refs (more reliable than state for frequent updates)
  const keys = useRef({
    arrowUp: false,
    arrowDown: false,
    arrowLeft: false,
    arrowRight: false,
    keyW: false,
    keyA: false,
    keyS: false,
    keyD: false,
    space: false,
  });

  // Ref to track if character can jump
  const canJump = useRef(true);

  // Setup keyboard controls
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Prevent default behavior for arrow keys to avoid page scrolling
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(
          event.key
        )
      ) {
        event.preventDefault();
      }

      switch (event.key) {
        case "ArrowUp":
          keys.current.arrowUp = true;
          break;
        case "ArrowDown":
          keys.current.arrowDown = true;
          break;
        case "ArrowLeft":
          keys.current.arrowLeft = true;
          break;
        case "ArrowRight":
          keys.current.arrowRight = true;
          break;
        case "w":
        case "W":
          keys.current.keyW = true;
          break;
        case "a":
        case "A":
          keys.current.keyA = true;
          break;
        case "s":
        case "S":
          keys.current.keyS = true;
          break;
        case "d":
        case "D":
          keys.current.keyD = true;
          break;
        case " ":
          keys.current.space = true;
          break;
      }
    };

    const handleKeyUp = (event) => {
      switch (event.key) {
        case "ArrowUp":
          keys.current.arrowUp = false;
          break;
        case "ArrowDown":
          keys.current.arrowDown = false;
          break;
        case "ArrowLeft":
          keys.current.arrowLeft = false;
          break;
        case "ArrowRight":
          keys.current.arrowRight = false;
          break;
        case "w":
        case "W":
          keys.current.keyW = false;
          break;
        case "a":
        case "A":
          keys.current.keyA = false;
          break;
        case "s":
        case "S":
          keys.current.keyS = false;
          break;
        case "d":
        case "D":
          keys.current.keyD = false;
          break;
        case " ":
          keys.current.space = false;
          break;
      }
    };

    // Add focus to the document body to ensure key events are captured
    document.body.focus();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Game timer
  useEffect(() => {
    if (gameState === "playing" && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);

      return () => clearInterval(timer);
    } else if (timeLeft === 0) {
      setGameState("finish");
      handleGameEnd();
    }
  }, [gameState, timeLeft]);

  // Track character height
  useEffect(() => {
    if (!characterApi.current || gameState !== "playing") return;

    const update = () => {
      try {
        if (characterApi.current) {
          const unsubscribe = characterApi.current.position.subscribe((pos) => {
            if (!pos) return;

            setCharacterPosition(pos);
            setHeight(pos[1]);
            if (pos[1] > maxHeight) {
              setMaxHeight(pos[1]);
            }

            // Reset to ground if fallen
            if (pos[1] < -5) {
              characterApi.current.position.set(0, 2, 0);
              characterApi.current.velocity.set(0, 0, 0);
            }
          });

          return unsubscribe;
        }
      } catch (err) {
        console.error("Error tracking character:", err);
      }
    };

    const unsubscribe = update(); // Call immediately to set up subscription

    // Cleanup
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [gameState, maxHeight, characterApi.current]);

  const startGame = () => {
    try {
      // Reset game state
      setGameState("playing");
      setTimeLeft(GAME_DURATION);
      setMaxHeight(0);
      setHeight(0);
      setCharacterPosition([0, 2, 0]);
      setPlatformsData(generateTowerPath()); // Use new path-based generation
      canJump.current = true;

      // Reset all keys to prevent stuck keys
      Object.keys(keys.current).forEach((key) => {
        keys.current[key] = false;
      });
    } catch (err) {
      console.error("Error starting game:", err);
      setError("Failed to start game. Please refresh the page and try again.");
    }
  };

  const handleGameEnd = async () => {
    try {
      // Placeholder for actual backend integration
      const response = await fetch("/api/submit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          height: maxHeight,
          walletAddress: walletConnected ? "user-wallet-address" : null,
        }),
      });
    } catch (error) {
      console.error("Failed to submit score:", error);
    }
  };

  const connectWallet = () => {
    // Placeholder for Abstract wallet integration
    setWalletConnected(true);
  };

  // Display any errors
  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-red-900 p-6 rounded-lg text-white max-w-md">
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-white text-red-900 px-4 py-2 rounded hover:bg-gray-200"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative">
      <UI
        timeLeft={timeLeft}
        height={height}
        maxHeight={maxHeight}
        gameState={gameState}
        keyState={showDebug ? keys : null}
      />

      {gameState === "start" && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-black bg-opacity-90 p-8 rounded-lg text-white max-w-md">
            <h1 className="text-3xl font-bold mb-4">Obstacle Tower</h1>
            <p className="mb-4">
              Climb as high as you can within 10 minutes! Use arrow keys or WASD
              to move, and SPACE to jump.
            </p>
            <div className="flex flex-col gap-4">
              <button
                onClick={startGame}
                className="bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-lg font-bold"
              >
                Start Game
              </button>
              {!walletConnected && (
                <button
                  onClick={connectWallet}
                  className="bg-purple-500 hover:bg-purple-600 px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2"
                >
                  <Wallet size={24} />
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {gameState === "finish" && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-black bg-opacity-90 p-8 rounded-lg text-white">
            <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
            <p className="mb-4">Your maximum height: {maxHeight.toFixed(1)}m</p>
            <button
              onClick={startGame}
              className="bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-lg font-bold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      <Canvas shadows>
        <Suspense fallback={<LoadingScreen />}>
          <PerspectiveCamera makeDefault position={[0, 10, 20]} fov={60} />

          {gameState === "playing" ? (
            <>
              <CameraController targetPosition={characterPosition} />
              <ambientLight intensity={0.5} />
              <directionalLight
                position={[10, 20, 10]}
                intensity={1}
                castShadow
              />

              <Physics gravity={[0, GRAVITY, 0]}>
                <Character
                  position={characterPosition}
                  keys={keys}
                  canJump={canJump}
                  onRef={(api) => {
                    characterApi.current = api;
                  }}
                />
                <Tower
                  platformsData={platformsData}
                  setMaxHeight={setMaxHeight}
                />
              </Physics>

              <OrbitControls
                makeDefault
                minPolarAngle={Math.PI / 6}
                maxPolarAngle={Math.PI / 2}
                minDistance={10}
                maxDistance={50}
              />
            </>
          ) : (
            <SimpleScene />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}
