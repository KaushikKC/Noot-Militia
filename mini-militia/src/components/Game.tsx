'use client';

import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';

export default function Game() {
  const gameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  useEffect(() => {
    if (!gameRef.current) return;
    
    // Variables to store game objects
    let platforms: Phaser.Physics.Arcade.StaticGroup;
    let player: Phaser.Physics.Arcade.Sprite;
    let bullets: Phaser.Physics.Arcade.Group;
    let cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    let spaceKey: Phaser.Input.Keyboard.Key;
    let game: Phaser.Game;
    let lastFired = 0; // Timestamp of last bullet fired
    
    // Game world configuration
    const WORLD_WIDTH = 3200; // Much wider world
    const WORLD_HEIGHT = 800; // Taller world
    const GROUND_HEIGHT = 64;
    
    // Spawn points for multiplayer
    const SPAWN_POINTS = [
      { x: 200, y: WORLD_HEIGHT - GROUND_HEIGHT - 50 },  // Left side spawn
      { x: WORLD_WIDTH - 200, y: WORLD_HEIGHT - GROUND_HEIGHT - 50 }  // Right side spawn
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
        platforms.create(
          i * 64, 
          WORLD_HEIGHT, 
          'ground'
        ).setOrigin(0, 1).refreshBody(); // Set origin to bottom-left for proper alignment
      }
      
      // Add some platforms throughout the world for more interesting gameplay
      // Left side platforms
      platforms.create(300, WORLD_HEIGHT - 200, 'ground').setScale(3, 0.5).refreshBody();
      platforms.create(600, WORLD_HEIGHT - 350, 'ground').setScale(2, 0.5).refreshBody();
      
      // Middle platforms
      platforms.create(WORLD_WIDTH/2 - 150, WORLD_HEIGHT - 250, 'ground').setScale(4, 0.5).refreshBody();
      platforms.create(WORLD_WIDTH/2 + 150, WORLD_HEIGHT - 400, 'ground').setScale(3, 0.5).refreshBody();
      
      // Right side platforms
      platforms.create(WORLD_WIDTH - 300, WORLD_HEIGHT - 200, 'ground').setScale(3, 0.5).refreshBody();
      platforms.create(WORLD_WIDTH - 600, WORLD_HEIGHT - 350, 'ground').setScale(2, 0.5).refreshBody();
    }

    // Function to spawn player at a specific spawn point
    function spawnPlayer(scene: Phaser.Scene, spawnPointIndex: number = 0) {
      if (!player) {
        // Create player sprite at the specified spawn point
        const spawnPoint = SPAWN_POINTS[spawnPointIndex % SPAWN_POINTS.length];
        player = scene.physics.add.sprite(spawnPoint.x, spawnPoint.y, 'player');
        
        // Set player properties
        player.setBounce(0.1);
        player.setCollideWorldBounds(true);
        
        // Enable physics collision between player and platforms
        scene.physics.add.collider(player, platforms);
        
        // Make camera follow the player
        scene.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        scene.cameras.main.startFollow(player, true, 0.08, 0.08);
        scene.cameras.main.setZoom(1); // Adjust zoom level as needed
      } else {
        // Respawn existing player at the specified spawn point
        const spawnPoint = SPAWN_POINTS[spawnPointIndex % SPAWN_POINTS.length];
        player.setPosition(spawnPoint.x, spawnPoint.y);
        player.setVelocity(0, 0);
      }
    }
    
    // Function to fire a bullet
    function fireBullet(scene: Phaser.Scene) {
      const time = scene.time.now;
      
      // Cooldown of 200ms between shots
      if (time - lastFired < 200) {
        return;
      }
      
      // Create a bullet at the player's position
      const bulletX = player.flipX ? player.x - 20 : player.x + 20;
      const bullet = bullets.create(bulletX, player.y - 5, 'bullet');
      
      // Set bullet properties
      bullet.setCollideWorldBounds(false);
      bullet.body.allowGravity = false;
      bullet.setVelocityX(player.flipX ? -400 : 400); // Direction based on player facing
      
      // Add a trail effect using the updated Phaser API
      const emitter = scene.add.particles(bulletX, player.y - 5, 'bullet', {
        speed: 20,
        scale: { start: 0.2, end: 0 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 100,
        blendMode: 'ADD',
        follow: bullet
      });
      
      // Store emitter reference with the bullet for cleanup
      bullet.setData('emitter', emitter);
      
      // Update last fired timestamp
      lastFired = time;
      
      // Add a simple muzzle flash effect
      const flash = scene.add.circle(bulletX, player.y - 5, 6, 0xffff00, 0.8);
      scene.tweens.add({
        targets: flash,
        scale: 0,
        alpha: 0,
        duration: 80,
        onComplete: () => flash.destroy()
      });
    }
    
    // Function to handle bullet-platform collision
    function bulletHitPlatform(bullet: Phaser.Physics.Arcade.Sprite, platform: Phaser.Physics.Arcade.Sprite) {
      // Create impact effect
      const scene = game.scene.scenes[0];
      const impact = scene.add.circle(bullet.x, bullet.y, 5, 0xffff00, 0.8);
      scene.tweens.add({
        targets: impact,
        scale: 2,
        alpha: 0,
        duration: 200,
        onComplete: () => impact.destroy()
      });
      
      // Destroy the particle emitter if it exists
      const emitter = bullet.getData('emitter');
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
      backgroundColor: '#87CEEB', // Sky blue background
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 600 }, // Increased gravity for better game feel
          debug: false
        }
      },
      scene: {
        preload: preload,
        create: create,
        update: update
      }
    };

    // Initialize the game
    game = new Phaser.Game(config);

    // Preload game assets
    function preload(this: Phaser.Scene) {
      // Create a simple ground texture if we don't have an asset
      this.load.on('complete', () => {
        // Create a graphics object for the ground
        const groundGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        
        // Draw a rectangle for the ground
        groundGraphics.fillStyle(0x654321, 1); // Brown color
        groundGraphics.fillRect(0, 0, 64, 64);
        
        // Add some texture to make it look like dirt/grass
        groundGraphics.fillStyle(0x7CFC00, 1); // Green for grass on top
        groundGraphics.fillRect(0, 0, 64, 15);
        
        // Add dirt details
        groundGraphics.fillStyle(0x8B4513, 0.5); // Darker brown for dirt texture
        groundGraphics.fillRect(10, 20, 10, 8);
        groundGraphics.fillRect(30, 35, 15, 10);
        groundGraphics.fillRect(50, 25, 12, 8);
        
        // Generate a texture from the graphics object
        groundGraphics.generateTexture('ground', 64, 64);
        
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
        playerGraphics.generateTexture('player', 32, 32);
        
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
        player2Graphics.generateTexture('player2', 32, 32);
        
        // Create a bullet graphic
        const bulletGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        
        // Draw bullet
        bulletGraphics.fillStyle(0xffff00, 1); // Yellow core
        bulletGraphics.fillCircle(4, 4, 4);
        
        bulletGraphics.fillStyle(0xff6600, 1); // Orange trail
        bulletGraphics.fillCircle(2, 2, 2);
        
        // Generate bullet texture (8x8 pixels)
        bulletGraphics.generateTexture('bullet', 8, 8);
      });
    }

    // Create game objects
    function create(this: Phaser.Scene) {
      // Set world bounds for a larger game area
      this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      
      // Create the ground platforms static group
      platforms = this.physics.add.staticGroup();
      
      // Create the bullets group
      bullets = this.physics.add.group();
      
      // Create the ground and platforms
      createGround(this);
      
      // Spawn the player at the first spawn point
      spawnPlayer(this, 0);
      
      // Enable physics collision between bullets and platforms
      this.physics.add.collider(bullets, platforms, bulletHitPlatform as any, undefined, this);
      
      // Create animations for player movement
      this.anims.create({
        key: 'left',
        frames: [{ key: 'player', frame: 0 }],
        frameRate: 10,
        repeat: -1
      });
      
      this.anims.create({
        key: 'turn',
        frames: [{ key: 'player', frame: 0 }],
        frameRate: 20
      });
      
      this.anims.create({
        key: 'right',
        frames: [{ key: 'player', frame: 0 }],
        frameRate: 10,
        repeat: -1
      });
      
      // Set up keyboard input
      cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
      
      // Set up space key for shooting (separate from cursor keys)
      spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      
      // Add WASD keys for alternative movement
      const wasd = {
        up: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        left: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        down: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        right: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      };
      
      // Add game title (fixed to camera)
      const title = this.add.text(20, 20, 'Mini Militia Game', { 
        fontSize: '32px', 
        color: '#fff',
        stroke: '#000',
        strokeThickness: 4
      }).setScrollFactor(0);

      // Add fullscreen button (fixed to camera)
      const fullscreenButton = this.add.text(this.cameras.main.width - 20, 20, '[ Fullscreen ]', {
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000',
        strokeThickness: 2
      }).setOrigin(1, 0).setInteractive().setScrollFactor(0);

      fullscreenButton.on('pointerup', () => {
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
          setIsFullscreen(false);
        } else {
          this.scale.startFullscreen();
          setIsFullscreen(true);
        }
      });

      // Listen for F key to toggle fullscreen
      this.input.keyboard?.on('keydown-F', () => {
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
          setIsFullscreen(false);
        } else {
          this.scale.startFullscreen();
          setIsFullscreen(true);
        }
      });

      // Listen for fullscreen change events from the browser
      this.scale.on('enterfullscreen', () => {
        setIsFullscreen(true);
      });

      this.scale.on('leavefullscreen', () => {
        setIsFullscreen(false);
      });

      // Add respawn buttons for testing multiplayer spawn points
      const respawnP1Button = this.add.text(20, this.cameras.main.height - 60, 'Respawn P1', {
        fontSize: '18px',
        color: '#fff',
        backgroundColor: '#4a6fff',
        padding: { x: 10, y: 5 }
      }).setInteractive().setScrollFactor(0);
      
      const respawnP2Button = this.add.text(150, this.cameras.main.height - 60, 'Respawn P2', {
        fontSize: '18px',
        color: '#fff',
        backgroundColor: '#ff4a4a',
        padding: { x: 10, y: 5 }
      }).setInteractive().setScrollFactor(0);
      
      respawnP1Button.on('pointerup', () => {
        spawnPlayer(this, 0);
      });
      
      respawnP2Button.on('pointerup', () => {
        spawnPlayer(this, 1);
      });

      // Add instructions (fixed to camera)
      this.add.text(20, 70, 'Use Arrow Keys or A/D to move', {
        fontSize: '18px',
        color: '#fff',
        stroke: '#000',
        strokeThickness: 2
      }).setScrollFactor(0);
      
      this.add.text(20, 100, 'Use Up/W to jump', {
        fontSize: '18px',
        color: '#fff',
        stroke: '#000',
        strokeThickness: 2
      }).setScrollFactor(0);
      
      this.add.text(20, 130, 'Press SPACE to fire bullets', {
        fontSize: '18px',
        color: '#fff',
        stroke: '#000',
        strokeThickness: 2
      }).setScrollFactor(0);
      
      // Add world size indicator
      this.add.text(20, 160, `World Size: ${WORLD_WIDTH}x${WORLD_HEIGHT}`, {
        fontSize: '18px',
        color: '#fff',
        stroke: '#000',
        strokeThickness: 2
      }).setScrollFactor(0);
      
      // Add minimap (optional)
      const minimapWidth = 200;
      const minimapHeight = 100;
      const minimapX = this.cameras.main.width - minimapWidth - 20;
      const minimapY = this.cameras.main.height - minimapHeight - 20;
      
      // Create minimap camera
      const minimapCamera = this.cameras.add(minimapX, minimapY, minimapWidth, minimapHeight)
        .setZoom(minimapWidth / WORLD_WIDTH)
        .setName('minimap')
        .setBackgroundColor(0x002244)
        .setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      
      // The camera itself doesn't need setScrollFactor as it's positioned absolutely
      // We can add a player marker to the minimap instead
      const minimapPlayerMarker = this.add.circle(0, 0, 4, 0xffffff)
        .setDepth(1000) // Make sure it's above other elements
        .setName('minimapPlayerMarker');
      
      // Add border around minimap
      const minimapBorder = this.add.rectangle(
        minimapX + minimapWidth / 2, 
        minimapY + minimapHeight / 2, 
        minimapWidth, 
        minimapHeight, 
        0x000000, 
        0
      ).setStrokeStyle(2, 0xffffff).setScrollFactor(0);
      
      // Add spawn point indicators on minimap
      SPAWN_POINTS.forEach((point, index) => {
        const color = index === 0 ? 0x4a6fff : 0xff4a4a;
        const spawnMarker = this.add.circle(
          minimapX + (point.x / WORLD_WIDTH) * minimapWidth,
          minimapY + (point.y / WORLD_HEIGHT) * minimapHeight,
          3, color
        ).setAlpha(0.8);
      });
    }

    // Update game state (runs on every frame)
    function update(this: Phaser.Scene) {
      if (!cursors || !player) return;
      
      // Handle left and right movement
      if (cursors.left.isDown || this.input.keyboard?.checkDown(this.input.keyboard.addKey('A'))) {
        // Move left
        player.setVelocityX(-160);
        player.setFlipX(true); // Flip the sprite to face left
        player.anims.play('left', true);
      } else if (cursors.right.isDown || this.input.keyboard?.checkDown(this.input.keyboard.addKey('D'))) {
        // Move right
        player.setVelocityX(160);
        player.setFlipX(false); // Reset the sprite to face right
        player.anims.play('right', true);
      } else {
        // Stand still
        player.setVelocityX(0);
        player.anims.play('turn');
      }
      
      // Allow jumping if touching the ground, but NOT with spacebar
      if ((cursors.up.isDown || this.input.keyboard?.checkDown(this.input.keyboard.addKey('W'))) && 
          player.body.touching.down) {
        player.setVelocityY(-330);
      }
      
      // Fire bullet with spacebar
      if (spaceKey.isDown) {
        fireBullet(this);
      }
      
      // Clean up bullets that are out of bounds
      bullets.getChildren().forEach((bullet: any) => {
        if (bullet.x < -50 || bullet.x > WORLD_WIDTH + 50 || 
            bullet.y < -50 || bullet.y > WORLD_HEIGHT + 50) {
          // Clean up particle effects
          const emitter = bullet.getData('emitter');
          if (emitter) {
            emitter.destroy();
          }
          bullet.destroy();
        }
      });
      
      // Update minimap player marker position
      const minimapPlayerMarker = this.children.getByName('minimapPlayerMarker');
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
      
      // Update UI elements that need to follow the camera
      const fullscreenButton = this.children.getByName('fullscreenButton');
      if (fullscreenButton) {
        fullscreenButton.setPosition(this.cameras.main.width - 20, 20);
      }
    }

    // Add window resize listener
    window.addEventListener('resize', updateDimensions);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', updateDimensions);
      game.destroy(true);
    };
  }, []);

  return (
    <div className="game-container">
      <div 
        ref={gameRef} 
        className="game-canvas"
      />
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
