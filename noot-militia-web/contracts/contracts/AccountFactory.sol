// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/libraries/SystemContractsCaller.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/interfaces/IContractDeployer.sol";

contract AccountFactory {
    bytes32 public accountBytecodeHash;

    event AccountCreated(address indexed accountAddress, address indexed owner);

    constructor(bytes32 _accountBytecodeHash) {
        accountBytecodeHash = _accountBytecodeHash;
    }

    function deployAccount(
        address owner,
        bytes32 salt
    ) external returns (address accountAddress) {
        bytes memory encodedConstructorArgs = abi.encode(owner);
        
        // Call the system contract to deploy the account
        (bool success, bytes memory returnData) = SystemContractsCaller
            .systemCallWithReturndata(
                uint32(gasleft()),
                address(DEPLOYER_SYSTEM_CONTRACT),
                uint128(0),
                abi.encodeCall(
                    DEPLOYER_SYSTEM_CONTRACT.create2Account,
                    (
                        salt,
                        accountBytecodeHash,
                        encodedConstructorArgs,
                        IContractDeployer.AccountAbstractionVersion.Version1
                    )
                )
            );
            
        // Check if the deployment was successful
        require(success, "Deployment failed");
        
        // Decode the returned address
        accountAddress = abi.decode(returnData, (address));
        
        // Emit event with the deployed account address
        emit AccountCreated(accountAddress, owner);
        
        return accountAddress;
    }
}