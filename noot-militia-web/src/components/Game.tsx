"use client";

import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import io from "socket.io-client";

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

export default function Game() {
  const gameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      platforms
        .create(300, WORLD_HEIGHT - 120, "ground") // Was 120, now 90
        .setScale(3, 0.5)
        .refreshBody();
      platforms
        .create(500, WORLD_HEIGHT - 200, "ground") // Was 280, now 250
        .setScale(2, 0.5)
        .refreshBody();

      // Middle platforms - reduced height by 30
      platforms
        .create(WORLD_WIDTH / 2 - 150, WORLD_HEIGHT - 120, "ground") // Was 150, now 120
        .setScale(4, 0.5)
        .refreshBody();
      platforms
        .create(WORLD_WIDTH / 2 + 80, WORLD_HEIGHT - 200, "ground") // Was 300, now 270
        .setScale(3, 0.5)
        .refreshBody();

      // Right side platforms - reduced height by 30
      platforms
        .create(WORLD_WIDTH - 300, WORLD_HEIGHT - 120, "ground") // Was 150, now 120
        .setScale(3, 0.5)
        .refreshBody();
      platforms
        .create(WORLD_WIDTH - 500, WORLD_HEIGHT - 200, "ground") // Was 280, now 250
        .setScale(2, 0.5)
        .refreshBody();

      // Add rocks on platforms for cover
      createRocks(scene);
    }

    function createRocks(scene: Phaser.Scene) {
      // Create the rocks group (needs to be defined at the top with other game objects)
      if (!rocks) {
        rocks = scene.physics.add.staticGroup();
      }

      // Add rocks on left platforms
      createRock(scene, 250, WORLD_HEIGHT - 150, 1.2);
      createRock(scene, 350, WORLD_HEIGHT - 150, 1);
      createRock(scene, 500, WORLD_HEIGHT - 230, 1.3);

      // Add rocks on middle platforms
      createRock(scene, WORLD_WIDTH / 2 - 200, WORLD_HEIGHT - 150, 1.4);
      createRock(scene, WORLD_WIDTH / 2 - 50, WORLD_HEIGHT - 150, 1);
      createRock(scene, WORLD_WIDTH / 2 + 30, WORLD_HEIGHT - 230, 1.2);
      createRock(scene, WORLD_WIDTH / 2 + 100, WORLD_HEIGHT - 230, 1);

      // Add rocks on right platforms
      createRock(scene, WORLD_WIDTH - 350, WORLD_HEIGHT - 150, 1.1);
      createRock(scene, WORLD_WIDTH - 250, WORLD_HEIGHT - 150, 1.3);
      createRock(scene, WORLD_WIDTH - 480, WORLD_HEIGHT - 230, 1.2);

      // Make sure collision between bullets and rocks is established
      scene.physics.add.collider(
        bullets,
        rocks,
        bulletHitRock,
        undefined,
        scene
      );

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
      const rock = rocks.create(x, y, "rock");
      rock.setScale(scale);
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
          player = scene.physics.add.sprite(spawnPoint.x, spawnPoint.y, "noot");

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
          otherPlayer.setPosition(playerInfo.x, playerInfo.y);
          otherPlayer.setFlipX(playerInfo.flipX);

          // Update health if provided
          if (playerInfo.health !== undefined) {
            otherPlayer.setData("health", playerInfo.health);
          }

          // Update visibility based on death state
          if (playerInfo.isDead !== undefined) {
            otherPlayer.setVisible(!playerInfo.isDead);
          }
        }
      });

      // Handle player disconnection
      socket.on("playerDisconnected", (playerId: string) => {
        // Only process if the scene is still active
        if (!scene.scene.isActive()) return;

        const otherPlayer = otherPlayers.get(playerId);
        if (otherPlayer) {
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
          bullet.setCollideWorldBounds(false);
          bullet.body.allowGravity = false;
          bullet.setVelocityX(bulletData.velocityX);

          // Store owner ID in our custom tracking system
          const ownerId = bulletData.playerId || "unknown";
          bulletOwners.set(bullet, ownerId);

          // Also try the traditional way
          bullet.setData("owner", ownerId);

          console.log(`CLIENT: Created bullet with owner: ${ownerId}`);

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

          // Store emitter in our custom tracker too
          bullet.setData("emitter", emitter);
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
      // Check if the scene and physics system are still active
      if (!scene.scene.isActive() || !scene.physics || !platforms) {
        console.warn("Cannot add other player - scene or physics not ready");
        return;
      }

      try {
        const texture = Math.random() > 0.5 ? "player2" : "noot";
        const otherPlayer = scene.physics.add.sprite(
          playerInfo.x,
          playerInfo.y,
          "noot" // Use the red player sprite for other players
        );

        otherPlayer.setBounce(0.1);
        otherPlayer.setCollideWorldBounds(true);

        // CRITICAL: Store player ID for collision detection
        otherPlayer.setData("playerId", playerInfo.playerId);
        otherPlayer.setData("health", playerInfo.health || 10);

        // Set visibility based on isDead flag from server
        if (playerInfo.isDead) {
          otherPlayer.setVisible(false);
        }

        // Add collision with platforms
        scene.physics.add.collider(otherPlayer, platforms);

        // Add collision with rocks if they exist
        if (rocks) {
          scene.physics.add.collider(otherPlayer, rocks);
        }

        // CRITICAL FIX: Improved collision with bullets for other players
        scene.physics.add.overlap(
          bullets,
          otherPlayer,
          (bullet: any, target: any) => {
            // Get bullet owner data
            const bulletOwner =
              bulletOwners.get(bullet) || bullet.getData("owner");
            console.log(
              `Bullet overlap with other player detected! Bullet owner: ${bulletOwner}, My ID: ${socket?.id}`
            );

            // Only process bullet collision if the bullet was fired by this player
            if (bulletOwner === socket?.id) {
              const targetId = target.getData("playerId");
              console.log(
                `CLIENT: Bullet hit detected on another player with ID ${targetId}`
              );

              // Emit hit event to server with target ID
              if (socket) {
                socket.emit("bulletHit", {
                  targetId: targetId,
                });

                console.log(
                  `CLIENT: Sent bulletHit event to server for player ${targetId}`
                );
              }

              // Create hit effect
              const hitEffect = scene.add.circle(
                bullet.x,
                bullet.y,
                10,
                0xff0000,
                0.7
              );
              scene.tweens.add({
                targets: hitEffect,
                alpha: 0,
                scale: 2,
                duration: 200,
                onComplete: () => hitEffect.destroy(),
              });

              // Destroy the bullet and its effects
              const emitter = bullet.getData("emitter");
              if (emitter) {
                emitter.destroy();
              }

              // Remove from tracking
              bulletOwners.delete(bullet);

              // Destroy the bullet
              bullet.destroy();
            }
          },
          undefined,
          scene
        );

        // Store in our map
        otherPlayers.set(playerInfo.playerId, otherPlayer);

        // Add player tag above character with health
        createPlayerTag(scene, otherPlayer, playerInfo.playerId);

        return otherPlayer;
      } catch (error) {
        console.error("Error adding other player:", error);
        return null;
      }
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
      console.log("===== PLAYER DIED FUNCTION CALLED =====");
      console.log("Player health:", playerHealth);
      console.log("respawnCooldown:", respawnCooldown);

      // Safety checks - prevent death if player is already respawning
      if (!player || respawnCooldown) {
        console.log(
          "DEATH ABORTED: Player doesn't exist or already respawning"
        );
        return;
      }

      // Force health to 0 to be sure
      playerHealth = 0;

      // Update health display
      if (healthText) {
        healthText.setText(`Health: 0 (DEAD)`);
      }

      // Set respawn cooldown flag to prevent multiple deaths
      respawnCooldown = true;
      console.log("Set respawn cooldown to prevent multiple deaths");

      // Show death message
      if (deathMessageText) {
        deathMessageText.setText("You were killed! Respawning in 3 seconds...");
        deathMessageText.setVisible(true);
      } else {
        deathMessageText = scene.add
          .text(
            scene.cameras.main.width / 2,
            scene.cameras.main.height / 2,
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
          .setDepth(1000);
      }

      // Create death effect
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

      // Make player invisible during respawn (but keep the object)
      player.setVisible(false);

      // Disable player movement during respawn
      player.setVelocity(0, 0);
      player.body.enable = false;

      // Hide player tag if it exists
      const nameTag = player.getData("nameTag");
      if (nameTag && nameTag.active) {
        nameTag.setVisible(false);
      }

      // Notify server of our death if not already handled
      // This is a backup in case the server somehow missed that we died
      if (socket) {
        socket.emit("playerDied");
        console.log("CLIENT: Sent playerDied event to server as backup");
      }

      // NOTE: We don't need to set a respawn timer here
      // The server will send a playerRespawned event when it's time

      // However, as a failsafe, we can set a longer client-side respawn timer
      // in case server response is lost
      scene.time.delayedCall(5000, () => {
        // Only respawn if we're still dead after 5 seconds (server might have failed)
        if (respawnCooldown && playerHealth <= 0) {
          console.log(
            "CLIENT: Server respawn message not received - emergency respawn"
          );

          // Choose a random spawn point
          const spawnPointIndex = Math.floor(
            Math.random() * SPAWN_POINTS.length
          );
          const spawnPoint = SPAWN_POINTS[spawnPointIndex];

          // Respawn locally
          playerHealth = 10;
          respawnCooldown = false;

          if (player) {
            player.setVisible(true);
            player.body.enable = true;
            player.setPosition(spawnPoint.x, spawnPoint.y);

            // Show player tag again
            const nameTag = player.getData("nameTag");
            if (nameTag && nameTag.active) {
              nameTag.setVisible(true);
            }
          }

          // Notify server of our emergency respawn
          if (socket) {
            socket.emit("playerRespawned", {
              x: spawnPoint.x,
              y: spawnPoint.y,
            });
          }

          // Hide death message
          if (deathMessageText) {
            deathMessageText.setVisible(false);
          }
        }
      });
    }

    // Function to fire a bullet
    function fireBullet(scene: Phaser.Scene) {
      if (!player) return;

      const time = scene.time.now;

      // Cooldown of 200ms between shots
      if (time - lastFired < 200) {
        return;
      }

      // Create a bullet at the player's position
      const bulletX = player.flipX ? player.x - 20 : player.x + 20;
      const bulletY = player.y - 5;

      // Create bullet with explicit physics body
      const bullet = bullets.create(bulletX, bulletY, "bullet");
      bullet.setCollideWorldBounds(false);

      // CRITICAL: Make sure gravity is disabled for bullets
      if (bullet.body) {
        bullet.body.allowGravity = false;
      }

      // Set bullet velocity based on player direction
      const bulletVelocity = player.flipX ? -400 : 400;
      bullet.setVelocityX(bulletVelocity);

      console.log(
        `CLIENT: Firing bullet - Owner: ${
          socket?.id || "local"
        } at position ${bulletX},${bulletY}`
      );

      // IMPORTANT: Store owner ID in both ways - this is critical for collision detection
      const ownerId = socket?.id || "local";
      bullet.setData("owner", ownerId);
      bulletOwners.set(bullet, ownerId); // Our custom tracking

      // Add a trail effect
      const emitter = scene.add.particles(bulletX, bulletY, "bullet", {
        speed: 20,
        scale: { start: 0.2, end: 0 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 100,
        blendMode: "ADD",
        follow: bullet,
      });

      // Store emitter reference with the bullet for cleanup
      bullet.setData("emitter", emitter);

      // Update last fired timestamp
      lastFired = time;

      // Add a simple muzzle flash effect
      const flash = scene.add.circle(bulletX, bulletY, 6, 0xffff00, 0.8);
      scene.tweens.add({
        targets: flash,
        scale: 0,
        alpha: 0,
        duration: 80,
        onComplete: () => flash.destroy(),
      });

      // Emit to server that we fired a bullet
      if (socket) {
        socket.emit("playerShoot", {
          x: bulletX,
          y: bulletY,
          velocityX: bulletVelocity,
          playerId: socket.id,
        });
      }

      if (player.texture.key === "noot") {
        const nootSound = this.sound.add("nootSound");
        nootSound.play();
      }

      return bullet;
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

    // Preload game assets
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
        const size = 64;
        const centerX = size / 2;
        const centerY = size / 2;

        // DARK BODY (using arcs instead of ellipse)
        nootGraphics.fillStyle(0x222222, 1);
        nootGraphics.beginPath();
        // Main body (approximating ellipse with arcs)
        nootGraphics.arc(centerX - 5, centerY, 18, 0, Math.PI * 1);
        // Neck curve
        nootGraphics.arc(centerX + 10, centerY - 12, 10, 0, Math.PI * 2);
        nootGraphics.fill();

        // ORANGE BEAK (triangle works fine)
        nootGraphics.fillStyle(0xff9900, 1);
        nootGraphics.beginPath();
        nootGraphics.moveTo(centerX + 18, centerY - 10);
        nootGraphics.lineTo(centerX + 30, centerY - 8);
        nootGraphics.lineTo(centerX + 18, centerY - 2);
        nootGraphics.closePath();
        nootGraphics.fill();

        // SINGLE EYE (using circle)
        nootGraphics.fillStyle(0x000000, 1);
        nootGraphics.beginPath();
        nootGraphics.arc(centerX + 8, centerY - 12, 5, 0, Math.PI * 2);
        nootGraphics.fill();

        // EYE HIGHLIGHT
        nootGraphics.fillStyle(0xffffff, 1);
        nootGraphics.beginPath();
        nootGraphics.arc(centerX + 6, centerY - 13, 2, 0, Math.PI * 2);
        nootGraphics.fill();

        // LEGS (using rectangles)
        nootGraphics.fillStyle(0xff9900, 1);
        // Upper legs
        nootGraphics.fillRect(centerX - 8, centerY + 15, 6, 10);
        nootGraphics.fillRect(centerX + 2, centerY + 15, 6, 10);
        // Feet
        nootGraphics.fillRect(centerX - 10, centerY + 25, 10, 5);
        nootGraphics.fillRect(centerX, centerY + 25, 10, 5);

        // WING (using arc and line)
        nootGraphics.fillStyle(0x444444, 1);
        nootGraphics.beginPath();
        nootGraphics.arc(centerX - 5, centerY + 5, 12, -0.5, 0.5);
        nootGraphics.lineTo(centerX - 5, centerY + 5);
        nootGraphics.closePath();
        nootGraphics.fill();

        // Generate texture
        nootGraphics.generateTexture("noot", size, size);
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
          const jumpPower = player.texture.key === "noot" ? -400 : -330;
          player.setVelocityY(jumpPower);
          hasMovement = true;
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
            health: playerHealth, // Send current health with movement
          });
        }

        if (Phaser.Input.Keyboard.JustDown(leaderboardKey)) {
          showLeaderboard = !showLeaderboard;
          if (leaderboardText) {
            leaderboardText.setVisible(showLeaderboard);

            if (showLeaderboard) {
              // Update leaderboard content when shown
              updateLeaderboard(this);
            }
          }
        }

        // BACKUP COLLISION DETECTION: Manually check for bullet collisions with player
        // This is a fallback in case the physics overlap doesn't trigger correctly
        if (player && !respawnCooldown && !invulnerable) {
          const playerBounds = player.getBounds();

          bullets.getChildren().forEach((bulletObj: any) => {
            const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
            const bulletOwner =
              bulletOwners.get(bullet) || bullet.getData("owner");

            // Skip bullets fired by this player
            if (bulletOwner === socket?.id) return;

            const bulletBounds = bullet.getBounds();

            // Manual collision detection
            if (Phaser.Geom.Rectangle.Overlaps(playerBounds, bulletBounds)) {
              console.log(
                "MANUAL COLLISION DETECTED between bullet and player!"
              );

              // Emit hit to server
              if (socket) {
                socket.emit("bulletHitMe", {
                  shooterId: bulletOwner,
                });
              }

              // Create hit effect
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

              // Clean up the bullet
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
            // Clean up particle emitter if it exists
            const emitter = bullet.getData("emitter");
            if (emitter) {
              emitter.destroy();
            }

            // Remove from our custom bullet tracking
            bulletOwners.delete(bullet);

            // Destroy the bullet
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

        // Update health display to ensure it's showing the latest value
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
