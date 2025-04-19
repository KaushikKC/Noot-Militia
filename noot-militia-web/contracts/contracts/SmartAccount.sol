// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/interfaces/IAccount.sol";
import {TransactionHelper} from "@matterlabs/zksync-contracts/l2/system-contracts/libraries/TransactionHelper.sol";
import {SystemContractsCaller} from "@matterlabs/zksync-contracts/l2/system-contracts/libraries/SystemContractsCaller.sol";
import {BOOTLOADER_FORMAL_ADDRESS, NONCE_HOLDER_SYSTEM_CONTRACT, INonceHolder} from "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";

contract SmartAccount is IAccount {
    using TransactionHelper for *;

    // Owner of the smart account (the EOA that can control this account)
    address public owner;

    // Event emitted when the owner is updated
    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);

    constructor(address _owner) {
        owner = _owner;
        emit OwnerUpdated(address(0), _owner);
    }

    modifier onlyBootloader() {
        require(
            msg.sender == BOOTLOADER_FORMAL_ADDRESS,
            "Only bootloader is allowed to call this function"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    // Function to recover the signer from signature
    function _recoverSigner(bytes32 _hash, bytes calldata _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = _extractSignature(_signature);
        return ecrecover(_hash, v, r, s);
    }

    // Helper function to extract signature components
    function _extractSignature(bytes calldata _signature) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(_signature.length == 65, "Invalid signature length");
        
        assembly {
            r := calldataload(_signature.offset)
            s := calldataload(add(_signature.offset, 32))
            v := byte(0, calldataload(add(_signature.offset, 64)))
        }
        
        // Adjust v for Ethereum's signature format
        if (v < 27) {
            v += 27;
        }
    }

    // Step 1: Validate that the transaction is coming from the owner
    function validateTransaction(
        bytes32 _txHash,
        bytes32 _suggestedSignedHash,
        Transaction calldata _transaction
    ) external payable onlyBootloader returns (bytes4 magic) {
        // Get the signature from the transaction data
        bytes calldata signature = _transaction.signature;
        
        // Verify the signature is from the owner
        bytes32 signedHash = _suggestedSignedHash == bytes32(0) ? _txHash : _suggestedSignedHash;
        address recoveredSigner = _recoverSigner(signedHash, signature);
        
        require(recoveredSigner == owner, "Invalid signature: not signed by owner");

        // The mandatory rule is that we increment the nonce
        SystemContractsCaller.systemCallWithPropagatedRevert(
            uint32(gasleft()),
            address(NONCE_HOLDER_SYSTEM_CONTRACT),
            0,
            abi.encodeCall(
                INonceHolder.incrementMinNonceIfEquals,
                (_transaction.nonce)
            )
        );

        // Return success magic value
        magic = ACCOUNT_VALIDATION_SUCCESS_MAGIC;
    }

    // Step 2: Pay for the transaction
    function payForTransaction(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable onlyBootloader {
        bool success = _transaction.payToTheBootloader();
        require(success, "Failed to pay the fee to the operator");
    }

    // Step 3: Execute the transaction
    function executeTransaction(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable onlyBootloader {
        address to = address(uint160(_transaction.to));
        (bool success, ) = to.call{value: _transaction.value}(
            _transaction.data
        );

        require(success, "Failed to execute the transaction");
    }

    // Handle paymaster functionality
    function prepareForPaymaster(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable onlyBootloader {
        _transaction.processPaymasterInput();
    }

    // L1 -> L2 communication
    function executeTransactionFromOutside(
        Transaction calldata _transaction
    ) external payable onlyBootloader {}

    // Function to update owner (only callable by current owner via this contract)
    function updateOwner(address _newOwner) external {
        // This can only be called through executeTransaction which already validates the owner
        require(msg.sender == address(this), "Only callable via executeTransaction");
        require(_newOwner != address(0), "New owner cannot be zero address");
        
        address oldOwner = owner;
        owner = _newOwner;
        
        emit OwnerUpdated(oldOwner, _newOwner);
    }

    fallback() external {
        assert(msg.sender != BOOTLOADER_FORMAL_ADDRESS);
    }

    receive() external payable {}
}