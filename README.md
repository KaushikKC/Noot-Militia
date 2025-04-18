# 🕹️ NootMiltia

A Web3-powered 1v1 multiplayer shooter game inspired by MiniMilitia — built for the #nootvibecode hackathon.  
Built using JavaScript, WebSockets, and integrated with Abstract Smart Accounts & the NOOT memecoin for rewards.

> ⚡ Multiplayer | 🔫 Real-Time PvP | 🧠 Web3 Smart Accounts | 💰 NOOT Rewards

## 🚀 Live Demo

👉 [Play NootMiltia](https://your-deployed-game-link.com) (No sign-up required)

---

## 🌐 Tech Stack

- 🎮 Frontend: Next JS (or Phaser.js)
- 🔁 Multiplayer: Node.js WebSocket Server
- 🔗 Blockchain:
  - Abstract SDK (Smart Accounts, Paymaster)
  - NOOT Token (ERC20 memecoin)
  - Solidity Smart Contracts (Base or Testnet)

---

## 🎮 Gameplay Features

- 👤 1v1 Real-time Player-vs-Player
- 🎯 WASD movement + Spacebar to shoot
- 🧱 Obstacles, terrain & strategy zones (coming soon)
- 💀 HP System: get hit → lose HP → die
- 🏆 Winner gets onchain NOOT rewards

---

## 🔗 Web3 Integration

- ✅ Gasless onboarding with Abstract Smart Accounts
- 🪙 NOOT distributed to match winners on-chain
- 📜 Smart contract logs XP, matches, rewards
- 🧾 Rewards are claimable anytime

---

## 📁 Project Structure

```bash
/
├── client/          # Frontend game logic (Canvas, Player, Input)
├── server/          # WebSocket server (matchmaking, sync)
├── contracts/       # Solidity smart contracts
├── scripts/         # Deployment scripts
├── README.md        # This file
