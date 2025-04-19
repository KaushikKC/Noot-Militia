// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SmartAccount.sol";

contract SmartAccountFactory {
    // Mapping from EOA addresses to their smart account addresses
    mapping(address => address) public accountRegistry;
    
    // Event emitted when a new smart account is created
    event SmartAccountCreated(address indexed owner, address indexed smartAccount);
    
    /**
     * @dev Deploy a new smart account for a user
     * @param _signature Signature from the EOA proving ownership
     * @return The address of the newly deployed smart account
     */
    function createAccount(bytes calldata _signature) external returns (address) {
        // Extract the signer (EOA) from the signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked("Create Smart Account", msg.sender, block.chainid))
        ));
        
        address owner = _recoverSigner(messageHash, _signature);
        
        // Verify the signature is valid
        require(owner != address(0), "Invalid signature");
        
        // Check if this EOA already has a smart account
        require(accountRegistry[owner] == address(0), "Smart account already exists for this owner");
        
        // Deploy a new smart account with the recovered owner
        SmartAccount smartAccount = new SmartAccount(owner);
        
        // Register the smart account in our mapping
        accountRegistry[owner] = address(smartAccount);
        
        // Emit event
        emit SmartAccountCreated(owner, address(smartAccount));
        
        return address(smartAccount);
    }
    
    /**
     * @dev Get the smart account address for a given EOA
     * @param _owner The EOA address
     * @return The smart account address, or address(0) if none exists
     */
    function getSmartAccount(address _owner) external view returns (address) {
        return accountRegistry[_owner];
    }
    
    /**
     * @dev Check if an EOA has a smart account
     * @param _owner The EOA address
     * @return True if the EOA has a smart account, false otherwise
     */
    function hasSmartAccount(address _owner) external view returns (bool) {
        return accountRegistry[_owner] != address(0);
    }
    
    /**
     * @dev Helper function to recover the signer from a signature
     * @param _hash The message hash that was signed
     * @param _signature The signature bytes
     * @return The address of the signer
     */
    function _recoverSigner(bytes32 _hash, bytes calldata _signature) internal pure returns (address) {
        require(_signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := calldataload(_signature.offset)
            s := calldataload(add(_signature.offset, 32))
            v := byte(0, calldataload(add(_signature.offset, 64)))
        }
        
        // Adjust v for Ethereum's signature format
        if (v < 27) {
            v += 27;
        }
        
        return ecrecover(_hash, v, r, s);
    }
}