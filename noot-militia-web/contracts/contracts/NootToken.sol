// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/**
 * @title NootToken
 * @dev ERC20 token for testing the NOOT Militia contracts
 */
contract NootToken is ERC20 {
    constructor() ERC20("NOOT", "NOOT") {
        // Mint 1,000,000 tokens to the deployer for testing
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    // Optional function to mint more tokens for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}