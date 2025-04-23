import * as hre from "hardhat";
import { Provider, Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";
import { ethers } from "ethers";
import { vars } from "hardhat/config";

import "@matterlabs/hardhat-zksync-node/dist/type-extensions";
import "@matterlabs/hardhat-zksync-verify/dist/src/type-extensions";

// Import utility functions from the reference file
import { deployContract, getWallet } from "./payMasterDeploy";

// The PayMaster address that will be set after deployment
const PAYMASTER_ADDRESS = "0x498f28B0AD8c17c5A3cB05B88680A03726933D0F";

async function main() {
  console.log(`\n🚀 Starting deployment of GameAssetMarketplace contract...`);
  
  // Get the wallet using the utility function
  const wallet = getWallet();
  console.log(`\n👛 Using wallet: ${wallet.address}`);
  
  // Deploy the GameAssetMarketplace contract
  const gameAssetMarketplace = await deployContract("GameAssetMarketplace");
  const contractAddress = await gameAssetMarketplace.getAddress();
  console.log(`\n✅ GameAssetMarketplace deployed at: ${contractAddress}`);
  
  // Set the PayMaster address
  console.log(`\n🔄 Setting PayMaster address to: ${PAYMASTER_ADDRESS}`);
  
  try {
    const tx = await gameAssetMarketplace.setPayMaster(PAYMASTER_ADDRESS);
    console.log(`\n⏳ Transaction sent, waiting for confirmation...`);
    
    const receipt = await tx.wait();
    console.log(`\n✅ PayMaster successfully set! Transaction hash: ${receipt.hash}`);
    
    // Verify the PayMaster is set correctly
    const currentPayMaster = await gameAssetMarketplace.payMaster();
    console.log(`\n🔍 Verified current PayMaster address: ${currentPayMaster}`);
    
    if (currentPayMaster.toLowerCase() === PAYMASTER_ADDRESS.toLowerCase()) {
      console.log(`\n🎉 Deployment and configuration completed successfully!`);
    } else {
      console.error(`\n⚠️ PayMaster verification failed. Expected: ${PAYMASTER_ADDRESS}, Got: ${currentPayMaster}`);
    }
  } catch (error) {
    console.error(`\n❌ Error setting PayMaster address:`, error);
    throw error;
  }
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