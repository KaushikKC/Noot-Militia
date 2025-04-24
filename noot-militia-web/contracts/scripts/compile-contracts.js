
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Define paths
const contractsPath = path.join(__dirname, '../contracts');
const abiOutputPath = path.join(__dirname, '../src/abi');

// List of contract files to compile
const contractFiles = [
  'AccountFactory.sol',
  'GameAssetMarketplace.sol',
  'NootGameStake.sol',
  'NootRewardsEscrow.sol',
  'PayMaster.sol',
];

// Ensure the ABI directory exists
if (!fs.existsSync(abiOutputPath)) {
  fs.mkdirSync(abiOutputPath, { recursive: true });
}

async function compileContracts() {
  try {
    // First, make sure hardhat is installed
    console.log('Checking if Hardhat is installed...');
    try {
      await execPromise('npx hardhat --version');
      console.log('Hardhat is installed.');
    } catch (error) {
      console.log('Hardhat not found. Installing Hardhat...');
      await execPromise('npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox');
      console.log('Hardhat installed successfully.');
    }

    // Check if contracts exist
    for (const contractFile of contractFiles) {
      const contractFilePath = path.join(contractsPath, contractFile);
      if (!fs.existsSync(contractFilePath)) {
        console.error(`Contract file not found: ${contractFilePath}`);
        console.log('Please make sure all contract files exist before compilation.');
        return;
      }
    }

    // Compile contracts
    console.log('Compiling contracts...');
    await execPromise('npx hardhat compile');
    console.log('Contracts compiled successfully.');

    // Extract ABI for each contract
    console.log('Extracting ABIs...');
    
    // For ZKSync projects, artifacts are stored in 'artifacts-zk' instead of 'artifacts'
    const artifactsPath = path.join(__dirname, '../artifacts-zk/contracts');
    
    // Check if artifacts-zk exists, if not, try the standard artifacts directory
    if (!fs.existsSync(artifactsPath)) {
      console.log("Warning: Could not find artifacts-zk directory. Trying standard artifacts directory...");
      const standardArtifactsPath = path.join(__dirname, '../artifacts/contracts');
      if (fs.existsSync(standardArtifactsPath)) {
        console.log("Found standard artifacts directory.");
        findAndExtractABIs(standardArtifactsPath);
      } else {
        console.error("Error: Could not find artifacts directory. Compilation may have failed or using a non-standard directory structure.");
      }
    } else {
      console.log("Found ZKSync artifacts directory.");
      findAndExtractABIs(artifactsPath);
    }
  } catch (error) {
    console.error('Error during compilation:', error);
  }
}

function findAndExtractABIs(artifactsPath) {
  let foundArtifacts = false;
  
  for (const contractFile of contractFiles) {
    // Get contract name without extension
    const contractName = path.basename(contractFile, '.sol');
    
    // Try to find the artifact (ZKSync format might be different)
    let artifactPath = path.join(artifactsPath, `${contractFile}/${contractName}.json`);
    
    // If not found, try to find it in the root contracts directory
    if (!fs.existsSync(artifactPath)) {
      artifactPath = path.join(artifactsPath, `${contractName}.json`);
    }
    
    // If still not found, try to search recursively for the artifact
    if (!fs.existsSync(artifactPath)) {
      console.log(`Searching for ${contractName} artifact...`);
      const artifactFile = findArtifactFile(artifactsPath, `${contractName}.json`);
      
      if (artifactFile) {
        artifactPath = artifactFile;
        console.log(`Found artifact at: ${artifactPath}`);
      } else {
        console.error(`Artifact not found for contract: ${contractName}`);
        continue;
      }
    }
    
    try {
      // Read the artifact JSON
      const artifactContent = fs.readFileSync(artifactPath, 'utf8');
      const artifact = JSON.parse(artifactContent);
      
      // Extract the ABI
      const abi = artifact.abi;
      
      if (!abi) {
        console.error(`No ABI found in artifact for ${contractName}`);
        continue;
      }
      
      // Write the ABI to a separate file
      const abiFilePath = path.join(abiOutputPath, `${contractName}.json`);
      fs.writeFileSync(abiFilePath, JSON.stringify(abi, null, 2));
      
      console.log(`ABI extracted for ${contractName} at ${abiFilePath}`);
      foundArtifacts = true;
    } catch (error) {
      console.error(`Error processing artifact for ${contractName}:`, error.message);
    }
  }
  
  if (foundArtifacts) {
    console.log('All ABIs extracted successfully.');
  } else {
    console.error('Failed to extract any ABIs. Please check if compilation was successful.');
  }
}

// Helper function to recursively search for an artifact file
function findArtifactFile(directory, filename) {
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) {
    return null;
  }
  
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const fullPath = path.join(directory, file);
    
    if (fs.lstatSync(fullPath).isDirectory()) {
      const result = findArtifactFile(fullPath, filename);
      if (result) {
        return result;
      }
    } else if (file === filename) {
      return fullPath;
    }
  }
  
  return null;
}

compileContracts();
