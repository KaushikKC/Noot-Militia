"use client";

import { useEffect, useRef, useState } from "react";
import * as PhaserNamespace from "phaser";
const Phaser = PhaserNamespace;
import io from "socket.io-client";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

function safeGetData(object: any, key: string, defaultValue: any = null) {
  if (!object || !object.getData) return defaultValue;
  try {
    const value = object.getData(key);
    return value !== undefined ? value : defaultValue;
  } catch (e) {
    console.error(`Error getting data ${key}:`, e);
    return defaultValue;
  }
}

export default function Game({ gameData }: { gameData: any }) {
  const gameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const router = useRouter();
  const { authenticated } = usePrivy();

  // Check if user is authenticated, if not redirect to home
  useEffect(() => {
    if (!authenticated) {
      router.push("/");
    }

    // Listen for ESC key to return to the matching page
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        router.push("/matching");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [authenticated, router]);

  useEffect(() => {
    if (gameData && gameData.players) {
      console.log("Game initialized with player data:", gameData);
      // Initialize game with the player data
      // ...
    }
  }, [gameData]);

  useEffect(() => {
    if (!gameRef.current) return;

    // Variables to store game objects
    let platforms: Phaser.Physics.Arcade.StaticGroup;
    let player: Phaser.Physics.Arcade.Sprite | null = null;
    let bullets: Phaser.Physics.Arcade.Group;
    let cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    let spaceKey: Phaser.Input.Keyboard.Key;
    let game: Phaser.Game;
    let lastFired = 0; // Timestamp of last bullet fired
    // Add this with your other variables
    let bulletOwners = new Map(); // Map to track bullet owners separately from Phaser's data system
    let rocks: Phaser.Physics.Arcade.StaticGroup;
    let killCount = 0;
    let killCountText: Phaser.GameObjects.Text;

    // Multiplayer variables
    let socket: any;
    let otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite>;
    let prevX: number;
    let prevY: number;
    let prevFlipX: boolean;

    // Player health system
    let playerHealth = 10; // Player starts with 10 health
    let healthText: Phaser.GameObjects.Text;
    let deathMessageText: Phaser.GameObjects.Text;
    let respawnCooldown = false;
    let invulnerable = false; // Invulnerability after respawning
    let invulnerabilityTimer: Phaser.Time.TimerEvent;
    let allBullets: {
      bullet: Phaser.Physics.Arcade.Sprite;
      ownerId: string;
    }[] = [];

    let playerKills = new Map<string, number>(); // Map to track kills for each player
    let leaderboardText: Phaser.GameObjects.Text;
    let showLeaderboard = false;
    let leaderboardKey: Phaser.Input.Keyboard.Key;

    // Game world configuration
    const WORLD_WIDTH = 3200; // Much wider world
    const WORLD_HEIGHT = 800; // Taller world
    const GROUND_HEIGHT = 64;

    // Spawn points for multiplayer
    const SPAWN_POINTS = [
      { x: 200, y: WORLD_HEIGHT - GROUND_HEIGHT - 50 }, // Left side spawn
      { x: WORLD_WIDTH - 200, y: WORLD_HEIGHT - GROUND_HEIGHT - 50 }, // Right side spawn
    ];

    // Handle responsive canvas sizing
    const updateDimensions = () => {
      if (game) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        game.scale.resize(width, height);
      }
    };

    // Function to create the ground based on world dimensions
    function createGround(scene: Phaser.Scene) {
      if (!platforms) return;

      // Calculate how many ground tiles we need based on the world width
      const tilesNeeded = Math.ceil(WORLD_WIDTH / 64) + 4;

      // Create the ground as a series of tiles at the bottom of the world
      for (let i = 0; i < tilesNeeded; i++) {
        platforms
          .create(i * 64, WORLD_HEIGHT, "ground")
          .setOrigin(0, 1)
          .refreshBody(); // Set origin to bottom-left for proper alignment
      }

      // Add some platforms throughout the world for more interesting gameplay
      // Left side platforms - reduced height by 30
      // Left side platforms - reduced height by 30
      platforms
        .create(300, WORLD_HEIGHT - 150, "ground") // Was 120, now 150 (30 higher)
        .setScale(3, 0.5)
        .refreshBody();
      platforms
        .create(500, WORLD_HEIGHT - 280, "ground") // Was 200, now 230 (30 higher)
        .setScale(2, 0.5)
        .refreshBody();

      // Middle platforms - reduced height by 30
      platforms
        .create(WORLD_WIDTH / 2 - 150, WORLD_HEIGHT - 150, "ground") // Was 120, now 150 (30 higher)
        .setScale(4, 0.5)
        .refreshBody();
      platforms
        .create(WORLD_WIDTH / 2 + 80, WORLD_HEIGHT - 280, "ground") // Was 200, now 230 (30 higher)
        .setScale(3, 0.5)
        .refreshBody();

      // Right side platforms - reduced height by 30
      platforms
        .create(WORLD_WIDTH - 300, WORLD_HEIGHT - 150, "ground") // Was 120, now 150 (30 higher)
        .setScale(3, 0.5)
        .refreshBody();
      platforms
        .create(WORLD_WIDTH - 500, WORLD_HEIGHT - 280, "ground") // Was 200, now 230 (30 higher)
        .setScale(2, 0.5)
        .refreshBody();

      // Add rocks on platforms for cover
      createRocks(scene);
    }

    function setupRockCollisions(scene: Phaser.Scene) {
      if (!rocks || !player) {
        console.log("Cannot setup rock collisions - missing rocks or player");
        return;
      }

      // Remove any existing colliders between player and rocks to prevent duplicates
      scene.physics.world.colliders
        .getActive()
        .filter(
          (collider) =>
            (collider.object1 === player && collider.object2 === rocks) ||
            (collider.object1 === rocks && collider.object2 === player)
        )
        .forEach((collider) => collider.destroy());

      console.log("Setting up rock collisions with player");

      // Create a custom collision handler that checks if the player is jumping
      scene.physics.add.collider(player, rocks, (playerObj, rockObj) => {
        // Skip collision processing if player is invulnerable
        if (invulnerable) {
          return false;
        }

        const player = playerObj as Phaser.Physics.Arcade.Sprite;

        // If player is coming from above the rock (jumping/falling onto it)
        if (player.body.velocity.y >= 0 && player.body.touching.down) {
          return true; // Allow landing on top of rocks
        }

        // If player is jumping upward, let them pass through the bottom of rocks
        if (player.body.velocity.y < -100 && player.body.touching.up) {
          return false; // Let them pass through from below
        }

        // In all other cases (horizontal collision), block the player
        return true;
      });

      // Similar collision handling for other players
      if (otherPlayers && otherPlayers.size > 0) {
        // First remove any existing colliders
        otherPlayers.forEach((otherPlayer) => {
          scene.physics.world.colliders
            .getActive()
            .filter(
              (collider) =>
                (collider.object1 === otherPlayer &&
                  collider.object2 === rocks) ||
                (collider.object1 === rocks && collider.object2 === otherPlayer)
            )
            .forEach((collider) => collider.destroy());

          // Now add the proper collider
          scene.physics.add.collider(
            otherPlayer,
            rocks,
            (playerObj, rockObj) => {
              const player = playerObj as Phaser.Physics.Arcade.Sprite;

              // Same logic for other players
              if (player.body.velocity.y >= 0 && player.body.touching.down) {
                return true; // Allow landing on top
              }

              if (player.body.velocity.y < -100 && player.body.touching.up) {
                return false; // Allow passing from below when jumping
              }

              return true; // Block horizontal movement
            }
          );
        });
      }
    }

    function createRocks(scene: Phaser.Scene) {
      // Create the rocks group (needs to be defined at the top with other game objects)
      if (!rocks) {
        rocks = scene.physics.add.staticGroup();
      }

      // Add rocks on left platforms
      createRock(scene, 250, WORLD_HEIGHT - 180, 1.2); // Was 150, now 180 (30 higher)
      createRock(scene, 350, WORLD_HEIGHT - 180, 1); // Was 150, now 180 (30 higher)
      createRock(scene, 500, WORLD_HEIGHT - 310, 1.3); // Was 230, now 260 (30 higher)

      // Add rocks on middle platforms
      createRock(scene, WORLD_WIDTH / 2 - 200, WORLD_HEIGHT - 180, 1.4); // Was 150, now 180 (30 higher)
      createRock(scene, WORLD_WIDTH / 2 - 50, WORLD_HEIGHT - 180, 1); // Was 150, now 180 (30 higher)
      createRock(scene, WORLD_WIDTH / 2 + 30, WORLD_HEIGHT - 310, 1.2); // Was 230, now 260 (30 higher)
      createRock(scene, WORLD_WIDTH / 2 + 100, WORLD_HEIGHT - 310, 1); // Was 230, now 260 (30 higher)

      // Add rocks on right platforms
      createRock(scene, WORLD_WIDTH - 350, WORLD_HEIGHT - 180, 1.1); // Was 150, now 180 (30 higher)
      createRock(scene, WORLD_WIDTH - 250, WORLD_HEIGHT - 180, 1.3); // Was 150, now 180 (30 higher)
      createRock(scene, WORLD_WIDTH - 480, WORLD_HEIGHT - 310, 1.2); // Was 230, now 260 (30 higher)

      setupRockCollisions(scene);

      // Also add collision between player and rocks
      if (player) {
        scene.physics.add.collider(player, rocks);
      }

      // Add collision between other players and rocks
      if (otherPlayers) {
        otherPlayers.forEach((otherPlayer) => {
          scene.physics.add.collider(otherPlayer, rocks);
        });
      }
    }

    // Helper function to create a rock with given parameters
    function createRock(
      scene: Phaser.Scene,
      x: number,
      y: number,
      scale: number = 1
    ) {
      // Create the rock with proper body size and offset
      const rock = rocks.create(x, y, "rock");
      rock.setScale(scale);

      // Important: Adjust the hitbox size to better match the rock's visible area
      // The default hitbox might be too small or imprecisely positioned
      const hitboxWidth = rock.width * 0.8; // 80% of the texture width
      const hitboxHeight = rock.height * 0.9; // 90% of the texture height

      // Set the body size and offset it to align with the visible rock
      rock.body.setSize(hitboxWidth, hitboxHeight);
      rock.body.setOffset(
        (rock.width - hitboxWidth) / 2,
        (rock.height - hitboxHeight) / 2
      );

      // Make sure the rock is immovable
      rock.body.immovable = true;

      // Refreshes the physics body to apply our changes
      rock.refreshBody();

      return rock;
    }

    function bulletHitRock(
      bullet: Phaser.Physics.Arcade.Sprite,
      rock: Phaser.Physics.Arcade.Sprite
    ) {
      // Create impact effect
      const scene = game.scene.scenes[0];
      const impact = scene.add.circle(bullet.x, bullet.y, 5, 0x888888, 0.8);
      scene.tweens.add({
        targets: impact,
        scale: 2,
        alpha: 0,
        duration: 200,
        onComplete: () => impact.destroy(),
      });

      // Add some dust particles for effect
      const particles = scene.add.particles(bullet.x, bullet.y, "rock", {
        speed: 50,
        scale: { start: 0.1, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 500,
        blendMode: "ADD",
        quantity: 5,
      });

      // Auto-destroy the particle emitter after it's done
      scene.time.delayedCall(500, () => {
        particles.destroy();
      });

      // Destroy the bullet and its effects
      const emitter = bullet.getData("emitter");
      if (emitter) {
        emitter.destroy();
      }

      // Remove from our custom tracking
      bulletOwners.delete(bullet);

      // Destroy the bullet
      bullet.destroy();
    }

    // Function to spawn player at a specific spawn point
    function spawnPlayer(scene: Phaser.Scene, spawnPointIndex: number = 0) {
      // Check if the scene is still active
      if (!scene.scene.isActive()) {
        console.log("Scene is not active, cannot spawn player");
        return;
      }

      // Reset player health
      playerHealth = 10;
      console.log("SPAWN: Reset health to 10");

      // Update the health display
      if (healthText) {
        healthText.setText(`Health: ${playerHealth}`);
      }

      respawnCooldown = false;

      // Make player invulnerable briefly after respawn
      invulnerable = true;
      console.log("CLIENT: Player now invulnerable after spawn");
      if (invulnerabilityTimer) {
        invulnerabilityTimer.remove();
      }

      invulnerabilityTimer = scene.time.delayedCall(3000, () => {
        invulnerable = false;
        console.log("CLIENT: Player invulnerability ended");
        if (player) {
          player.clearAlpha(); // Reset alpha to normal
        }
      });

      // Get spawn point
      const spawnPoint = SPAWN_POINTS[spawnPointIndex % SPAWN_POINTS.length];

      if (!player) {
        try {
          console.log("Creating new player at", spawnPoint.x, spawnPoint.y);

          const texture = Math.random() > 0.5 ? "player" : "noot";
          // Create player sprite at the specified spawn point
          player = scene.physics.add
            .sprite(spawnPoint.x, spawnPoint.y, "noot")
            .setScale(1.0);
          // .setOrigin(0.5, 0.1);

          // Set player properties
          player.setBounce(0.1);
          player.setCollideWorldBounds(true);
          player.setData("health", playerHealth);

          // Make player flash to indicate invulnerability
          scene.tweens.add({
            targets: player,
            alpha: 0.5,
            duration: 200,
            ease: "Linear",
            repeat: 14, // 15 flashes over 3 seconds
            yoyo: true,
          });

          // Enable physics collision between player and platforms
          if (platforms) {
            scene.physics.add.collider(player, platforms);
          }

          createRocks(scene);

          // Make camera follow the player
          scene.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
          scene.cameras.main.startFollow(player, true, 0.08, 0.08);
          scene.cameras.main.setZoom(1); // Adjust zoom level as needed

          // Store initial position for movement detection
          prevX = player.x;
          prevY = player.y;
          prevFlipX = player.flipX;

          // Initialize socket connection if not already done
          // We do this after player is created to ensure everything is ready
          if (!socket) {
            // Use a small delay to ensure everything is initialized
            scene.time.delayedCall(500, () => {
              initializeMultiplayer(scene);
            });
          }
        } catch (error) {
          console.error("Error spawning player:", error);
        }
      } else {
        // Respawn existing player at the specified spawn point
        console.log(
          "Respawning existing player at",
          spawnPoint.x,
          spawnPoint.y
        );
        player.setVisible(true);
        player.setPosition(spawnPoint.x, spawnPoint.y);
        player.setVelocity(0, 0);
        player.setData("health", playerHealth);
        player.body.enable = true;

        player = scene.physics.add
          .sprite(
            spawnPoint.x,
            spawnPoint.y,
            "noot" // Make sure this matches your base texture key
          )
          .setScale(1.0);

        // Set up animations
        player.anims.play("noot_idle");

        // Make player flash to indicate invulnerability
        scene.tweens.add({
          targets: player,
          alpha: 0.5,
          duration: 200,
          ease: "Linear",
          repeat: 14, // 15 flashes over 3 seconds
          yoyo: true,
        });
      }

      // Reset respawn cooldown
      respawnCooldown = false;
    }

    // Function to initialize multiplayer
    function initializeMultiplayer(scene: Phaser.Scene) {
      // Initialize map for other players
      otherPlayers = new Map();

      // Connect to the server
      socket = io("http://localhost:4000"); // Replace with your server URL if different

      // Handle current players data
      socket.on("currentPlayers", (players: any) => {
        // Only process if the scene is still active
        if (!scene.scene.isActive()) return;

        Object.keys(players).forEach((id) => {
          if (id === socket.id) {
            // Handle our own player data - update health if server sent it
            if (
              players[id].health !== undefined &&
              playerHealth !== players[id].health
            ) {
              playerHealth = players[id].health;
              if (healthText) {
                healthText.setText(`Health: ${playerHealth}`);
              }
            }

            // Check if player is marked as dead on server
            if (players[id].isDead && !respawnCooldown && player) {
              respawnCooldown = true;
              playerDied(scene);
            }
          } else {
            // Add other existing players
            addOtherPlayer(scene, players[id]);
          }
        });
      });

      // Handle new player joining
      socket.on("newPlayer", (playerInfo: any) => {
        // Only process if the scene is still active
        if (!scene.scene.isActive()) return;

        addOtherPlayer(scene, playerInfo);
      });

      // Handle player movement updates
      socket.on("playerMoved", (playerInfo: any) => {
        // Only process if the scene is still active
        if (!scene.scene.isActive()) return;

        const otherPlayer = otherPlayers.get(playerInfo.playerId);
        if (otherPlayer) {
          // Get the current position
          const currentY = playerInfo.y;

          // Validate Y position - prevent player from going below ground
          let validY = currentY;

          // If position is below ground level, correct it
          if (validY > WORLD_HEIGHT - GROUND_HEIGHT) {
            validY = WORLD_HEIGHT - GROUND_HEIGHT - 0; // Keep slightly above ground
            console.log(
              `Correcting player ${playerInfo.playerId} Y position from ${currentY} to ${validY}`
            );
          }

          // Update player position with validated coordinates
          otherPlayer.setPosition(playerInfo.x, validY);
          otherPlayer.setFlipX(playerInfo.flipX);

          // If the player is on a platform, make sure they stay on it
          // This handles the case where players should be on platforms at different heights
          const platformCollider = scene.physics.world.colliders
            .getActive()
            .find(
              (collider) =>
                (collider.object1 === otherPlayer &&
                  collider.object2 === platforms) ||
                (collider.object1 === platforms &&
                  collider.object2 === otherPlayer)
            );

          if (platformCollider) {
            // Make sure physics properly updates to handle platform collisions
            otherPlayer.body.updateFromGameObject();
          }

          // Update health if provided
          if (playerInfo.health !== undefined) {
            otherPlayer.setData("health", playerInfo.health);
          }

          // Update visibility based on death state
          if (playerInfo.isDead !== undefined) {
            otherPlayer.setVisible(!playerInfo.isDead);
          }

          // Add physics colliders if they don't exist
          // This ensures players always have proper physics interactions
          if (
            !scene.physics.world.colliders
              .getActive()
              .some(
                (collider) =>
                  (collider.object1 === otherPlayer &&
                    collider.object2 === platforms) ||
                  (collider.object1 === platforms &&
                    collider.object2 === otherPlayer)
              )
          ) {
            scene.physics.add.collider(otherPlayer, platforms);
          }

          // Make sure rock collisions are set up
          if (
            rocks &&
            !scene.physics.world.colliders
              .getActive()
              .some(
                (collider) =>
                  (collider.object1 === otherPlayer &&
                    collider.object2 === rocks) ||
                  (collider.object1 === rocks &&
                    collider.object2 === otherPlayer)
              )
          ) {
            scene.physics.add.collider(otherPlayer, rocks);
          }
        }
      });

      // Handle player disconnection
      socket.on("playerDisconnected", (playerId: string) => {
        // Only process if the scene is still active
        if (!scene.scene.isActive()) return;

        const otherPlayer = otherPlayers.get(playerId);
        if (otherPlayer) {
          // Destroy the player label if it exists
          const playerLabel = otherPlayer.getData("label");
          if (playerLabel) {
            playerLabel.destroy();
          }

          // Destroy the player
          otherPlayer.destroy();
          otherPlayers.delete(playerId);
        }
      });

      // Handle bullets fired by other players
      socket.on("bulletCreated", (bulletData: any) => {
        console.log("CLIENT: Received bulletCreated event:", bulletData);

        // Only process if the scene is still active and bullets group exists
        if (!scene.scene.isActive() || !bullets) return;

        try {
          const bullet = bullets.create(bulletData.x, bulletData.y, "bullet");

          // IMPORTANT: Explicitly set the bullet origin and size for better collision
          bullet.setOrigin(0.5, 0.5);
          bullet.setDisplaySize(8, 8); // Make sure bullet has a good size for collision

          // Generate a unique ID for this bullet
          const bulletId =
            bulletData.bulletId ||
            `remote_bullet_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

          bullet.setCollideWorldBounds(false);
          bullet.body.allowGravity = false;
          bullet.setVelocityX(bulletData.velocityX);
          bullet.setVelocityY(0); // Ensure horizontal movement only

          // Store the owner ID directly on the bullet object in multiple ways
          const ownerId = bulletData.playerId || "unknown";
          bullet.setData("owner", ownerId);
          bullet.setData("ownerId", ownerId);
          bullet.setData("bulletId", bulletId);

          // Add to the global tracking array - this is the most reliable method
          allBullets.push({ bullet, ownerId });

          console.log(
            `CLIENT: Created remote bullet with ID ${bulletId}, owner: ${ownerId}`
          );

          // Add a trail effect
          const emitter = scene.add.particles(
            bulletData.x,
            bulletData.y,
            "bullet",
            {
              speed: 20,
              scale: { start: 0.2, end: 0 },
              alpha: { start: 0.5, end: 0 },
              lifespan: 100,
              blendMode: "ADD",
              follow: bullet,
            }
          );

          // Store emitter reference for cleanup
          bullet.setData("emitter", emitter);

          // Add explicit collision handling with rocks
          if (rocks) {
            scene.physics.add.overlap(
              bullet,
              rocks,
              bulletHitRock,
              null,
              scene
            );
          }

          // Add collision with local player if not shot by us
          if (player && ownerId !== socket.id) {
            // Direct inline collision handler for THIS bullet with OUR player
            scene.physics.add.overlap(
              bullet,
              player,
              (bullet, player) => {
                console.log(
                  `Direct collision detected: Remote bullet hit local player`
                );
                bulletHitPlayer(
                  bullet as Phaser.Physics.Arcade.Sprite,
                  player as Phaser.Physics.Arcade.Sprite
                );
              },
              null,
              scene
            );
          }

          // Destroy bullet after timeout (2 seconds)
          scene.time.delayedCall(2000, () => {
            if (bullet && bullet.active) {
              // Cleanup
              const bulletEmitter = bullet.getData("emitter");
              if (bulletEmitter && bulletEmitter.active) {
                bulletEmitter.destroy();
              }

              // Remove from tracking array
              allBullets = allBullets.filter((b) => b.bullet !== bullet);

              // Destroy
              bullet.destroy();
            }
          });
        } catch (error) {
          console.error("Error creating bullet:", error);
        }
      });

      // Handle player damage events from server
      socket.on("playerDamaged", (data: any) => {
        if (!scene.scene.isActive()) return;

        console.log(`SOCKET DEBUG: Received playerDamaged event:`, data);

        if (data.playerId === socket.id) {
          // This is damage to our player - trust the server's health value
          console.log(`CLIENT: Player Damaged Event - My ID: ${socket.id}`);
          console.log(
            `CLIENT: Health BEFORE: ${playerHealth}, AFTER: ${data.health}`
          );
          console.log(
            `CLIENT: Invulnerable: ${invulnerable}, RespawnCooldown: ${respawnCooldown}`
          );

          // Skip visual effects if player is invulnerable or in respawn cooldown
          if (invulnerable) {
            console.log(
              "CLIENT: Visual effects skipped - player is invulnerable"
            );
            return;
          }

          if (respawnCooldown) {
            console.log(
              "CLIENT: Visual effects skipped - player in respawn cooldown"
            );
            return;
          }

          // Update our health to match server's value
          playerHealth = data.health;

          // Update the health display
          if (healthText) {
            healthText.setText(`Health: ${playerHealth}`);
          }

          // Flash the camera to indicate damage
          scene.cameras.main.flash(100, 255, 0, 0, 0.3);

          // Show damage number floating up
          if (player) {
            const damageText = scene.add
              .text(player.x, player.y - 20, "-1", {
                fontSize: "16px",
                color: "#ff0000",
                stroke: "#000",
                strokeThickness: 3,
              })
              .setOrigin(0.5);

            scene.tweens.add({
              targets: damageText,
              y: damageText.y - 30,
              alpha: 0,
              duration: 800,
              onComplete: () => damageText.destroy(),
            });

            // Make player flash red briefly
            scene.tweens.add({
              targets: player,
              tint: 0xff0000,
              duration: 100,
              yoyo: true,
              repeat: 2,
              onComplete: () => {
                player?.clearTint();
              },
            });
          }

          // Check if we died (only if our health is 0 or less)
          if (playerHealth <= 0 && !respawnCooldown && player) {
            console.log("CLIENT: Health reached zero - calling playerDied()");
            playerDied(scene);
          } else {
            console.log(`CLIENT: Player still has ${playerHealth} health left`);
          }
        } else {
          // This is damage to another player
          console.log(
            `CLIENT: Other player ${data.playerId} damaged, health: ${data.health}`
          );

          // Update other player's visual state if needed
          const otherPlayer = otherPlayers.get(data.playerId);
          if (otherPlayer) {
            // Store the server-provided health
            otherPlayer.setData("health", data.health);

            // Show hit effect if we caused the damage
            if (data.shooterId === socket.id) {
              // Show hit marker for successful hit
              const hitMarker = scene.add
                .text(otherPlayer.x, otherPlayer.y, "HIT!", {
                  fontSize: "16px",
                  color: "#ffff00",
                  stroke: "#000",
                  strokeThickness: 3,
                })
                .setOrigin(0.5);

              scene.tweens.add({
                targets: hitMarker,
                y: hitMarker.y - 30,
                alpha: 0,
                duration: 500,
                onComplete: () => hitMarker.destroy(),
              });
            }
          }
        }
      });

      const originalEmit = socket.emit;
      socket.emit = function (event: string, ...args: any[]) {
        if (event === "bulletHitMe") {
          console.log(`DEBUG: Sending bulletHitMe event:`, args[0]);
        }
        return originalEmit.apply(this, [event, ...args]);
      };

      // Handle player death events - controlled by server
      socket.on("playerDied", (data: any) => {
        if (!scene.scene.isActive()) return;

        if (data.playerId === socket.id) {
          // We died - according to the server
          console.log("CLIENT: Server notified us of our death");

          // Force our health to 0 to match server
          playerHealth = 0;

          // Only call the death function if we're not already in respawn cooldown
          if (!respawnCooldown && player) {
            console.log("CLIENT: Processing death sequence");
            playerDied(scene);
          } else {
            console.log(
              "CLIENT: Already in respawn cooldown, ignoring death notification"
            );
          }
        } else {
          // Another player died
          console.log(
            `CLIENT: Player ${data.playerId} died, killed by ${data.killedBy}`
          );

          const otherPlayer = otherPlayers.get(data.playerId);
          if (otherPlayer) {
            // Create death effect
            const deathEffect = scene.add.circle(
              otherPlayer.x,
              otherPlayer.y,
              30,
              0xff0000,
              0.8
            );
            scene.tweens.add({
              targets: deathEffect,
              alpha: 0,
              scale: 3,
              duration: 800,
              onComplete: () => deathEffect.destroy(),
            });

            // Make player invisible until respawned
            otherPlayer.setVisible(false);

            // If we killed them, update kill count - redundant with playerKilled event but as backup
            if (data.killedBy === socket.id) {
              killCount++;
              if (killCountText) {
                killCountText.setText(`Kills: ${killCount}`);
              }
            }
          }
        }
      });

      // Handle player respawn events - controlled by server
      socket.on("playerRespawned", (data: any) => {
        if (!scene.scene.isActive()) return;

        if (data.playerId === socket.id) {
          // We respawned - server is instructing us to respawn
          console.log("CLIENT: Server notified us to respawn");

          // Reset respawn cooldown and update health
          respawnCooldown = false;
          playerHealth = 10;

          // Cancel any respawn timer we might have running
          if (player) {
            // Make player visible and enable physics
            player.setVisible(true);
            player.body.enable = true;

            // Move to the respawn position
            player.setPosition(data.x, data.y);
            player.setVelocity(0, 0);

            // Update health display
            if (healthText) {
              healthText.setText(`Health: ${playerHealth}`);
            }

            // Hide death message if it's showing
            if (deathMessageText) {
              deathMessageText.setVisible(false);
            }

            // Set invulnerability period after respawn
            invulnerable = true;
            console.log("CLIENT: Player now invulnerable after respawn");

            if (invulnerabilityTimer) {
              invulnerabilityTimer.remove();
            }

            invulnerabilityTimer = scene.time.delayedCall(3000, () => {
              invulnerable = false;
              console.log("CLIENT: Player invulnerability ended");
              if (player) {
                player.clearAlpha(); // Reset alpha to normal
              }
            });

            // Make player flash to indicate invulnerability
            scene.tweens.add({
              targets: player,
              alpha: 0.5,
              duration: 200,
              ease: "Linear",
              repeat: 14, // 15 flashes over 3 seconds
              yoyo: true,
            });
          }
        } else {
          // Another player respawned
          const otherPlayer = otherPlayers.get(data.playerId);
          if (otherPlayer) {
            // Make player visible again
            otherPlayer.setVisible(true);

            // Move to respawn position
            otherPlayer.setPosition(data.x, data.y);
            otherPlayer.setData("health", 10);

            // Show respawn effect
            const respawnEffect = scene.add.circle(
              data.x,
              data.y,
              40,
              0x00ff00,
              0.5
            );
            scene.tweens.add({
              targets: respawnEffect,
              alpha: 0,
              scale: 2,
              duration: 500,
              onComplete: () => respawnEffect.destroy(),
            });
          }
        }
      });

      socket.on("playerKilled", (data: any) => {
        if (!scene.scene.isActive()) return;

        console.log(`SERVER: Player killed event received:`, data);

        // Update kill counts for the killer
        if (data.killedBy) {
          const currentKills = playerKills.get(data.killedBy) || 0;
          playerKills.set(data.killedBy, currentKills + 1);

          // If it's us, update our kill count
          if (data.killedBy === socket.id) {
            killCount++;

            // Update kill counter text
            if (killCountText) {
              killCountText.setText(`Kills: ${killCount}`);
            }

            // Show a kill notification
            const killText = scene.add
              .text(scene.cameras.main.width / 2, 100, "You killed a player!", {
                fontSize: "24px",
                color: "#00ff00",
                stroke: "#000",
                strokeThickness: 4,
              })
              .setOrigin(0.5)
              .setScrollFactor(0)
              .setDepth(1000);

            // Fade out after 2 seconds
            scene.tweens.add({
              targets: killText,
              alpha: 0,
              duration: 1000,
              delay: 1000,
              onComplete: () => killText.destroy(),
            });
          }

          // Update leaderboard if it's visible
          if (showLeaderboard) {
            updateLeaderboard(scene);
          }
        }
      });

      socket.on("allPlayerStats", (allStats: any) => {
        if (!scene.scene.isActive()) return;

        console.log("Received all player stats:", allStats);

        // Clear existing stats
        playerKills.clear();

        // Update with server data
        Object.entries(allStats).forEach(([id, stats]: [string, any]) => {
          if (stats.kills !== undefined) {
            playerKills.set(id, stats.kills);
          }
        });

        // Update our kill count
        if (socket && allStats[socket.id]?.kills !== undefined) {
          killCount = allStats[socket.id].kills;
          if (killCountText) {
            killCountText.setText(`Kills: ${killCount}`);
          }
        }

        // Update leaderboard if visible
        if (showLeaderboard) {
          updateLeaderboard(scene);
        }
      });

      // Add this to handle receiving current player stats when joining a game
      socket.on("playerStats", (stats: any) => {
        if (!scene.scene.isActive()) return;

        console.log("Received player stats from server:", stats);

        // Update kill count if provided by server
        if (stats.kills !== undefined) {
          killCount = stats.kills;
          if (killCountText) {
            killCountText.setText(`Kills: ${killCount}`);
          }
        }
      });
    }

    // Function to add other players
    function addOtherPlayer(scene: Phaser.Scene, playerInfo: any) {
      // Check if player already exists
      if (otherPlayers.has(playerInfo.playerId)) {
        console.log(`Player ${playerInfo.playerId} already exists`);
        return;
      }

      console.log(`Adding other player: ${playerInfo.playerId}`);

      // Calculate proper Y position if not provided or if below ground
      let yPosition = playerInfo.y;

      // If position is invalid or below ground, set to default spawn position
      if (!yPosition || yPosition > WORLD_HEIGHT - GROUND_HEIGHT) {
        // Use a default spawn point Y value
        yPosition = WORLD_HEIGHT - GROUND_HEIGHT - 50;
        console.log(
          `Correcting initial other player Y position to: ${yPosition}`
        );
      }

      // Create the player with the validated position and bigger size
      const otherPlayer = scene.physics.add
        .sprite(playerInfo.x, yPosition, "noot")
        .setScale(1.0); // Increased size

      // IMPORTANT: Set a larger collision body for better bullet detection
      const bodyWidth = otherPlayer.width * 0.8;
      const bodyHeight = otherPlayer.height;
      otherPlayer.body.setSize(bodyWidth, bodyHeight);
      otherPlayer.body.setOffset((otherPlayer.width - bodyWidth) / 2, 0);

      // Get initial health or default to 10
      const initialHealth = playerInfo.health || 10;

      // Display player ID and health above the character
      const playerLabel = scene.add
        .text(
          0,
          -90,
          `${playerInfo.playerId.substring(0, 5)} [${initialHealth}]`,
          {
            fontSize: "14px",
            color: "#ffffff",
            backgroundColor: "#000000",
            padding: { x: 3, y: 2 },
          }
        )
        .setOrigin(0.5, 0.5);

      // Make the label follow the player
      otherPlayer.setData("label", playerLabel);
      scene.time.addEvent({
        delay: 10,
        callback: () => {
          if (otherPlayer.active && playerLabel.active) {
            playerLabel.setPosition(otherPlayer.x, otherPlayer.y - 70);
          }
        },
        loop: true,
      });

      // Add necessary properties
      otherPlayer.setBounce(0.1);
      otherPlayer.setCollideWorldBounds(true);
      otherPlayer.setData("playerId", playerInfo.playerId);
      otherPlayer.setData("health", initialHealth);

      // Set up animations for other players if they exist
      if (scene.anims.exists("noot_idle")) {
        otherPlayer.anims.play("noot_idle");
      }

      // Ensure the player has proper physics setup
      // Setup collisions with platforms and rocks
      scene.physics.add.collider(otherPlayer, platforms);

      // Add collision with rocks if they exist
      if (rocks) {
        scene.physics.add.collider(otherPlayer, rocks);
      }

      // Add this player to our map of other players
      otherPlayers.set(playerInfo.playerId, otherPlayer);

      // IMPORTANT: Set up collisions for ALL existing bullets with this player
      allBullets.forEach((bulletInfo) => {
        if (
          bulletInfo.bullet.active &&
          bulletInfo.ownerId !== playerInfo.playerId
        ) {
          scene.physics.add.overlap(
            bulletInfo.bullet,
            otherPlayer,
            (bullet, otherPlayer) => {
              bulletHitPlayer(
                bullet as Phaser.Physics.Arcade.Sprite,
                otherPlayer as Phaser.Physics.Arcade.Sprite
              );
            },
            null,
            scene
          );
        }
      });
    }

    function correctPlayerPositions(scene: Phaser.Scene) {
      // Check and correct our own player if needed
      if (player && player.active && player.y > WORLD_HEIGHT - GROUND_HEIGHT) {
        console.log(`Correcting local player position - was below ground`);
        player.setY(WORLD_HEIGHT - GROUND_HEIGHT - 10);
      }

      // Check and correct all other players
      if (otherPlayers) {
        otherPlayers.forEach((otherPlayer, id) => {
          if (
            otherPlayer.active &&
            otherPlayer.y > WORLD_HEIGHT - GROUND_HEIGHT
          ) {
            console.log(
              `Correcting other player ${id} position - was below ground`
            );
            otherPlayer.setY(WORLD_HEIGHT - GROUND_HEIGHT - 10);
          }
        });
      }
    }

    function setupBulletCollisions(scene: Phaser.Scene) {
      console.log("Setting up global bullet collision system");

      // This function now creates a system that will be checked each frame
      // rather than relying on Phaser's built-in collision

      // Create an update event that checks for collisions each frame
      scene.events.on("update", () => {
        // Skip if no bullets or players
        if (!bullets || (!player && (!otherPlayers || otherPlayers.size === 0)))
          return;

        // For each active bullet
        allBullets.forEach((bulletInfo) => {
          const bullet = bulletInfo.bullet;
          const ownerId = bulletInfo.ownerId;

          if (!bullet.active) return;

          // Check collision with player (if it's not the owner)
          if (player && player.active && ownerId !== socket.id) {
            if (
              Phaser.Geom.Intersects.RectangleToRectangle(
                bullet.getBounds(),
                player.getBounds()
              )
            ) {
              console.log(
                "Manual collision detection: Bullet hit local player"
              );
              bulletHitPlayer(bullet, player);
              return; // Skip further checks for this bullet
            }
          }

          // Check collision with other players
          if (otherPlayers) {
            otherPlayers.forEach((otherPlayer, playerId) => {
              if (!otherPlayer.active || ownerId === playerId) return;

              if (
                Phaser.Geom.Intersects.RectangleToRectangle(
                  bullet.getBounds(),
                  otherPlayer.getBounds()
                )
              ) {
                console.log(
                  `Manual collision detection: Bullet hit other player ${playerId}`
                );
                bulletHitPlayer(bullet, otherPlayer);
                return; // Skip further checks for this bullet
              }
            });
          }
        });
      });
    }

    function bulletHitPlayer(
      bullet: Phaser.Physics.Arcade.Sprite,
      playerHit: Phaser.Physics.Arcade.Sprite
    ) {
      // Skip collision if the bullet or player is not active
      if (!bullet.active || !playerHit.active) return;

      console.log("Bullet hit player at:", bullet.x, bullet.y);

      // IMPORTANT: Find the bullet in our global tracking array (most reliable)
      const bulletInfo = allBullets.find((b) => b.bullet === bullet);

      // Determine bullet owner using multiple strategies
      let bulletOwnerId: string;

      if (bulletInfo) {
        // Strategy 1: Use our global array (most reliable)
        bulletOwnerId = bulletInfo.ownerId;
        console.log(`Found bullet owner via global array: ${bulletOwnerId}`);
      } else if (bullet.getData("owner")) {
        // Strategy 2: Use Phaser's data manager
        bulletOwnerId = bullet.getData("owner");
        console.log(`Found bullet owner via getData: ${bulletOwnerId}`);
      } else {
        // Fallback for debugging
        console.log("WARNING: Bullet with no identifiable owner hit a player");
        bulletOwnerId = "unknown";
      }

      // Determine which player was hit
      let hitPlayerId: string;

      if (playerHit === player) {
        // If the local player was hit
        hitPlayerId = socket.id;
        console.log(`Local player hit by bullet from: ${bulletOwnerId}`);
      } else {
        // If another player was hit, get their ID
        hitPlayerId = playerHit.getData("playerId");
        console.log(
          `Other player ${hitPlayerId} hit by bullet from: ${bulletOwnerId}`
        );

        // If we can't determine the hit player's ID, log it but continue
        if (!hitPlayerId) {
          console.log("WARNING: Could not determine hit player's ID");
          hitPlayerId = "unknown";
        }
      }

      // Skip if the bullet hit its owner
      if (bulletOwnerId === hitPlayerId) {
        console.log("Bullet hit its owner, ignoring");
        return;
      }

      // Create hit effect immediately to confirm the hit was detected
      const scene = bullet.scene;
      const hitEffect = scene.add.circle(bullet.x, bullet.y, 8, 0xffff00, 0.8);
      scene.tweens.add({
        targets: hitEffect,
        scale: 2,
        alpha: 0,
        duration: 300,
        onComplete: () => hitEffect.destroy(),
      });

      // Show hit text indicator
      const hitText = scene.add
        .text(bullet.x, bullet.y - 20, "HIT!", {
          fontSize: "16px",
          color: "#ffff00",
          stroke: "#000",
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      scene.tweens.add({
        targets: hitText,
        y: hitText.y - 30,
        alpha: 0,
        duration: 800,
        onComplete: () => hitText.destroy(),
      });

      // If the hit player is our local player, tell the server we were hit
      if (hitPlayerId === socket.id) {
        // Tell the server this bullet hit me
        if (socket && !invulnerable && !respawnCooldown) {
          // IMPORTANT: Enhanced debugging to trace server communication
          console.log(`---> SENDING bulletHitMe EVENT TO SERVER <---`);
          console.log(`Shooter ID: ${bulletOwnerId}`);
          console.log(`My position: ${player?.x},${player?.y}`);
          console.log(`Bullet position: ${bullet.x},${bullet.y}`);

          // CRITICAL FIX: Add more information to the hit event
          socket.emit("bulletHitMe", {
            shooterId: bulletOwnerId,
            timestamp: Date.now(),
            position: { x: player?.x, y: player?.y },
            bulletPosition: { x: bullet.x, y: bullet.y },
          });

          // Also apply damage locally as a backup, in case the server doesn't respond
          // This will be corrected when the server sends back the official health
          if (playerHealth > 0) {
            console.log("Applying local damage as backup");
            playerHealth = Math.max(0, playerHealth - 1);
            if (healthText) {
              healthText.setText(`Health: ${playerHealth}`);
            }
          }

          // Flash the camera red for hit feedback
          scene.cameras.main.flash(100, 255, 0, 0, 0.3);
        } else {
          console.log(
            `Hit ignored: invulnerable=${invulnerable}, respawnCooldown=${respawnCooldown}`
          );
        }
      } else if (bulletOwnerId === socket.id) {
        // If we hit another player, tell the server about our successful hit
        console.log(`---> SENDING hitPlayer EVENT TO SERVER <---`);
        console.log(`I hit player: ${hitPlayerId}`);

        // Send a more detailed hit event to the server
        socket.emit("hitPlayer", {
          targetId: hitPlayerId,
          timestamp: Date.now(),
          position: { x: bullet.x, y: bullet.y },
        });
      }

      // Cleanup and destroy the bullet
      const emitter = bullet.getData("emitter");
      if (emitter) {
        emitter.destroy();
      }

      // Remove from tracking array
      allBullets = allBullets.filter((b) => b.bullet !== bullet);

      // Destroy the bullet
      bullet.destroy();
    }

    function bulletHitPlayerCheck(
      bullet: Phaser.Physics.Arcade.Sprite,
      playerHit: Phaser.Physics.Arcade.Sprite
    ) {
      if (!bullet.active || !playerHit.active) return false;

      // Get the bullet ID
      const bulletId = bullet.name;

      // Multi-strategy approach to find the bullet owner:
      let bulletOwnerId = null;

      // Try method 1: custom map with bullet ID
      if (bulletId && bulletOwners.has(bulletId)) {
        bulletOwnerId = bulletOwners.get(bulletId);
      }
      // Try method 2: direct Phaser data properties
      else if (bullet.getData("owner")) {
        bulletOwnerId = bullet.getData("owner");
      }
      // Try method 3: custom property
      else if (bullet.owner) {
        bulletOwnerId = bullet.owner;
      }
      // Fallback
      else {
        bulletOwnerId = "unknown";
      }

      // Get hit player ID
      const playerId =
        playerHit === player ? socket.id : safeGetData(playerHit, "playerId");

      // Don't let players shoot themselves
      return bulletOwnerId !== playerId;
    }

    // Add this helper function to ensure other players are properly initialized with the noot texture
    // function addOtherPlayer(scene: Phaser.Scene, playerInfo: any) {
    //   // Check if player already exists
    //   if (otherPlayers.has(playerInfo.playerId)) {
    //     console.log(`Player ${playerInfo.playerId} already exists`);
    //     return;
    //   }

    //   console.log(`Adding other player: ${playerInfo.playerId}`);

    //   let yPosition = playerInfo.y;

    //   console.log(yPosition, " yPosition");
    //   console.log(
    //     WORLD_HEIGHT - GROUND_HEIGHT,
    //     " WORLD_HEIGHT - GROUND_HEIGHT"
    //   );

    //   // If position is invalid or below ground, set to default spawn position
    //   if (!yPosition || yPosition > WORLD_HEIGHT - GROUND_HEIGHT) {
    //     // Use a default spawn point Y value
    //     yPosition = WORLD_HEIGHT - GROUND_HEIGHT - 50;
    //     console.log(`Correcting other player Y position to: ${yPosition}`);
    //   }

    //   // Use the 'noot' texture for other players
    //   const otherPlayer = scene.physics.add
    //     .sprite(playerInfo.x, playerInfo.y, "noot")
    //     .setScale(0.7);

    //   // Add necessary properties
    //   otherPlayer.setBounce(0.1);
    //   otherPlayer.setCollideWorldBounds(true);
    //   otherPlayer.setData("playerId", playerInfo.playerId);
    //   otherPlayer.setData("health", playerInfo.health || 10);

    //   // Set up animations for other players
    //   if (scene.anims.exists("noot_idle")) {
    //     otherPlayer.anims.play("noot_idle");
    //   }

    //   // Setup collisions with platforms and rocks
    //   scene.physics.add.collider(otherPlayer, platforms);
    //   if (rocks) {
    //     scene.physics.add.collider(otherPlayer, rocks);
    //   }

    //   // Add this player to the other players map
    //   otherPlayers.set(playerInfo.playerId, otherPlayer);
    // }

    // Add this to handle bullet hits on terrain
    function bulletHitGround(bullet: any, ground: any) {
      // Create an impact effect
      const scene = bullet.scene;
      const impact = scene.add.circle(bullet.x, bullet.y, 5, 0x888888, 0.8);
      scene.tweens.add({
        targets: impact,
        scale: 2,
        alpha: 0,
        duration: 200,
        onComplete: () => impact.destroy(),
      });

      // Cleanup the particle emitter
      const emitter = bullet.getData("emitter");
      if (emitter) {
        emitter.destroy();
      }

      // Remove from tracking
      bulletOwners.delete(bullet);

      // Destroy the bullet
      bullet.destroy();
    }

    // Helper function to create player tag/name display
    function createPlayerTag(
      scene: Phaser.Scene,
      playerSprite: Phaser.Physics.Arcade.Sprite,
      playerId: string
    ) {
      // Create a shortened ID for display (first 4 chars)
      const displayId = playerId.substring(0, 4);

      // Create the tag text
      const tagText = scene.add
        .text(
          playerSprite.x,
          playerSprite.y - 40,
          `Player ${displayId} [${playerSprite.getData("health")}]`,
          {
            fontSize: "14px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
          }
        )
        .setOrigin(0.5)
        .setDepth(100);

      // Store reference to tag on player sprite
      playerSprite.setData("nameTag", tagText);

      // Update tag in scene's update loop
      scene.events.on("update", () => {
        if (playerSprite.active) {
          tagText.setPosition(playerSprite.x, playerSprite.y - 40);
          tagText.setText(
            `Player ${displayId} [${playerSprite.getData("health")}]`
          );
          tagText.setVisible(playerSprite.visible);
        } else {
          tagText.destroy();
        }
      });
    }

    // Function to handle player death
    function playerDied(scene: Phaser.Scene) {
      // Ensure this function only runs once per death
      if (respawnCooldown) {
        console.warn(
          "Player already in respawn cooldown, ignoring duplicated death"
        );
        return;
      }

      console.log("CLIENT: Player died called");

      if (!player) {
        console.warn("Cannot process death - player is null");
        return;
      }

      // Set respawn cooldown immediately to prevent multiple death processing
      respawnCooldown = true;

      // Set health to 0 (should already be 0 but just to be sure)
      playerHealth = 0;

      // Update health display
      if (healthText) {
        healthText.setText(`Health: ${playerHealth}`);
      }

      // Show death animation/effect
      const deathEffect = scene.add.circle(
        player.x,
        player.y,
        30,
        0xff0000,
        0.8
      );
      scene.tweens.add({
        targets: deathEffect,
        alpha: 0,
        scale: 3,
        duration: 800,
        onComplete: () => deathEffect.destroy(),
      });

      // Play death animation if you have one
      // player.anims.play("death", true);

      // Create explosion particles for visual impact
      const particles = scene.add.particles(player.x, player.y, "rock", {
        speed: 100,
        scale: { start: 0.2, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 800,
        blendMode: "ADD",
        quantity: 15,
      });

      // Cleanup particles after they're done
      scene.time.delayedCall(800, () => {
        particles.destroy();
      });

      // Make player invisible (don't destroy it)
      player.setVisible(false);
      player.body.enable = false; // Disable physics to prevent further collisions

      // Display death message
      if (deathMessageText) {
        deathMessageText.setVisible(true);
      } else {
        deathMessageText = scene.add
          .text(
            scene.cameras.main.width / 2,
            scene.cameras.main.height / 2,
            "You were killed!\nRespawning...",
            {
              fontSize: "24px",
              color: "#ff0000",
              stroke: "#000",
              strokeThickness: 3,
              align: "center",
            }
          )
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(1000);
      }

      // Setup respawn timer (let server handle the actual respawn timing)
      // We'll set a client-side timer as a fallback
      scene.time.delayedCall(3000, () => {
        // Only respawn locally if server hasn't already told us to respawn
        if (respawnCooldown && player) {
          console.log("CLIENT: Local respawn fallback triggered");

          // Pick a random spawn point
          const spawnIndex = Math.floor(Math.random() * SPAWN_POINTS.length);
          spawnPlayer(scene, spawnIndex);

          // Notify server of our respawn (if connected)
          if (socket) {
            socket.emit("playerRespawned", {
              x: player.x,
              y: player.y,
              health: playerHealth,
            });
          }
        }
      });
    }
    // Function to fire a bullet
    function fireBullet(scene: Phaser.Scene) {
      if (!player || !bullets) return;

      const time = scene.time.now;
      // Rate limit: can only fire every 200ms
      if (time - lastFired < 200) return;

      lastFired = time;

      // Calculate proper bullet position at character's head level
      const bulletOffsetY = -30; // Offset upward from center to head level
      const bulletPosX = player.x + (player.flipX ? -20 : 20); // Offset based on direction
      const bulletPosY = player.y + bulletOffsetY; // Head level

      // Create the bullet at proper position
      const bullet = bullets.create(bulletPosX, bulletPosY, "bullet");

      // IMPORTANT: Explicitly set the bullet origin and size for better collision
      bullet.setOrigin(0.5, 0.5);
      bullet.setDisplaySize(8, 8); // Make sure bullet has a good size for collision

      // Ensure bullet has proper physics
      bullet.setCollideWorldBounds(false);
      bullet.body.allowGravity = false;

      // Set velocity based on player direction - ensure horizontal movement only
      const bulletSpeed = 600;
      const velocityX = player.flipX ? -bulletSpeed : bulletSpeed;
      bullet.setVelocityX(velocityX);
      bullet.setVelocityY(0); // Force horizontal movement

      // Generate a unique ID for this bullet
      const bulletId = `bullet_${Date.now()}_${Math.floor(
        Math.random() * 10000
      )}`;

      // Store the owner ID directly on the bullet object in multiple ways
      bullet.setData("owner", socket.id);
      bullet.setData("ownerId", socket.id);
      bullet.setData("bulletId", bulletId);

      // Add to the global tracking array - this is the most reliable method
      allBullets.push({ bullet, ownerId: socket.id });

      // Debug message with the bullet's key properties
      console.log(
        `CLIENT: Created bullet with ID ${bulletId}, owner: ${socket.id}, position: ${bulletPosX},${bulletPosY}`
      );

      // Add a trail effect
      const emitter = scene.add.particles(bulletPosX, bulletPosY, "bullet", {
        speed: 20,
        scale: { start: 0.2, end: 0 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 100,
        blendMode: "ADD",
        follow: bullet,
      });

      // Store emitter reference for cleanup
      bullet.setData("emitter", emitter);

      // Add explicit collision handling with rocks and players
      // This ensures every bullet has its own collision handlers
      if (rocks) {
        scene.physics.add.overlap(bullet, rocks, bulletHitRock, null, scene);
      }

      // Add collision with other players - this is crucial
      if (otherPlayers) {
        otherPlayers.forEach((otherPlayer) => {
          // Important: Add direct collider for THIS bullet with EACH other player
          scene.physics.add.overlap(
            bullet,
            otherPlayer,
            (bullet, otherPlayer) => {
              // Direct inline collision handler
              console.log(`Direct collision detected: Bullet hit otherPlayer`);
              bulletHitPlayer(
                bullet as Phaser.Physics.Arcade.Sprite,
                otherPlayer as Phaser.Physics.Arcade.Sprite
              );
            },
            null,
            scene
          );
        });
      }

      // Destroy bullets after they've traveled too far (timeout)
      scene.time.delayedCall(2000, () => {
        if (bullet && bullet.active) {
          // Cleanup the emitter if still exists
          const bulletEmitter = bullet.getData("emitter");
          if (bulletEmitter && bulletEmitter.active) {
            bulletEmitter.destroy();
          }

          // Remove from tracking array
          allBullets = allBullets.filter((b) => b.bullet !== bullet);

          // Destroy the bullet
          bullet.destroy();
        }
      });

      // IMPORTANT: Make sure the server knows about this bullet
      if (socket) {
        socket.emit("bulletFired", {
          bulletId: bulletId,
          x: bulletPosX,
          y: bulletPosY,
          velocityX: velocityX,
          ownerId: socket.id, // Explicitly include owner ID
          timestamp: Date.now(), // Add timestamp for debugging
        });
      }
    }

    function createHealthDisplay(scene: Phaser.Scene) {
      // Remove existing health text if it exists
      if (healthText) {
        healthText.destroy();
      }

      // Create a more prominent health display
      healthText = scene.add
        .text(scene.cameras.main.width / 2, 20, `Health: ${playerHealth}`, {
          fontSize: "24px",
          color: "#ffffff",
          backgroundColor: "#000000",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(1000); // Make sure it's on top

      // Add a red tint if health is low
      if (playerHealth <= 3) {
        healthText.setTint(0xff0000);
      }
    }

    function setupDebugListeners(scene: Phaser.Scene) {
      if (!socket) return;

      // Remove any existing listeners to avoid duplicates
      socket.off("playerDamaged");

      // Add enhanced playerDamaged event listener with more logging
      socket.on("playerDamaged", (data: any) => {
        if (!scene.scene.isActive()) return;

        console.log(`==== SOCKET DEBUG: Received playerDamaged event ====`);
        console.log(`Player ID: ${data.playerId}`);
        console.log(`New Health: ${data.health}`);
        console.log(`Shooter ID: ${data.shooterId}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);

        if (data.playerId === socket.id) {
          // This is damage to our player - trust the server's health value
          console.log(`>>> CLIENT: I was damaged! <<<`);
          console.log(`Health BEFORE: ${playerHealth}, AFTER: ${data.health}`);
          console.log(
            `Invulnerable: ${invulnerable}, RespawnCooldown: ${respawnCooldown}`
          );

          // Skip visual effects if player is invulnerable or in respawn cooldown
          if (invulnerable) {
            console.log("Visual effects skipped - player is invulnerable");
            return;
          }

          if (respawnCooldown) {
            console.log("Visual effects skipped - player in respawn cooldown");
            return;
          }

          // IMPORTANT: Update our health to match server's value
          const oldHealth = playerHealth;
          playerHealth = data.health;
          console.log(`Health updated from ${oldHealth} to ${playerHealth}`);

          // Update the health display
          if (healthText) {
            healthText.setText(`Health: ${playerHealth}`);

            // Add a red tint if health is low
            if (playerHealth <= 3) {
              healthText.setTint(0xff0000);
            } else {
              healthText.clearTint();
            }
          }

          // Flash the camera to indicate damage
          scene.cameras.main.flash(100, 255, 0, 0, 0.3);

          // Show damage number floating up
          if (player) {
            const damageText = scene.add
              .text(player.x, player.y - 20, `-${oldHealth - playerHealth}`, {
                fontSize: "20px",
                color: "#ff0000",
                stroke: "#000",
                strokeThickness: 3,
              })
              .setOrigin(0.5);

            scene.tweens.add({
              targets: damageText,
              y: damageText.y - 50,
              alpha: 0,
              duration: 1000,
              onComplete: () => damageText.destroy(),
            });

            // Make player flash red briefly
            scene.tweens.add({
              targets: player,
              tint: 0xff0000,
              duration: 100,
              yoyo: true,
              repeat: 2,
              onComplete: () => {
                player?.clearTint();
              },
            });
          }

          // Check if we died (only if our health is 0 or less)
          if (playerHealth <= 0 && !respawnCooldown && player) {
            console.log("CLIENT: Health reached zero - calling playerDied()");
            playerDied(scene);
          } else {
            console.log(`CLIENT: Player still has ${playerHealth} health left`);
          }
        } else {
          // This is damage to another player
          console.log(
            `Other player ${data.playerId} damaged, health: ${data.health}`
          );

          // Update other player's visual state if needed
          const otherPlayer = otherPlayers.get(data.playerId);
          if (otherPlayer) {
            // Store the server-provided health
            const oldHealth = otherPlayer.getData("health") || 10;
            otherPlayer.setData("health", data.health);

            // Update the player label to show health
            const playerLabel = otherPlayer.getData("label");
            if (playerLabel) {
              const displayId = data.playerId.substring(0, 5);
              playerLabel.setText(`${displayId} [${data.health}]`);
            }

            // Show hit effect if we caused the damage
            if (data.shooterId === socket.id) {
              // Show hit marker for successful hit
              const hitMarker = scene.add
                .text(
                  otherPlayer.x,
                  otherPlayer.y,
                  `-${oldHealth - data.health}`,
                  {
                    fontSize: "16px",
                    color: "#ffff00",
                    stroke: "#000",
                    strokeThickness: 3,
                  }
                )
                .setOrigin(0.5);

              scene.tweens.add({
                targets: hitMarker,
                y: hitMarker.y - 40,
                alpha: 0,
                duration: 800,
                onComplete: () => hitMarker.destroy(),
              });

              // Make player flash red briefly
              scene.tweens.add({
                targets: otherPlayer,
                tint: 0xff0000,
                duration: 100,
                yoyo: true,
                repeat: 2,
                onComplete: () => {
                  otherPlayer.clearTint();
                },
              });
            }
          }
        }
      });
    }
    // Function to handle bullet-platform collision
    function bulletHitPlatform(
      bullet: Phaser.Physics.Arcade.Sprite,
      platform: Phaser.Physics.Arcade.Sprite
    ) {
      try {
        // Get the scene from game instance
        const scene = game.scene.scenes[0];

        // Create impact effect
        const impact = scene.add.circle(bullet.x, bullet.y, 5, 0xffff00, 0.8);
        scene.tweens.add({
          targets: impact,
          scale: 2,
          alpha: 0,
          duration: 200,
          onComplete: () => impact.destroy(),
        });

        // Add dust particles for more realistic impact
        const particles = scene.add.particles(bullet.x, bullet.y, "bullet", {
          speed: { min: 20, max: 50 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.2, end: 0 },
          alpha: { start: 0.7, end: 0 },
          lifespan: { min: 100, max: 300 },
          blendMode: "ADD",
          quantity: 8,
        });

        // Auto-destroy particles after they're done
        scene.time.delayedCall(300, () => {
          if (particles && particles.active) {
            particles.destroy();
          }
        });

        // Destroy the particle emitter if it exists
        const emitter = bullet.getData("emitter");
        if (emitter) {
          emitter.destroy();
        }

        // IMPORTANT: Remove from our tracking system to prevent memory leaks
        bulletOwners.delete(bullet);

        // Destroy the bullet
        bullet.destroy();
      } catch (error) {
        console.error("Error in bulletHitPlatform:", error);

        // Fallback clean-up in case of error
        if (bullet) {
          const emitter = bullet.getData("emitter");
          if (emitter) emitter.destroy();
          bulletOwners.delete(bullet);
          bullet.destroy();
        }
      }
    }

    // Configuration for our Phaser game
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      parent: gameRef.current,
      backgroundColor: "#87CEEB", // Sky blue background
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 600 }, // Increased gravity for better game feel
          debug: false,
        },
      },
      scene: {
        preload: preload,
        create: create,
        update: update,
      },
    };

    // Initialize the game
    game = new Phaser.Game(config);

    function createNootTextures(scene: Phaser.Scene) {
      // Increased texture height to 80 pixels to fit the raised character
      const width = 64;
      const height = 115;
      const centerX = width / 2;
      const centerY = height / 2.5; // Adjusted for raised position

      // Create the base NOOT parts once - we'll recreate these for each frame
      function drawBaseNoot(graphics: Phaser.GameObjects.Graphics) {
        // DARK BODY
        graphics.fillStyle(0x222222, 1);
        graphics.beginPath();
        // Move the body up by 24 pixels total (16 + 8 more)
        graphics.arc(centerX - 5, centerY - 24, 18, 0, Math.PI * 1); // Body moved up more
        graphics.arc(centerX + 10, centerY - 36, 10, 0, Math.PI * 2); // Head moved up more
        graphics.fill();

        // ORANGE BEAK - adjusted for new head position
        graphics.fillStyle(0xff9900, 1);
        graphics.beginPath();
        graphics.moveTo(centerX + 18, centerY - 34); // Moved up more
        graphics.lineTo(centerX + 30, centerY - 32); // Moved up more
        graphics.lineTo(centerX + 18, centerY - 26); // Moved up more
        graphics.closePath();
        graphics.fill();

        // SINGLE EYE - adjusted for new head position
        graphics.fillStyle(0x000000, 1);
        graphics.beginPath();
        graphics.arc(centerX + 8, centerY - 36, 5, 0, Math.PI * 2); // Moved up more
        graphics.fill();

        // EYE HIGHLIGHT - adjusted for new head position
        graphics.fillStyle(0xffffff, 1);
        graphics.beginPath();
        graphics.arc(centerX + 6, centerY - 37, 2, 0, Math.PI * 2); // Moved up more
        graphics.fill();
      }

      // Create base/idle texture
      const idleGraphics = scene.make.graphics({ x: 0, y: 0, add: false });

      // Draw base parts
      drawBaseNoot(idleGraphics);

      // Draw static legs and feet - moved up by 24 pixels total from original
      idleGraphics.fillStyle(0xff9900, 1);
      idleGraphics.fillRect(centerX - 8, centerY - 9, 6, 10); // Left leg moved up more
      idleGraphics.fillRect(centerX + 2, centerY - 9, 6, 10); // Right leg moved up more
      idleGraphics.fillRect(centerX - 10, centerY + 1, 10, 5); // Left foot moved up more
      idleGraphics.fillRect(centerX, centerY + 1, 10, 5); // Right foot moved up more

      // Draw static wing - moved up to match body
      idleGraphics.fillStyle(0x444444, 1);
      idleGraphics.beginPath();
      idleGraphics.arc(centerX - 5, centerY - 19, 12, -0.5, 0.5); // Moved up more
      idleGraphics.lineTo(centerX - 5, centerY - 19); // Moved up more
      idleGraphics.closePath();
      idleGraphics.fill();

      // Generate idle texture
      idleGraphics.generateTexture("noot_idle", width, height);
      idleGraphics.destroy();

      // Create walking animation frames - adjusted all positions
      for (let i = 0; i < 4; i++) {
        const walkFrame = scene.make.graphics({ x: 0, y: 0, add: false });

        // Draw base parts (same for all frames)
        drawBaseNoot(walkFrame);

        // Draw animated legs with bobbing motion - moved up more
        walkFrame.fillStyle(0xff9900, 1);
        walkFrame.fillRect(
          centerX - 8,
          centerY - 9 + Math.sin((i * Math.PI) / 2) * 5,
          6,
          10
        ); // Left leg moved up more

        walkFrame.fillRect(
          centerX + 2,
          centerY - 9 - Math.sin((i * Math.PI) / 2) * 5,
          6,
          10
        ); // Right leg moved up more

        // Draw animated feet - moved up more
        walkFrame.fillRect(
          centerX - 10,
          centerY + 1 + Math.sin((i * Math.PI) / 2) * 5,
          10,
          5
        ); // Left foot moved up more

        walkFrame.fillRect(
          centerX,
          centerY + 1 - Math.sin((i * Math.PI) / 2) * 5,
          10,
          5
        ); // Right foot moved up more

        // Draw wing with slight movement - adjusted for new body position
        walkFrame.fillStyle(0x444444, 1);
        const wingAngle = -0.5 + Math.sin((i * Math.PI) / 2) * 0.1;
        walkFrame.beginPath();
        walkFrame.arc(centerX - 5, centerY - 19, 12, wingAngle, 0.5); // Moved up more
        walkFrame.lineTo(centerX - 5, centerY - 19); // Moved up more
        walkFrame.closePath();
        walkFrame.fill();

        // Generate walk frame texture
        walkFrame.generateTexture(`noot_walk_${i}`, width, height);
        walkFrame.destroy();
      }

      // Create jump frame - adjust positions
      const jumpFrame = scene.make.graphics({ x: 0, y: 0, add: false });

      // For jump frame, we need to adjust the head position
      // DARK BODY
      jumpFrame.fillStyle(0x222222, 1);
      jumpFrame.beginPath();
      jumpFrame.arc(centerX - 5, centerY - 24, 18, 0, Math.PI * 1); // Body moved up more
      jumpFrame.arc(centerX + 10, centerY - 41, 10, 0, Math.PI * 2); // Head moved up more
      jumpFrame.fill();

      // ORANGE BEAK - adjusted for head position
      jumpFrame.fillStyle(0xff9900, 1);
      jumpFrame.beginPath();
      jumpFrame.moveTo(centerX + 18, centerY - 39); // Moved up more
      jumpFrame.lineTo(centerX + 30, centerY - 37); // Moved up more
      jumpFrame.lineTo(centerX + 18, centerY - 31); // Moved up more
      jumpFrame.closePath();
      jumpFrame.fill();

      // EYE - adjusted for head position
      jumpFrame.fillStyle(0x000000, 1);
      jumpFrame.beginPath();
      jumpFrame.arc(centerX + 8, centerY - 41, 5, 0, Math.PI * 2); // Moved up more
      jumpFrame.fill();

      // EYE HIGHLIGHT - adjusted for head position
      jumpFrame.fillStyle(0xffffff, 1);
      jumpFrame.beginPath();
      jumpFrame.arc(centerX + 6, centerY - 42, 2, 0, Math.PI * 2); // Moved up more
      jumpFrame.fill();

      // WINGS SPREAD FOR JUMPING
      jumpFrame.fillStyle(0x444444, 1);
      jumpFrame.fillRect(centerX - 23, centerY - 24, 18, 5); // Left wing moved up more
      jumpFrame.fillRect(centerX + 5, centerY - 24, 18, 5); // Right wing moved up more

      // LEGS EXTENDED FOR JUMPING
      jumpFrame.fillStyle(0xff9900, 1);
      jumpFrame.fillRect(centerX - 8, centerY - 9, 6, 15); // Left leg moved up more
      jumpFrame.fillRect(centerX + 2, centerY - 9, 6, 15); // Right leg moved up more
      jumpFrame.fillRect(centerX - 10, centerY + 6, 10, 5); // Left foot moved up more
      jumpFrame.fillRect(centerX, centerY + 6, 10, 5); // Right foot moved up more

      // Generate jump texture
      jumpFrame.generateTexture("noot_jump", width, height);
      jumpFrame.destroy();

      // Also create a simple base texture for possible other uses
      const baseFrame = scene.make.graphics({ x: 0, y: 0, add: false });
      drawBaseNoot(baseFrame);
      baseFrame.generateTexture("noot_base", width, height);
      baseFrame.destroy();

      return { centerX, centerY, width, height };
    }
    //Preload game assets
    function preload(this: Phaser.Scene) {
      // this.load.audio("nootSound", [
      //   {
      //     type: "sine",
      //     frequency: 440,
      //     attack: 0.1,
      //     decay: 0.2,
      //     sustain: 0.3,
      //     release: 0.2,
      //     duration: 0.5,
      //   },
      // ]);
      // Create a simple ground texture if we don't have an asset
      this.load.on("complete", () => {
        // Create a graphics object for the ground
        const groundGraphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Draw a rectangle for the ground
        groundGraphics.fillStyle(0x654321, 1); // Brown color
        groundGraphics.fillRect(0, 0, 64, 64);

        // Add some texture to make it look like dirt/grass
        groundGraphics.fillStyle(0x7cfc00, 1); // Green for grass on top
        groundGraphics.fillRect(0, 0, 64, 15);

        // Add dirt details
        groundGraphics.fillStyle(0x8b4513, 0.5); // Darker brown for dirt texture
        groundGraphics.fillRect(10, 20, 10, 8);
        groundGraphics.fillRect(30, 35, 15, 10);
        groundGraphics.fillRect(50, 25, 12, 8);

        // Generate a texture from the graphics object
        groundGraphics.generateTexture("ground", 64, 64);

        // Create a player character graphic
        const playerGraphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Draw player body
        playerGraphics.fillStyle(0x4a6fff, 1); // Blue color for body
        playerGraphics.fillRect(8, 0, 16, 32); // Main body

        // Draw player helmet
        playerGraphics.fillStyle(0x333333, 1); // Dark gray for helmet
        playerGraphics.fillRect(6, 0, 20, 10);

        // Draw player face
        playerGraphics.fillStyle(0xffcc99, 1); // Skin tone
        playerGraphics.fillRect(10, 12, 12, 8);

        // Draw weapon
        playerGraphics.fillStyle(0x666666, 1); // Gray for gun
        playerGraphics.fillRect(24, 16, 12, 4);

        // Generate player texture (32x32 pixels)
        playerGraphics.generateTexture("player", 32, 32);

        // Create a second player character graphic (for multiplayer)
        const player2Graphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Draw player body (different color for player 2)
        player2Graphics.fillStyle(0xff4a4a, 1); // Red color for body
        player2Graphics.fillRect(8, 0, 16, 32); // Main body

        // Draw player helmet
        player2Graphics.fillStyle(0x333333, 1); // Dark gray for helmet
        player2Graphics.fillRect(6, 0, 20, 10);

        // Draw player face
        player2Graphics.fillStyle(0xffcc99, 1); // Skin tone
        player2Graphics.fillRect(10, 12, 12, 8);

        // Draw weapon
        player2Graphics.fillStyle(0x666666, 1); // Gray for gun
        player2Graphics.fillRect(24, 16, 12, 4);

        // Generate player2 texture (32x32 pixels)
        player2Graphics.generateTexture("player2", 32, 32);

        const nootGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        nootGraphics.clear();

        // Size parameters (64x64 texture)
        createNootTextures(this);
        // Create a bullet graphic
        const bulletGraphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Draw bullet
        bulletGraphics.fillStyle(0xffff00, 1); // Yellow core
        bulletGraphics.fillCircle(4, 4, 4);

        bulletGraphics.fillStyle(0xff6600, 1); // Orange trail
        bulletGraphics.fillCircle(2, 2, 2);

        // Generate bullet texture (8x8 pixels)
        bulletGraphics.generateTexture("bullet", 8, 8);

        const rockGraphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Draw a rock shape
        rockGraphics.fillStyle(0x777777, 1); // Gray color for base
        rockGraphics.fillCircle(16, 16, 16);

        // Add some details to make it look more like a rock
        rockGraphics.fillStyle(0x555555, 0.7); // Darker gray for details
        rockGraphics.fillRect(5, 10, 8, 4);
        rockGraphics.fillRect(20, 8, 6, 5);
        rockGraphics.fillRect(12, 20, 10, 6);

        // Generate rock texture (32x32 pixels)
        rockGraphics.generateTexture("rock", 32, 32);
      });
    }

    function create(this: Phaser.Scene) {
      try {
        // Set world bounds for a larger game area
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // Create the ground platforms static group
        platforms = this.physics.add.staticGroup();

        // Create the bullets group
        bullets = this.physics.add.group();

        // Create the ground and platforms
        createGround(this);

        // Create animations for player movement
        this.anims.create({
          key: "left",
          frames: [{ key: "player", frame: 0 }],
          frameRate: 10,
          repeat: -1,
        });

        this.anims.create({
          key: "turn",
          frames: [{ key: "player", frame: 0 }],
          frameRate: 20,
        });

        this.anims.create({
          key: "right",
          frames: [{ key: "player", frame: 0 }],
          frameRate: 10,
          repeat: -1,
        });

        // Set up keyboard input
        cursors =
          this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;

        // Set up space key for shooting (separate from cursor keys)
        spaceKey = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.SPACE
        );

        // Add WASD keys for alternative movement
        const wasd = {
          up: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W),
          left: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A),
          down: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S),
          right: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        // Spawn the player at a random spawn point
        spawnPlayer(this, Math.floor(Math.random() * SPAWN_POINTS.length));

        this.anims.create({
          key: "noot_walk",
          frames: [
            { key: "noot_walk_0" },
            { key: "noot_walk_1" },
            { key: "noot_walk_2" },
            { key: "noot_walk_3" },
          ],
          frameRate: 8,
          repeat: -1,
        });

        this.anims.create({
          key: "noot_jump",
          frames: [{ key: "noot_jump" }],
          frameRate: 10,
        });

        this.anims.create({
          key: "noot_idle",
          frames: [{ key: "noot_idle" }], // Using the dedicated idle frame instead of base
          frameRate: 10,
        });

        // Add collision between bullets and platforms
        this.physics.add.collider(
          bullets,
          platforms,
          bulletHitPlatform,
          undefined,
          this
        );

        // healthText = this.add
        //   .text(16, 16, `Health: ${playerHealth}`, {
        //     fontSize: "20px",
        //     color: "#ffffff",
        //     stroke: "#000000",
        //     strokeThickness: 3,
        //   })
        //   .setScrollFactor(0)
        //   .setDepth(1000);

        // Add kill counter text
        killCountText = this.add
          .text(16, 48, `Kills: ${killCount}`, {
            fontSize: "20px",
            color: "#00ff00",
            stroke: "#000000",
            strokeThickness: 3,
          })
          .setScrollFactor(0)
          .setDepth(1000);

        // ADD YOUR NEW CODE HERE - collision detection for bullets hitting player
        this.physics.add.overlap(
          bullets,
          player,
          (bullet: any, playerSprite: any) => {
            // Get the bullet owner using both tracking methods for reliability
            const bulletOwner =
              bulletOwners.get(bullet) || bullet.getData("owner");

            console.log(
              `Bullet collision detected! Owner: ${bulletOwner}, My ID: ${socket?.id}`
            );

            // Only process if the bullet wasn't fired by this player
            // and player is not invulnerable or in respawn cooldown
            if (
              bulletOwner !== socket?.id &&
              !invulnerable &&
              !respawnCooldown
            ) {
              console.log(`CLIENT: I was hit by bullet from ${bulletOwner}`);

              // Tell server we were hit
              if (socket) {
                socket.emit("bulletHitMe", {
                  shooterId: bulletOwner,
                });
              }

              // Create hit effect - purely visual, health reduction happens on server
              const hitEffect = this.add.circle(
                bullet.x,
                bullet.y,
                10,
                0xff0000,
                0.7
              );
              this.tweens.add({
                targets: hitEffect,
                alpha: 0,
                scale: 2,
                duration: 200,
                onComplete: () => hitEffect.destroy(),
              });

              // Flash the player to indicate damage
              this.tweens.add({
                targets: player,
                alpha: 0.3,
                duration: 100,
                yoyo: true,
                repeat: 2,
              });

              // Destroy bullet
              const emitter = bullet.getData("emitter");
              if (emitter) {
                emitter.destroy();
              }
              bulletOwners.delete(bullet);
              bullet.destroy();
            }
          },
          undefined,
          this
        );

        leaderboardKey = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.TAB
        );

        // Create the leaderboard (initially hidden)
        leaderboardText = this.add
          .text(
            this.cameras.main.width - 250,
            100,
            "LEADERBOARD\n-------------\n",
            {
              fontSize: "18px",
              color: "#ffffff",
              backgroundColor: "#00000099",
              padding: { x: 15, y: 15 },
              align: "left",
            }
          )
          .setScrollFactor(0)
          .setDepth(1000)
          .setVisible(false);

        if (player) {
          const myTag = this.add
            .text(player.x, player.y - 40, `You [${playerHealth}]`, {
              fontSize: "14px",
              color: "#FFFF00",
              stroke: "#000000",
              strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(100);

          player.setData("nameTag", myTag);
        }
        // Add game title (fixed to camera)
        const title = this.add
          .text(20, 20, "NOOT Militia Game", {
            fontSize: "32px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 4,
          })
          .setScrollFactor(0);

        // Add health display
        healthText = this.add
          .text(20, 220, `Health: ${playerHealth}`, {
            fontSize: "18px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setScrollFactor(0);

        // Add death message text (hidden by default)
        deathMessageText = this.add
          .text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            "You were killed! Respawning in 3 seconds...",
            {
              fontSize: "24px",
              color: "#ff0000",
              stroke: "#000",
              strokeThickness: 4,
              backgroundColor: "#00000088",
              padding: { x: 20, y: 10 },
            }
          )
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(1000)
          .setVisible(false);

        // Add fullscreen button (fixed to camera)
        const fullscreenButton = this.add
          .text(this.cameras.main.width - 20, 20, "[ Fullscreen ]", {
            fontSize: "18px",
            color: "#ffffff",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setOrigin(1, 0)
          .setInteractive()
          .setScrollFactor(0)
          .setName("fullscreenButton");

        fullscreenButton.on("pointerup", () => {
          if (this.scale.isFullscreen) {
            this.scale.stopFullscreen();
            setIsFullscreen(false);
          } else {
            this.scale.startFullscreen();
            setIsFullscreen(true);
          }
        });

        // Listen for F key to toggle fullscreen
        this.input.keyboard?.on("keydown-F", () => {
          if (this.scale.isFullscreen) {
            this.scale.stopFullscreen();
            setIsFullscreen(false);
          } else {
            this.scale.startFullscreen();
            setIsFullscreen(true);
          }
        });

        // Listen for fullscreen change events from the browser
        this.scale.on("enterfullscreen", () => {
          setIsFullscreen(true);
        });

        this.scale.on("leavefullscreen", () => {
          setIsFullscreen(false);
        });

        // Add respawn buttons for testing multiplayer spawn points
        const respawnP1Button = this.add
          .text(20, this.cameras.main.height - 60, "Respawn P1", {
            fontSize: "18px",
            color: "#fff",
            backgroundColor: "#4a6fff",
            padding: { x: 10, y: 5 },
          })
          .setInteractive()
          .setScrollFactor(0);

        respawnP1Button.on("pointerup", () => {
          spawnPlayer(this, 0);
        });

        const respawnP2Button = this.add
          .text(150, this.cameras.main.height - 60, "Respawn P2", {
            fontSize: "18px",
            color: "#fff",
            backgroundColor: "#ff4a4a",
            padding: { x: 10, y: 5 },
          })
          .setInteractive()
          .setScrollFactor(0);

        respawnP2Button.on("pointerup", () => {
          spawnPlayer(this, 1);
        });

        // Add instructions (fixed to camera)
        this.add
          .text(20, 70, "Use Arrow Keys or A/D to move", {
            fontSize: "18px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setScrollFactor(0);

        this.add
          .text(20, 100, "Use Up/W to jump", {
            fontSize: "18px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setScrollFactor(0);

        this.add
          .text(20, 130, "Press SPACE to fire bullets", {
            fontSize: "18px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setScrollFactor(0);

        // Add world size indicator
        this.add
          .text(20, 160, `World Size: ${WORLD_WIDTH}x${WORLD_HEIGHT}`, {
            fontSize: "18px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setScrollFactor(0);

        // Add multiplayer status indicator
        const multiplayerStatus = this.add
          .text(20, 190, "Multiplayer: Connecting...", {
            fontSize: "18px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setScrollFactor(0)
          .setName("multiplayerStatus");

        // Setup the debug listeners
        setupDebugListeners(this);

        // Create enhanced health display
        createHealthDisplay(this);

        // Add minimap (optional)
        const minimapWidth = 200;
        const minimapHeight = 100;
        const minimapX = this.cameras.main.width - minimapWidth - 20;
        const minimapY = this.cameras.main.height - minimapHeight - 20;

        // Create minimap camera
        const minimapCamera = this.cameras
          .add(minimapX, minimapY, minimapWidth, minimapHeight)
          .setZoom(minimapWidth / WORLD_WIDTH)
          .setName("minimap")
          .setBackgroundColor(0x002244)
          .setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // The camera itself doesn't need setScrollFactor as it's positioned absolutely
        // We can add a player marker to the minimap instead
        const minimapPlayerMarker = this.add
          .circle(0, 0, 4, 0xffffff)
          .setDepth(1000) // Make sure it's above other elements
          .setName("minimapPlayerMarker");

        // Add border around minimap
        const minimapBorder = this.add
          .rectangle(
            minimapX + minimapWidth / 2,
            minimapY + minimapHeight / 2,
            minimapWidth,
            minimapHeight,
            0x000000,
            0
          )
          .setStrokeStyle(2, 0xffffff)
          .setScrollFactor(0);

        // Add spawn point indicators on minimap
        SPAWN_POINTS.forEach((point, index) => {
          const color = index === 0 ? 0x4a6fff : 0xff4a4a;
          const spawnMarker = this.add
            .circle(
              minimapX + (point.x / WORLD_WIDTH) * minimapWidth,
              minimapY + (point.y / WORLD_HEIGHT) * minimapHeight,
              3,
              color
            )
            .setAlpha(0.8);
        });

        // Add collision between bullets and platforms
        this.physics.add.collider(
          bullets,
          platforms,
          (bullet: any, platform: any) => {
            console.log("PLATFORM: Bullet hit platform");

            // Create impact effect
            const impact = this.add.circle(
              bullet.x,
              bullet.y,
              5,
              0xffff00,
              0.8
            );
            this.tweens.add({
              targets: impact,
              scale: 2,
              alpha: 0,
              duration: 200,
              onComplete: () => impact.destroy(),
            });

            // Clean up bullet tracking
            bulletOwners.delete(bullet);

            // Destroy the emitter
            try {
              const emitter = bullet.getData ? bullet.getData("emitter") : null;
              if (emitter) {
                emitter.destroy();
              }
            } catch (e) {
              console.error("Error destroying emitter:", e);
            }

            // Destroy the bullet
            bullet.destroy();
          },
          undefined,
          this
        );

        // Spawn the player at the first spawn point - do this last to ensure everything else is ready
        this.time.delayedCall(100, () => {
          spawnPlayer(this, 0);
        });
      } catch (error) {
        console.error("Error in create function:", error);
      }
    }

    // Update game state (runs on every frame)
    function update(this: Phaser.Scene) {
      try {
        // Only process if player exists
        if (!player) return;

        // Skip all player movement/controls if player is dead or in respawn cooldown
        if (respawnCooldown) return;

        // Track if player has moved
        let hasMovement = false;

        // Handle animation states first
        if (!player.body.touching.down) {
          // Jumping/Flying animation
          player.anims.play("noot_jump", true);
        } else if (
          cursors.left?.isDown ||
          cursors.right?.isDown ||
          this.input.keyboard.checkDown(
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            150
          ) ||
          this.input.keyboard.checkDown(
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            150
          )
        ) {
          // Walking animation when moving on ground
          player.anims.play("noot_walk", true);
          hasMovement = true;
        } else {
          // Idle animation when standing still
          player.anims.play("noot_idle", true);
        }

        // Handle movement logic
        if (
          cursors.left?.isDown ||
          this.input.keyboard.checkDown(
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            150
          )
        ) {
          player.setVelocityX(-160);
          player.setFlipX(true);
          hasMovement = true;
        } else if (
          cursors.right?.isDown ||
          this.input.keyboard.checkDown(
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            150
          )
        ) {
          player.setVelocityX(160);
          player.setFlipX(false);
          hasMovement = true;
        } else {
          player.setVelocityX(0);
        }

        // Handle jumping
        if (
          (cursors.up?.isDown ||
            this.input.keyboard.checkDown(
              this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
              150
            )) &&
          player.body.touching.down
        ) {
          const jumpPower = player.texture.key === "noot" ? -600 : -430;
          player.setVelocityY(jumpPower);
          hasMovement = true;
          // Play jump sound if you have one
          // this.sound.play('jump_sound');
        }

        // Handle shooting
        if (spaceKey.isDown) {
          fireBullet(this);
        }

        // Send player position and state to server if it changed
        if (
          socket &&
          (player.x !== prevX ||
            player.y !== prevY ||
            player.flipX !== prevFlipX ||
            hasMovement)
        ) {
          // Update previous position
          prevX = player.x;
          prevY = player.y;
          prevFlipX = player.flipX;

          // Send position to server along with current health
          socket.emit("playerMovement", {
            x: player.x,
            y: player.y,
            flipX: player.flipX,
            health: playerHealth,
            animation: player.anims.currentAnim?.key, // Send current animation state
          });
        }

        // Rest of your existing update code...
        if (Phaser.Input.Keyboard.JustDown(leaderboardKey)) {
          showLeaderboard = !showLeaderboard;
          if (leaderboardText) {
            leaderboardText.setVisible(showLeaderboard);

            if (showLeaderboard) {
              updateLeaderboard(this);
            }
          }
        }

        // BACKUP COLLISION DETECTION
        if (player && !respawnCooldown && !invulnerable) {
          const playerBounds = player.getBounds();

          bullets.getChildren().forEach((bulletObj: any) => {
            const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
            const bulletOwner =
              bulletOwners.get(bullet) || bullet.getData("owner");

            if (bulletOwner === socket?.id) return;

            const bulletBounds = bullet.getBounds();

            if (Phaser.Geom.Rectangle.Overlaps(playerBounds, bulletBounds)) {
              console.log(
                "MANUAL COLLISION DETECTED between bullet and player!"
              );

              if (socket) {
                socket.emit("bulletHitMe", {
                  shooterId: bulletOwner,
                });
              }

              const hitEffect = this.add.circle(
                bullet.x,
                bullet.y,
                10,
                0xff0000,
                0.7
              );
              this.tweens.add({
                targets: hitEffect,
                alpha: 0,
                scale: 2,
                duration: 200,
                onComplete: () => hitEffect.destroy(),
              });

              const emitter = bullet.getData("emitter");
              if (emitter) emitter.destroy();
              bulletOwners.delete(bullet);
              bullet.destroy();
            }
          });
        }

        // Handle bullets that go too far off screen
        bullets.getChildren().forEach((bulletObj: any) => {
          const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
          if (
            bullet.x < -50 ||
            bullet.x > this.physics.world.bounds.width + 50 ||
            bullet.y < -50 ||
            bullet.y > this.physics.world.bounds.height + 50
          ) {
            const emitter = bullet.getData("emitter");
            if (emitter) {
              emitter.destroy();
            }
            bulletOwners.delete(bullet);
            bullet.destroy();
          }
        });

        // Update player tags
        if (player) {
          const myTag = player.getData("nameTag");
          if (myTag && myTag.active) {
            myTag.setPosition(player.x, player.y - 40);
            myTag.setText(`You [${playerHealth}]`);
            myTag.setVisible(player.visible);
          }
        }

        // Update other player tags
        otherPlayers?.forEach((otherPlayer) => {
          const nameTag = otherPlayer.getData("nameTag");
          if (nameTag && nameTag.active) {
            nameTag.setPosition(otherPlayer.x, otherPlayer.y - 40);
            nameTag.setText(
              `Player ${otherPlayer
                .getData("playerId")
                .substring(0, 4)} [${otherPlayer.getData("health")}]`
            );
            nameTag.setVisible(otherPlayer.visible);
          }
        });

        // Update health display
        if (healthText) {
          healthText.setText(`Health: ${playerHealth}`);
        }

        // Check for player falling off the world
        if (player && player.y > this.physics.world.bounds.height + 100) {
          if (socket && !respawnCooldown) {
            socket.emit("playerDied");
            playerDied(this);
          }
        }
      } catch (error) {
        console.error("Error in update function:", error);
      }
    }

    function updateLeaderboard(scene: Phaser.Scene) {
      if (!leaderboardText) return;

      // Create leaderboard string
      let leaderboardContent = "LEADERBOARD\n-------------\n";

      // Sort players by kill count
      const sortedPlayers = Array.from(playerKills.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Show top 5 players

      // Add entries for each player
      sortedPlayers.forEach(([id, kills], index) => {
        // Highlight current player
        const isCurrentPlayer = id === socket?.id;
        const playerName = isCurrentPlayer
          ? "YOU"
          : `Player ${id.substring(0, 4)}`;
        const color = isCurrentPlayer ? "#FFFF00" : "#FFFFFF";

        leaderboardContent += `${index + 1}. ${playerName}: ${kills} kills\n`;
      });

      // If current player isn't in top 5, add them at the bottom
      if (socket && !sortedPlayers.some(([id]) => id === socket.id)) {
        const myKills = playerKills.get(socket.id) || 0;
        const myRank =
          Array.from(playerKills.entries())
            .sort((a, b) => b[1] - a[1])
            .findIndex(([id]) => id === socket.id) + 1;

        leaderboardContent += `\n${myRank}. YOU: ${myKills} kills`;
      }

      // Update the leaderboard text
      leaderboardText.setText(leaderboardContent);

      // Position leaderboard at right side of screen
      leaderboardText.setPosition(
        scene.cameras.main.width - leaderboardText.width - 20,
        100
      );
    }

    // Add window resize listener
    window.addEventListener("resize", updateDimensions);

    // Cleanup function
    return () => {
      window.removeEventListener("resize", updateDimensions);
      if (socket) {
        socket.disconnect();
      }
      game.destroy(true);
    };
  }, []);

  return (
    <div className="game-container">
      <div ref={gameRef} className="game-canvas" />
      <style jsx>{`
        .game-container {
          width: 100%;
          height: 100vh;
          overflow: hidden;
          padding: 0;
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .game-canvas {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
}
