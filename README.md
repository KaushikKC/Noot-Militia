
# 🕹️ NootMiltia

A Web3-powered 1v1 multiplayer shooter game inspired by MiniMilitia — built for the #nootvibecode hackathon.  
Built using JavaScript, WebSockets, and integrated with Abstract Smart Accounts & the NOOT memecoin for rewards.

<div align="center">
  
> ⚡ Multiplayer | 🔫 Real-Time PvP | 🧠 Web3 Smart Accounts | 💰 NOOT Rewards

</div>

## 🚀 Live Demo

👉 [Play NootMiltia](https://your-deployed-game-link.com) (No sign-up required)

## 🌐 Tech Stack

- **🎮 Frontend:** Next JS (or Phaser.js)
- **🔁 Multiplayer:** Node.js WebSocket Server
- **🔗 Blockchain:**
  - Abstract SDK (Smart Accounts, Paymaster)
  - NOOT Token (ERC20 memecoin)
  - Solidity Smart Contracts (Abstract Testnet)

## 🎮 Gameplay Features

- **👤 1v1 Real-time Player-vs-Player**
- **🎯 Controls:** WASD movement + Spacebar to shoot
- **🧱 Environment:** Obstacles, terrain & strategy zones (coming soon)
- **💀 HP System:** get hit → lose HP → die
- **🏆 Rewards:** Winner gets onchain NOOT rewards

## 🔗 Web3 Integration

- ✅ **Gasless onboarding** with Abstract Smart Accounts
- 🪙 **NOOT distributed** to match winners on-chain
- 📜 Smart contract logs XP, matches, rewards
- 🧾 Rewards are claimable anytime

## 📁 Project Structure

```bash
/
├── client/          # Frontend game logic (Canvas, Player, Input)
├── server/          # WebSocket server (matchmaking, sync)
├── contracts/       # Solidity smart contracts
├── scripts/         # Deployment scripts
├── README.md        # This file
```

## 🔐 Deployed Contract Addresses (Abstract Testnet)

| Contract | Address | Network |
|----------|---------|---------|
| Factory Contract | [0xC2D2c621f48ebded2B4C30Cd93132deFc3D8Ef09](https://explorer.testnet.abs.xyz/address/0xC2D2c621f48ebded2B4C30Cd93132deFc3D8Ef09) | Abstract Testnet |
| PayMaster | [0x498f28B0AD8c17c5A3cB05B88680A03726933D0F](https://explorer.testnet.abs.xyz/address/0x498f28B0AD8c17c5A3cB05B88680A03726933D0F) | Abstract Testnet |
| GameMarketPlace Contract | [0x1eC4d1886A29d8fA02F7a701f211BBDA41CF502F](https://explorer.testnet.abs.xyz/address/0x1eC4d1886A29d8fA02F7a701f211BBDA41CF502F) | Abstract Testnet |
| GameRewards | 0x0987654321098765432109876543210987654321 | Abstract Testnet |
| NootToken | 0xabcdef1234567890abcdef1234567890abcdef12 | Abstract Testnet |
