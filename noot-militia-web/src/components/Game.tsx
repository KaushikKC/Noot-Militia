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
      // Left side platforms
      platforms
        .create(300, WORLD_HEIGHT - 200, "ground")
        .setScale(3, 0.5)
        .refreshBody();
      platforms
        .create(600, WORLD_HEIGHT - 350, "ground")
        .setScale(2, 0.5)
        .refreshBody();

      // Middle platforms
      platforms
        .create(WORLD_WIDTH / 2 - 150, WORLD_HEIGHT - 250, "ground")
        .setScale(4, 0.5)
        .refreshBody();
      platforms
        .create(WORLD_WIDTH / 2 + 150, WORLD_HEIGHT - 400, "ground")
        .setScale(3, 0.5)
        .refreshBody();

      // Right side platforms
      platforms
        .create(WORLD_WIDTH - 300, WORLD_HEIGHT - 200, "ground")
        .setScale(3, 0.5)
        .refreshBody();
      platforms
        .create(WORLD_WIDTH - 600, WORLD_HEIGHT - 350, "ground")
        .setScale(2, 0.5)
        .refreshBody();
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
          // Create player sprite at the specified spawn point
          player = scene.physics.add.sprite(
            spawnPoint.x,
            spawnPoint.y,
            "player"
          );

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
      socket = io("http://localhost:4000"); // Replace with your server URL

      // Handle current players data
      socket.on("currentPlayers", (players: any) => {
        // Only process if the scene is still active
        if (!scene.scene.isActive()) return;

        Object.keys(players).forEach((id) => {
          if (id !== socket.id) {
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
          console.log(
            "BULLET TRACKER: ",
            Array.from(bulletOwners.entries())
              .map(([b, id]) => id)
              .join(", ")
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

          // Store emitter in our custom tracker too
          bullet.setData("emitter", emitter);
        } catch (error) {
          console.error("Error creating bullet:", error);
        }
      });

      // In your socket.on("playerDamaged") handler:
      socket.on("playerDamaged", (data: any) => {
        if (!scene.scene.isActive()) return;

        if (data.playerId === socket.id) {
          // Log health before update
          console.log(`CLIENT: Player Damaged Event - My ID: ${socket.id}`);
          console.log(
            `CLIENT: Health BEFORE: ${playerHealth}, AFTER: ${data.health}`
          );
          console.log(
            `CLIENT: Invulnerable: ${invulnerable}, RespawnCooldown: ${respawnCooldown}`
          );

          // Skip if player is invulnerable or in respawn cooldown
          if (invulnerable) {
            console.log("CLIENT: Ignoring damage - player is invulnerable");
            return;
          }

          if (respawnCooldown) {
            console.log("CLIENT: Ignoring damage - player in respawn cooldown");
            return;
          }

          // Update our health
          playerHealth = data.health;

          // Update the health display
          if (healthText) {
            healthText.setText(`Health: ${playerHealth}`);
          }

          // Flash the camera to indicate damage
          scene.cameras.main.flash(100, 255, 0, 0, 0.3);

          // Show damage number floating up
          if (player) {
            // Damage text creation...
          }

          // Check if we died (only if our health is 0 or less)
          if (playerHealth <= 0 && !respawnCooldown && player) {
            console.log("CLIENT: Health reached zero - calling playerDied()");
            playerDied(scene);
          } else {
            console.log(`CLIENT: Player still has ${playerHealth} health left`);
          }
        } else {
          console.log(
            `CLIENT: Other player ${data.playerId} damaged, health: ${data.health}`
          );
          // Handle other player damage...
        }
      });

      // Handle player death events
      socket.on("playerDied", (data: any) => {
        if (!scene.scene.isActive()) return;

        if (data.playerId === socket.id) {
          // We died - will be handled by our own death logic
          // This is just a backup in case client-side detection fails
          if (playerHealth > 0 && player) {
            playerHealth = 0;
            playerDied(scene);
          }
        } else {
          // Another player died
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

            // If we killed them, show a message
            if (data.killedBy === socket.id) {
              const killText = scene.add
                .text(
                  scene.cameras.main.width / 2,
                  100,
                  "You killed a player!",
                  {
                    fontSize: "24px",
                    color: "#00ff00",
                    stroke: "#000",
                    strokeThickness: 4,
                  }
                )
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
          }
        }
      });

      // Handle player respawn events
      socket.on("playerRespawned", (data: any) => {
        if (!scene.scene.isActive()) return;

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
        const otherPlayer = scene.physics.add.sprite(
          playerInfo.x,
          playerInfo.y,
          "player2" // Use the red player sprite for other players
        );

        otherPlayer.setBounce(0.1);
        otherPlayer.setCollideWorldBounds(true);
        otherPlayer.setData("playerId", playerInfo.playerId);
        otherPlayer.setData("health", playerInfo.health || 10);

        // Add collision with platforms
        scene.physics.add.collider(otherPlayer, platforms);

        // Add collision with bullets
        scene.physics.add.overlap(
          bullets,
          otherPlayer,
          (bullet: any, target: any) => {
            // Only process bullet collision if the bullet was fired by this player
            if (bullet.getData("owner") === socket?.id) {
              console.log(
                `CLIENT: Bullet hit detected on another player with ID ${target.getData(
                  "playerId"
                )}`
              );

              // If this is our bullet hitting another player
              // Emit hit event to server
              socket.emit("bulletHit", {
                targetId: target.getData("playerId"),
              });

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
              bullet.destroy();
            }
          },
          undefined,
          scene
        );

        // Store in our map
        otherPlayers.set(playerInfo.playerId, otherPlayer);
      } catch (error) {
        console.error("Error adding other player:", error);
      }
    }

    // Function to handle player death
    function playerDied(scene: Phaser.Scene) {
      console.log("===== PLAYER DIED FUNCTION CALLED =====");
      console.log("Player health:", playerHealth);
      console.log("respawnCooldown:", respawnCooldown);

      // Safety checks - prevent death if player has health or is already respawning
      if (!player || respawnCooldown) {
        console.log(
          "DEATH ABORTED: Player doesn't exist or already respawning"
        );
        return;
      }

      if (playerHealth > 0) {
        console.log("DEATH ABORTED: Player still has health, not dying");
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

      // Set respawn timer
      scene.time.delayedCall(3000, () => {
        console.log("Respawn timer completed. Respawning player...");

        // Hide death message
        if (deathMessageText) {
          deathMessageText.setVisible(false);
        }

        // Respawn at random spawn point
        spawnPlayer(scene, Math.floor(Math.random() * SPAWN_POINTS.length));
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
      const bullet = bullets.create(bulletX, player.y - 5, "bullet");

      console.log(`CLIENT: Firing bullet - Owner: ${socket?.id || "local"}`);

      // Set bullet properties
      bullet.setCollideWorldBounds(false);
      bullet.body.allowGravity = false;
      bullet.setVelocityX(player.flipX ? -400 : 400); // Direction based on player facing

      // Store owner ID in both ways
      const ownerId = socket?.id || "local";
      bullet.setData("owner", ownerId);
      bulletOwners.set(bullet, ownerId); // Our custom tracking

      // Add a trail effect using the updated Phaser API
      const emitter = scene.add.particles(bulletX, player.y - 5, "bullet", {
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
      const flash = scene.add.circle(bulletX, player.y - 5, 6, 0xffff00, 0.8);
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
          y: player.y - 5,
          velocityX: player.flipX ? -400 : 400,
          playerId: socket.id,
        });
      }
    }

    // Function to handle bullet-platform collision
    function bulletHitPlatform(
      bullet: Phaser.Physics.Arcade.Sprite,
      platform: Phaser.Physics.Arcade.Sprite
    ) {
      // Create impact effect
      const scene = game.scene.scenes[0];
      const impact = scene.add.circle(bullet.x, bullet.y, 5, 0xffff00, 0.8);
      scene.tweens.add({
        targets: impact,
        scale: 2,
        alpha: 0,
        duration: 200,
        onComplete: () => impact.destroy(),
      });

      // Destroy the particle emitter if it exists
      const emitter = bullet.getData("emitter");
      if (emitter) {
        emitter.destroy();
      }

      // Destroy the bullet
      bullet.destroy();
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

        // Create a bullet graphic
        const bulletGraphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Draw bullet
        bulletGraphics.fillStyle(0xffff00, 1); // Yellow core
        bulletGraphics.fillCircle(4, 4, 4);

        bulletGraphics.fillStyle(0xff6600, 1); // Orange trail
        bulletGraphics.fillCircle(2, 2, 2);

        // Generate bullet texture (8x8 pixels)
        bulletGraphics.generateTexture("bullet", 8, 8);
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

        // ADD YOUR NEW CODE HERE - collision detection for bullets hitting player
        this.physics.add.overlap(
          bullets,
          player,
          (bullet: any, playerSprite: any) => {
            // Get the bullet owner using both tracking methods for reliability
            const bulletOwner =
              bulletOwners.get(bullet) || bullet.getData("owner");

            // Only process if the bullet wasn't fired by this player and player is not invulnerable
            if (
              bulletOwner !== socket?.id &&
              !invulnerable &&
              !respawnCooldown
            ) {
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

              // Reduce player health locally - this is the key change
              // We'll still let the server validate, but we update locally for immediate feedback
              const oldHealth = playerHealth;
              playerHealth = Math.max(0, playerHealth - 1);

              console.log(
                `CLIENT: Player health ${oldHealth} -> ${playerHealth}`
              );

              // Update the health display immediately
              if (healthText) {
                healthText.setText(`Health: ${playerHealth}`);
              }

              // Notify server about hit - only if we're hit by another player's bullet
              if (socket) {
                const shooterId = bulletOwner;
                console.log(
                  `CLIENT: About to send bulletHitMe event with shooterId: ${shooterId}`
                );

                // Only send if we have a valid shooter ID
                if (shooterId && shooterId !== "local") {
                  socket.emit("bulletHitMe", {
                    shooterId: shooterId,
                  });
                  console.log(
                    `CLIENT: Sent bulletHitMe event with shooterId: ${shooterId}`
                  );
                } else {
                  console.log(
                    `CLIENT: Not sending bulletHitMe - invalid shooterId: ${shooterId}`
                  );
                }
              }

              // Flash camera to indicate damage
              this.cameras.main.flash(100, 255, 0, 0, 0.3);

              // Show damage number floating up
              const damageText = this.add.text(player.x, player.y - 20, "-1", {
                fontSize: "22px",
                color: "#ff0000",
                stroke: "#000",
                strokeThickness: 3,
              });

              this.tweens.add({
                targets: damageText,
                y: player.y - 60,
                alpha: 0,
                duration: 800,
                onComplete: () => damageText.destroy(),
              });

              // Destroy the bullet and its effects
              const emitter = bullet.getData("emitter");
              if (emitter) {
                emitter.destroy();
              }

              // Remove from our tracking before destroying
              bulletOwners.delete(bullet);
              bullet.destroy();

              // IMPORTANT FIX: Check if health is now zero and call playerDied
              if (playerHealth <= 0 && !respawnCooldown) {
                console.log("CLIENT: Health now zero, calling playerDied");
                playerDied(this);
              }
            }
          },
          undefined,
          this
        );

        // Add game title (fixed to camera)
        const title = this.add
          .text(20, 20, "Mini Militia Game", {
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

          // Set up collision between bullets and the local player

          // Set up collision between bullets and the local player
          // this.physics.add.overlap(
          //   bullets,
          //   player,
          //   (bullet: any, playerSprite: any) => {
          //     // Only process if the bullet wasn't fired by this player and player is not invulnerable
          //     if (bullet.getData("owner") !== socket?.id && !invulnerable) {
          //       // Create hit effect
          //       const hitEffect = this.add.circle(
          //         bullet.x,
          //         bullet.y,
          //         10,
          //         0xff0000,
          //         0.7
          //       );
          //       this.tweens.add({
          //         targets: hitEffect,
          //         alpha: 0,
          //         scale: 2,
          //         duration: 200,
          //         onComplete: () => hitEffect.destroy(),
          //       });

          //       // Reduce player health locally - this is the key change
          //       // We'll still let the server validate, but we update locally for immediate feedback
          //       playerHealth = Math.max(0, playerHealth - 1);

          //       // Update the health display immediately
          //       if (healthText) {
          //         healthText.setText(`Health: ${playerHealth}`);
          //       }

          //       // Notify server about hit - only if we're hit by another player's bullet
          //       if (socket) {
          //         const shooterId = bullet.getData("owner");
          //         console.log(
          //           `CLIENT: About to send bulletHitMe event with shooterId: ${shooterId}, bullet data:`,
          //           bullet.getData()
          //         );

          //         // Only send if we have a valid shooter ID
          //         if (shooterId && shooterId !== "local") {
          //           socket.emit("bulletHitMe", {
          //             shooterId: shooterId,
          //           });
          //           console.log(
          //             `CLIENT: Sent bulletHitMe event with shooterId: ${shooterId}`
          //           );
          //         } else {
          //           console.log(
          //             `CLIENT: Not sending bulletHitMe - invalid shooterId: ${shooterId}`
          //           );
          //         }
          //       }

          //       // Flash camera to indicate damage
          //       this.cameras.main.flash(100, 255, 0, 0, 0.3);

          //       // Show damage number floating up
          //       const damageText = this.add.text(
          //         player.x,
          //         player.y - 20,
          //         "-1",
          //         {
          //           fontSize: "22px",
          //           color: "#ff0000",
          //           stroke: "#000",
          //           strokeThickness: 3,
          //         }
          //       );

          //       this.tweens.add({
          //         targets: damageText,
          //         y: player.y - 60,
          //         alpha: 0,
          //         duration: 800,
          //         onComplete: () => damageText.destroy(),
          //       });

          //       // Destroy the bullet and its effects
          //       const emitter = bullet.getData("emitter");
          //       if (emitter) {
          //         emitter.destroy();
          //       }
          //       bullet.destroy();

          //       // Only call playerDied if health reaches zero
          //       if (playerHealth <= 0 && !respawnCooldown) {
          //         console.log("Player health reached zero, calling playerDied");
          //         playerDied(this);
          //       }
          //     }
          //   },
          //   undefined,
          //   this
          // );
        });
      } catch (error) {
        console.error("Error in create function:", error);
      }
    }

    // Update game state (runs on every frame)
    function update(this: Phaser.Scene) {
      // Add a strong null check at the top
      if (!player || !player.body || !player.body.enable || !cursors) return;

      // Handle left and right movement
      if (
        cursors.left.isDown ||
        this.input.keyboard?.checkDown(this.input.keyboard.addKey("A"))
      ) {
        // Move left
        if (player && player.body && player.body.enable) {
          player.setVelocityX(-160);
          player.setFlipX(true); // Flip the sprite to face left
          player.anims.play("left", true);
        }
      } else if (
        cursors.right.isDown ||
        this.input.keyboard?.checkDown(this.input.keyboard.addKey("D"))
      ) {
        // Move right
        if (player && player.body && player.body.enable) {
          player.setVelocityX(160);
          player.setFlipX(false); // Reset the sprite to face right
          player.anims.play("right", true);
        }
      } else {
        // Stand still
        if (player && player.body && player.body.enable) {
          player.setVelocityX(0);
          player.anims.play("turn");
        }
      }

      // Allow jumping if touching the ground, but NOT with spacebar
      if (
        (cursors.up.isDown ||
          this.input.keyboard?.checkDown(this.input.keyboard.addKey("W"))) &&
        player &&
        player.body &&
        player.body.enable &&
        player.body.touching.down
      ) {
        player.setVelocityY(-330);
      }

      // Fire bullet with spacebar
      if (spaceKey && spaceKey.isDown) {
        if (player && player.visible && player.body && player.body.enable) {
          fireBullet(this);
        }
      }

      // Clean up bullets that are out of bounds
      if (bullets) {
        bullets.getChildren().forEach((bullet: any) => {
          if (
            bullet.x < -50 ||
            bullet.x > WORLD_WIDTH + 50 ||
            bullet.y < -50 ||
            bullet.y > WORLD_HEIGHT + 50
          ) {
            // Clean up particle effects
            const emitter = bullet.getData ? bullet.getData("emitter") : null;
            if (emitter) {
              emitter.destroy();
            }
            bullet.destroy();
          }
        });
      }

      if (healthText) {
        // Show more detailed info including invulnerable status
        const statusText = invulnerable
          ? " (INVULNERABLE)"
          : respawnCooldown
          ? " (RESPAWNING)"
          : "";
        healthText.setText(`Health: ${playerHealth}${statusText}`);
      }

      bullets.getChildren().forEach((bullet: any) => {
        if (bullet.x < -100 || bullet.x > WORLD_WIDTH + 100) {
          console.log("Cleaning up out-of-bounds bullet");
          // Remove from tracking
          bulletOwners.delete(bullet);

          // Clean up emitter
          const emitter = bullet.getData ? bullet.getData("emitter") : null;
          if (emitter) {
            emitter.destroy();
          }

          // Destroy bullet
          bullet.destroy();
        }
      });

      if (player && player.visible && !invulnerable && !respawnCooldown) {
        // Manual bullet collision detection that bypasses Phaser's data system entirely
        bullets.getChildren().forEach((bullet: any) => {
          // Skip bullets that we own
          if (bulletOwners.get(bullet) === socket?.id) {
            return;
          }

          // Check for collision with player using simple distance check
          const dx = player.x - bullet.x;
          const dy = player.y - bullet.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // If bullet is close enough to player, count as hit
          if (distance < 25) {
            // Adjust this value based on sprite sizes
            console.log("DIRECT HIT DETECTION: Bullet hit player!");

            // Get the owner for logging but don't rely on it
            const ownerId = bulletOwners.get(bullet) || "unknown";
            console.log(`DIRECT HIT: Bullet from ${ownerId}`);

            // Reduce health directly (never below 0)
            const oldHealth = playerHealth;
            playerHealth = Math.max(0, playerHealth - 1);

            console.log(
              `DIRECT HIT: Health reduced ${oldHealth} -> ${playerHealth}`
            );

            // Update health text
            if (healthText) {
              healthText.setText(`Health: ${playerHealth}`);
            }

            // Flash the camera
            this.cameras.main.flash(100, 255, 0, 0, 0.3);

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

            // Only trigger death if health reached 0
            if (playerHealth === 0 && !respawnCooldown) {
              console.log("DIRECT HIT: Health reached 0, calling playerDied");
              playerDied(this);
            }

            // Clean up the bullet
            const emitter = bullet.getData ? bullet.getData("emitter") : null;
            if (emitter) {
              emitter.destroy();
            }
            bulletOwners.delete(bullet);
            bullet.destroy();
          }
        });
      }

      if (player && !player.visible && playerHealth > 0 && !respawnCooldown) {
        console.log(
          "CLIENT: Emergency recovery - player was invisible but health > 0"
        );
        player.setVisible(true);
        player.body.enable = true;
      }

      // Visual indicator for invulnerability
      if (player && player.visible) {
        // Toggle alpha for invulnerable players
        if (invulnerable) {
          // The player already has tweens for this, but we can update text
          if (healthText) {
            healthText.setText(`Health: ${playerHealth} (INVULNERABLE)`);
          }
        } else {
          if (healthText) {
            healthText.setText(`Health: ${playerHealth}`);
          }
        }
      }

      // Update minimap player marker position
      if (player && player.visible) {
        const minimapPlayerMarker = this.children.getByName(
          "minimapPlayerMarker"
        );
        if (minimapPlayerMarker) {
          const minimapWidth = 200;
          const minimapHeight = 100;
          const minimapX = this.cameras.main.width - minimapWidth - 20;
          const minimapY = this.cameras.main.height - minimapHeight - 20;

          minimapPlayerMarker.setPosition(
            minimapX + (player.x / WORLD_WIDTH) * minimapWidth,
            minimapY + (player.y / WORLD_HEIGHT) * minimapHeight
          );
        }
      }

      // Update UI elements that need to follow the camera
      const fullscreenButton = this.children.getByName("fullscreenButton");
      if (fullscreenButton) {
        fullscreenButton.setPosition(this.cameras.main.width - 20, 20);
      }

      // Update death message position
      if (deathMessageText && deathMessageText.visible) {
        deathMessageText.setPosition(
          this.cameras.main.width / 2,
          this.cameras.main.height / 2
        );
      }

      // Send position updates to server if player has moved and is alive
      if (
        player &&
        player.visible &&
        player.body &&
        player.body.enable &&
        socket
      ) {
        const x = player.x;
        const y = player.y;
        const flipX = player.flipX;

        if (prevX !== x || prevY !== y || prevFlipX !== flipX) {
          socket.emit("playerMovement", {
            x: x,
            y: y,
            flipX: flipX,
            health: playerHealth,
          });

          // Update previous position
          prevX = x;
          prevY = y;
          prevFlipX = flipX;
        }
      }

      // Update other players on minimap
      if (otherPlayers) {
        otherPlayers.forEach((otherPlayer, playerId) => {
          // Skip if player is not visible (e.g., during respawn)
          if (!otherPlayer.visible) return;

          const minimapWidth = 200;
          const minimapHeight = 100;
          const minimapX = this.cameras.main.width - minimapWidth - 20;
          const minimapY = this.cameras.main.height - minimapHeight - 20;

          // Get or create minimap marker for this player
          let marker = this.children.getByName(`minimap-player-${playerId}`);
          if (!marker) {
            marker = this.add
              .circle(0, 0, 4, 0xff4a4a)
              .setDepth(1000)
              .setName(`minimap-player-${playerId}`);
          }

          // Update marker position
          marker.setPosition(
            minimapX + (otherPlayer.x / WORLD_WIDTH) * minimapWidth,
            minimapY + (otherPlayer.y / WORLD_HEIGHT) * minimapHeight
          );
        });
      }

      // Update health display position
      if (healthText) {
        healthText.setPosition(20, 220);
      }
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
