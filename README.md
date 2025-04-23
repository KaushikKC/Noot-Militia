
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
| SmartAccount Factory Contract | [0xC2D2c621f48ebded2B4C30Cd93132deFc3D8Ef09](https://explorer.testnet.abs.xyz/address/0xC2D2c621f48ebded2B4C30Cd93132deFc3D8Ef09) | Abstract Testnet |
| PayMaster Contract| [0x498f28B0AD8c17c5A3cB05B88680A03726933D0F](https://explorer.testnet.abs.xyz/address/0x498f28B0AD8c17c5A3cB05B88680A03726933D0F) | Abstract Testnet |
| GameMarketPlace Contract | [0x1eC4d1886A29d8fA02F7a701f211BBDA41CF502F](https://explorer.testnet.abs.xyz/address/0x1eC4d1886A29d8fA02F7a701f211BBDA41CF502F) | Abstract Testnet |
| NootRewardsEscrow Contract| [0x15E213E225a43237e6F9172cEa599718d9E9Af55](https://explorer.testnet.abs.xyz/address/0x15E213E225a43237e6F9172cEa599718d9E9Af55) | Abstract Testnet |
| NootGameStake Contract| [0x800a003Fe30F2cfF1E7290D912Da621662B9D6c4](https://explorer.testnet.abs.xyz/address/0x800a003Fe30F2cfF1E7290D912Da621662B9D6c4) | Abstract Testnet |
| NootToken (Official Testnet Token Contract) | [0x3d8b869eb751b63b7077a0a93d6b87a54e6c8f56](https://sepolia.abscan.org/token/0x3d8b869eb751b63b7077a0a93d6b87a54e6c8f56?a=0x783E8D331dDC7503AECD94308F30130Bc8dB3181) | Abstract Testnet |
