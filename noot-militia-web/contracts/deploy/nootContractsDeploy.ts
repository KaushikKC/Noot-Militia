import * as hre from "hardhat";
import { Provider, Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";
import { ethers } from "ethers";
import { vars } from "hardhat/config";

import "@matterlabs/hardhat-zksync-node/dist/type-extensions";
import "@matterlabs/hardhat-zksync-verify/dist/src/type-extensions";

// Import utility functions from the reference file
import { deployContract, getWallet } from "./payMasterDeploy";

// The NOOT token address to be passed to the constructors
const NOOT_TOKEN_ADDRESS = "0x3d8b869eb751b63b7077a0a93d6b87a54e6c8f56";

async function main() {
  console.log(`\n🚀 Starting deployment of Noot contracts...`);
  
  // Get the wallet using the utility function
  const wallet = getWallet();
  console.log(`\n👛 Using wallet: ${wallet.address}`);
  
  // 1. Deploy the NootRewardsEscrow contract first
  console.log(`\n⏳ Deploying NootRewardsEscrow contract...`);
  const nootRewardsEscrow = await deployContract(
    "NootRewardsEscrow", 
    [NOOT_TOKEN_ADDRESS]
  );
  const rewardsContractAddress = await nootRewardsEscrow.getAddress();
  console.log(`\n✅ NootRewardsEscrow deployed at: ${rewardsContractAddress}`);
  
  // 2. Deploy the NootGameStake contract
  console.log(`\n⏳ Deploying NootGameStake contract...`);
  const nootGameStake = await deployContract(
    "NootGameStake", 
    [NOOT_TOKEN_ADDRESS]
  );
  const gameStakeContractAddress = await nootGameStake.getAddress();
  console.log(`\n✅ NootGameStake deployed at: ${gameStakeContractAddress}`);
  
  // 3. Set the rewards contract address in the NootGameStake contract
  console.log(`\n🔄 Setting RewardsContract address in NootGameStake...`);
  try {
    const setRewardsContractTx = await nootGameStake.setRewardsContract(rewardsContractAddress);
    console.log(`\n⏳ Transaction sent, waiting for confirmation...`);
    
    const rewardsSetReceipt = await setRewardsContractTx.wait();
    console.log(`\n✅ RewardsContract successfully set! Transaction hash: ${rewardsSetReceipt.hash}`);
    
    // Verify the rewards contract is set correctly
    const currentRewardsContract = await nootGameStake.rewardsContract();
    console.log(`\n🔍 Verified current RewardsContract address: ${currentRewardsContract}`);
    
    if (currentRewardsContract.toLowerCase() === rewardsContractAddress.toLowerCase()) {
      console.log(`\n✅ RewardsContract address verification passed!`);
    } else {
      console.error(`\n⚠️ RewardsContract verification failed. Expected: ${rewardsContractAddress}, Got: ${currentRewardsContract}`);
    }
  } catch (error) {
    console.error(`\n❌ Error setting RewardsContract address:`, error);
    throw error;
  }
  
  // 4. Set the game stake contract address in the NootRewardsEscrow contract
  console.log(`\n🔄 Setting GameStakeContract address in NootRewardsEscrow...`);
  try {
    const setGameStakeTx = await nootRewardsEscrow.setGameStakeContract(gameStakeContractAddress);
    console.log(`\n⏳ Transaction sent, waiting for confirmation...`);
    
    const gameStakeSetReceipt = await setGameStakeTx.wait();
    console.log(`\n✅ GameStakeContract successfully set! Transaction hash: ${gameStakeSetReceipt.hash}`);
    
    // Verify the game stake contract is set correctly
    const currentGameStakeContract = await nootRewardsEscrow.gameStakeContract();
    console.log(`\n🔍 Verified current GameStakeContract address: ${currentGameStakeContract}`);
    
    if (currentGameStakeContract.toLowerCase() === gameStakeContractAddress.toLowerCase()) {
      console.log(`\n✅ GameStakeContract address verification passed!`);
    } else {
      console.error(`\n⚠️ GameStakeContract verification failed. Expected: ${gameStakeContractAddress}, Got: ${currentGameStakeContract}`);
    }
  } catch (error) {
    console.error(`\n❌ Error setting GameStakeContract address:`, error);
    throw error;
  }
  
  // 5. Summary of deployments
  console.log(`\n🎉 Deployment and configuration completed successfully!`);
  console.log(`\n📝 Deployment Summary:`);
  console.log(`   NOOT Token: ${NOOT_TOKEN_ADDRESS}`);
  console.log(`   NootRewardsEscrow: ${rewardsContractAddress}`);
  console.log(`   NootGameStake: ${gameStakeContractAddress}`);
}

// Execute the deployment function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// Export for hardhat script execution
export default main;