"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import logo from "../../public/removed-logo-noot.png";

export default function Home() {
  const [isHovering, setIsHovering] = useState(false);
  const [bullets, setBullets] = useState([]);
  const [particles, setParticles] = useState([]);

  // Create bullet effect
  const createBullet = (startX, startY, angle) => {
    const speed = 15 + Math.random() * 5;
    const lifespan = 40 + Math.random() * 20;

    const newBullet = {
      id: `bullet-${Date.now()}-${Math.random()}`,
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: lifespan,
      size: 3 + Math.random() * 2
    };

    setBullets(prev => [...prev, newBullet]);
  };

  // Create explosion particles
  const createExplosion = (x, y) => {
    const newParticles = [];
    for (let i = 0; i < 30; i++) {
      newParticles.push({
        id: `particle-${Date.now()}-${i}`,
        x,
        y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        size: Math.random() * 8 + 2,
        life: 30 + Math.random() * 20,
        color: [
          "#4ade80",
          "#22c55e",
          "#16a34a",
          "#15803d",
          "#ffb700",
          "#ff9500"
        ][Math.floor(Math.random() * 6)]
      });
    }
    setParticles([...particles, ...newParticles]);
  };

  // Random shooting effect
  useEffect(() => {
    const interval = setInterval(() => {
      // Create random bullets from sides toward center
      const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
      let startX, startY, angle;

      switch (side) {
        case 0: // top
          startX = Math.random() * window.innerWidth;
          startY = -10;
          angle = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
          break;
        case 1: // right
          startX = window.innerWidth + 10;
          startY = Math.random() * window.innerHeight * 0.7;
          angle = Math.PI + (Math.random() - 0.5) * 0.5;
          break;
        case 2: // left
          startX = -10;
          startY = Math.random() * window.innerHeight * 0.7;
          angle = 0 + (Math.random() - 0.5) * 0.5;
          break;
        default:
          // random position on top half
          startX = 50 + Math.random() * (window.innerWidth - 100);
          startY = 50 + Math.random() * (window.innerHeight * 0.4);
          angle = Math.random() * Math.PI * 2;
      }

      createBullet(startX, startY, angle);
    }, 300);

    return () => clearInterval(interval);
  }, []);

  // Update bullets animation
  useEffect(
    () => {
      if (bullets.length === 0) return;

      const timer = setTimeout(() => {
        setBullets(
          bullets
            .map(b => ({
              ...b,
              x: b.x + b.vx,
              y: b.y + b.vy,
              life: b.life - 1
            }))
            .filter(b => b.life > 0)
        );
      }, 30);

      return () => clearTimeout(timer);
    },
    [bullets]
  );

  // Update particles animation
  useEffect(
    () => {
      if (particles.length === 0) return;

      const timer = setTimeout(() => {
        setParticles(
          particles
            .map(p => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
              life: p.life - 1
            }))
            .filter(p => p.life > 0)
        );
      }, 30);

      return () => clearTimeout(timer);
    },
    [particles]
  );

  // Title letter animation
  const titleText = "NOOT MILITIA";
  const letters = titleText.split("");

  return (
    <div className="h-screen w-full overflow-hidden relative">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/game-bg.webp"
          alt="Game Background"
          fill
          style={{ objectFit: "cover" }}
          priority
        />
      </div>

      {/* Overlay to darken slightly and enhance contrast */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Game Title with Letter Animation */}
      <motion.div
        className="absolute top-1/4 left-0 right-0 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        {/* Logo Image */}
        <motion.div
          className="flex justify-center mb-6"
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.3,
            ease: "easeOut"
          }}
        >
          <Image
            src="/removed-logo-noot.png"
            alt="Noot Militia Logo"
            width={150}
            height={150}
            className="drop-shadow-[0_0_15px_rgba(74,222,128,0.7)]"
            priority
          />
        </motion.div>

        <div className="flex justify-center items-center">
          {letters.map((letter, index) =>
            <motion.span
              key={index}
              className="text-7xl font-extrabold text-white inline-block mx-1"
              initial={{ opacity: 0, y: -50 }}
              animate={{
                opacity: 1,
                y: 0,
                textShadow: [
                  "0 0 7px rgba(74, 222, 128, 0.8), 0 0 10px rgba(74, 222, 128, 0.5)",
                  "0 0 10px rgba(74, 222, 128, 1), 0 0 15px rgba(74, 222, 128, 0.8)",
                  "0 0 7px rgba(74, 222, 128, 0.8), 0 0 10px rgba(74, 222, 128, 0.5)"
                ]
              }}
              transition={{
                delay: index * 0.1,
                duration: 0.5,
                textShadow: {
                  duration: 2,
                  repeat: Infinity,
                  repeatType: "reverse"
                }
              }}
            >
              {letter}
            </motion.span>
          )}
        </div>
        <motion.p
          className="text-4xl font-bold text-green-600 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          Climb, shoot, jump — or die !{" "}
        </motion.p>
        <motion.p
          className="text-2xl font-bold text-green-300 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          Powered by $NOOT
        </motion.p>
      </motion.div>

      {/* Flying bullets */}
      {bullets.map(bullet =>
        <motion.div
          key={bullet.id}
          className="absolute rounded-full bg-yellow-400"
          style={{
            left: bullet.x,
            top: bullet.y,
            width: bullet.size,
            height: bullet.size * 0.6,
            transform: `rotate(${Math.atan2(bullet.vy, bullet.vx)}rad)`,
            boxShadow: "0 0 5px rgba(255, 222, 0, 0.8)"
          }}
        >
          {/* Bullet trail */}
          <motion.div
            className="absolute right-full top-1/2 h-px"
            style={{
              width: bullet.size * 3,
              backgroundColor: "rgba(255, 222, 0, 0.7)",
              transformOrigin: "right center"
            }}
          />
        </motion.div>
      )}

      {/* Explosion particles */}
      {particles.map(particle =>
        <motion.div
          key={particle.id}
          className="absolute rounded-full z-20"
          style={{
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color
          }}
          initial={{ opacity: 1 }}
          animate={{ opacity: particle.life / 50 }}
        />
      )}

      {/* Launch Game Button */}
      <div className="absolute left-0 right-0 bottom-32 flex justify-center">
        <motion.button
          className={`relative px-10 py-5 text-2xl font-bold rounded-lg ${isHovering
            ? "bg-green-600"
            : "bg-green-700"} text-white shadow-lg transform transition-all border-2 border-green-500`}
          initial={{ opacity: 0, y: 50 }}
          animate={{
            opacity: 1,
            y: 0,
            boxShadow: isHovering
              ? "0 0 20px rgba(74, 222, 128, 0.8)"
              : "0 0 10px rgba(74, 222, 128, 0.5)"
          }}
          transition={{
            delay: 1.5,
            duration: 0.8,
            boxShadow: {
              duration: 0.3
            }
          }}
          whileHover={{
            scale: 1.05
          }}
          whileTap={{ scale: 0.95 }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Create explosion at button position
            createExplosion(centerX, centerY);

            // Create circular burst of bullets
            for (let i = 0; i < 12; i++) {
              const angle = Math.PI * 2 * i / 12;
              setTimeout(() => {
                createBullet(centerX, centerY, angle);
              }, i * 50);
            }
          }}
        >
          {/* Button Glow Effect */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            animate={{
              boxShadow: isHovering
                ? [
                    "0 0 5px rgba(34, 197, 94, 0.7) inset",
                    "0 0 20px rgba(34, 197, 94, 0.5) inset",
                    "0 0 5px rgba(34, 197, 94, 0.7) inset"
                  ]
                : [
                    "0 0 0px rgba(34, 197, 94, 0) inset",
                    "0 0 5px rgba(34, 197, 94, 0.3) inset",
                    "0 0 0px rgba(34, 197, 94, 0) inset"
                  ]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />

          {/* Button Content with Icon */}
          <div className="flex items-center justify-center">
            <motion.svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              className="mr-3"
              animate={{ rotate: isHovering ? [0, -15, 0, 15, 0] : 0 }}
              transition={{ duration: 0.5, times: [0, 0.2, 0.5, 0.8, 1] }}
            >
              <path
                d="M2 12L22 12M22 12L16 6M22 12L16 18"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
            LAUNCH GAME
          </div>
        </motion.button>
      </div>

      {/* Gun silhouettes on the sides */}
      <motion.div
        className="absolute bottom-16 left-12 w-24 h-16"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 0.8, x: 0 }}
        transition={{ delay: 2, duration: 0.8 }}
      >
        <GunSilhouette flip={false} />
      </motion.div>

      <motion.div
        className="absolute bottom-16 right-12 w-24 h-16"
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 0.8, x: 0 }}
        transition={{ delay: 2, duration: 0.8 }}
      >
        <GunSilhouette flip={true} />
      </motion.div>

      {/* Ammo belt at the bottom */}
      <div className="absolute bottom-6 left-0 w-full overflow-hidden">
        <motion.div
          className="flex justify-center"
          animate={{
            y: [0, -5, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          {Array.from({ length: 20 }).map((_, i) =>
            <motion.div
              key={i}
              className="w-6 h-3 bg-green-700 rounded-sm mx-1 border border-green-500"
              animate={{
                opacity: [0.7, 1, 0.7],
                scale: [
                  i % 3 === 0 ? 1.2 : 1,
                  i % 3 === 0 ? 1 : 1,
                  i % 3 === 0 ? 1.2 : 1
                ]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.1 % 1.5
              }}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

// Gun silhouette component
function GunSilhouette({ flip = false }) {
  return (
    <svg
      viewBox="0 0 120 40"
      className="w-full h-full"
      style={{ transform: flip ? "scaleX(-1)" : "none" }}
    >
      <path
        fill="#15803d"
        d="M10,20 L80,20 L80,25 L100,25 L100,15 L80,15 L80,20 L60,20 L60,10 L40,10 L40,20 L10,20 L10,30 L30,30 L30,25 L40,25 L40,30 L60,30 L60,25 L40,25 L40,20"
        stroke="#22c55e"
        strokeWidth="1"
      />
    </svg>
  );
}
