// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IGameStake {
    function completeGame(uint256 _gameId, address _winner) external;
}

/**
 * @title NootRewardsEscrow
 * @dev Contract for managing escrowed NOOT tokens and distributing rewards for 1v1 games
 */
contract NootRewardsEscrow is Ownable {
    // NOOT token contract
    IERC20 public nootToken;
    
    // Reference to the game stake contract
    address public gameStakeContract;
    
    // Player result struct
    struct PlayerResult {
        address playerAddress;  // EOA address of the player
        uint256 killCount;      // Number of kills the player achieved
    }
    
    // Game reward struct for 1v1 games
    struct GameReward {
        uint256 id;
        uint256 totalAmount;
        address player1;
        address player2;
        bool distributed;
        address winner;
        mapping(address => uint256) killCounts;
        bool resultProcessed;
    }
    
    // Mapping from game ID to GameReward
    mapping(uint256 => GameReward) public gameRewards;
    
    // Events
    event StakeEscrowed(uint256 indexed gameId, uint256 totalAmount, address player1, address player2);
    event GameResultReceived(uint256 indexed gameId, address player1, uint256 kills1, address player2, uint256 kills2);
    event RewardDistributed(uint256 indexed gameId, address indexed winner, uint256 amount);
    
    /**
     * @dev Constructor sets the NOOT token address
     * @param _nootToken Address of the NOOT token contract
     */
    constructor(address _nootToken) Ownable(msg.sender) {
        require(_nootToken != address(0), "Invalid token address");
        nootToken = IERC20(_nootToken);
    }
    
    /**
     * @dev Sets the game stake contract address
     * @param _gameStakeContract Address of the game stake contract
     */
    function setGameStakeContract(address _gameStakeContract) external onlyOwner {
        require(_gameStakeContract != address(0), "Invalid game stake contract address");
        gameStakeContract = _gameStakeContract;
    }
    
    /**
     * @dev Escrows the stake from a 1v1 game
     * @param _gameId ID of the game
     * @param _player1 Address of player 1
     * @param _player2 Address of player 2
     * @param _totalAmount Total amount of tokens staked
     */
    function escrowGameStake(
        uint256 _gameId,
        address _player1,
        address _player2,
        uint256 _totalAmount
    ) external {
        require(msg.sender == gameStakeContract, "Only game stake contract can call this");
        require(_player1 != address(0) && _player2 != address(0), "Invalid player addresses");
        require(_totalAmount > 0, "Amount must be greater than 0");
        
        // Transfer tokens from game stake contract to this contract
        require(nootToken.transferFrom(gameStakeContract, address(this), _totalAmount), "Token transfer failed");
        
        // Store the game reward information
        GameReward storage reward = gameRewards[_gameId];
        reward.id = _gameId;
        reward.totalAmount = _totalAmount;
        reward.player1 = _player1;
        reward.player2 = _player2;
        reward.distributed = false;
        reward.resultProcessed = false;
        
        emit StakeEscrowed(_gameId, _totalAmount, _player1, _player2);
    }
    
    /**
     * @dev Updates game results with kill counts from the backend
     * @param _gameId ID of the game
     * @param _player1Result PlayerResult struct for player 1
     * @param _player2Result PlayerResult struct for player 2
     */
    function updateGameResult(
        uint256 _gameId,
        PlayerResult calldata _player1Result,
        PlayerResult calldata _player2Result
    ) external onlyOwner {
        GameReward storage reward = gameRewards[_gameId];
        
        require(!reward.distributed, "Rewards already distributed");
        require(!reward.resultProcessed, "Game result already processed");
        
        // Verify these are the correct players for this game
        require(
            (_player1Result.playerAddress == reward.player1 && _player2Result.playerAddress == reward.player2) ||
            (_player1Result.playerAddress == reward.player2 && _player2Result.playerAddress == reward.player1),
            "Player addresses don't match game players"
        );
        
        // Record kill counts
        reward.killCounts[_player1Result.playerAddress] = _player1Result.killCount;
        reward.killCounts[_player2Result.playerAddress] = _player2Result.killCount;
        
        // Determine winner based on kill count
        if (_player1Result.killCount > _player2Result.killCount) {
            reward.winner = _player1Result.playerAddress;
        } else if (_player2Result.killCount > _player1Result.killCount) {
            reward.winner = _player2Result.playerAddress;
        } else {
            // In case of a tie, player 1 wins (or implement your own tie-breaking logic)
            reward.winner = _player1Result.playerAddress;
        }
        
        reward.resultProcessed = true;
        
        emit GameResultReceived(
            _gameId,
            _player1Result.playerAddress,
            _player1Result.killCount,
            _player2Result.playerAddress,
            _player2Result.killCount
        );
    }
    
    /**
     * @dev Alternative method to update game results with JSON-like structure
     * @param _gameId ID of the game
     * @param _players Array of player addresses [player1, player2]
     * @param _killCounts Array of kill counts [player1Kills, player2Kills]
     */
    function updateGameResultFromJSON(
        uint256 _gameId,
        address[2] calldata _players,
        uint256[2] calldata _killCounts
    ) external onlyOwner  {
        GameReward storage reward = gameRewards[_gameId];
        
        require(!reward.distributed, "Rewards already distributed");
        require(!reward.resultProcessed, "Game result already processed");
        
        // Verify these are the correct players for this game
        require(
            (_players[0] == reward.player1 && _players[1] == reward.player2) ||
            (_players[0] == reward.player2 && _players[1] == reward.player1),
            "Player addresses don't match game players"
        );
        
        // Record kill counts
        reward.killCounts[_players[0]] = _killCounts[0];
        reward.killCounts[_players[1]] = _killCounts[1];
        
        // Determine winner based on kill count
        if (_killCounts[0] > _killCounts[1]) {
            reward.winner = _players[0];
        } else if (_killCounts[1] > _killCounts[0]) {
            reward.winner = _players[1];
        } else {
            // In case of a tie, first player in the array wins
            reward.winner = _players[0];
        }
        
        reward.resultProcessed = true;
        
        emit GameResultReceived(
            _gameId,
            _players[0],
            _killCounts[0],
            _players[1],
            _killCounts[1]
        );
    }
    
    /**
     * @dev Distributes rewards to the winner of a game
     * @param _gameId ID of the game
     */
    function distributeRewards(uint256 _gameId) external onlyOwner  {
        GameReward storage reward = gameRewards[_gameId];
        
        require(!reward.distributed, "Rewards already distributed");
        require(reward.resultProcessed, "Game result not processed yet");
        require(reward.winner != address(0), "Winner not determined");
        
        address winner = reward.winner;
        uint256 rewardAmount = reward.totalAmount;
        
        // Mark rewards as distributed
        reward.distributed = true;
        
        // Transfer rewards to the winner
        require(nootToken.transfer(winner, rewardAmount), "Reward transfer failed");
        
        // Notify game stake contract that the game is completed
        IGameStake(gameStakeContract).completeGame(_gameId, winner);
        
        emit RewardDistributed(_gameId, winner, rewardAmount);
    }
    
    /**
     * @dev Emergency function to return tokens if a game is cancelled
     * @param _gameId ID of the game
     */
    function emergencyCancelGame(uint256 _gameId) external onlyOwner  {
        GameReward storage reward = gameRewards[_gameId];
        
        require(!reward.distributed, "Rewards already distributed");
        
        uint256 halfAmount = reward.totalAmount / 2;
        
        // Mark rewards as distributed to prevent double distribution
        reward.distributed = true;
        
        // Return half of the stake to each player
        require(nootToken.transfer(reward.player1, halfAmount), "Player 1 token return failed");
        require(nootToken.transfer(reward.player2, halfAmount), "Player 2 token return failedd");
    }
    
    /**
     * @dev Gets game data including kill counts
     * @param _gameId ID of the game
     * @return player1 Address of player 1
     * @return player2 Address of player 2
     * @return kills1 Kill count for player 1
     * @return kills2 Kill count for player 2
     * @return winner Address of the winner (if determined)
     * @return processed Whether the game result has been processed
     */
    function getGameResult(uint256 _gameId) 
        external 
        view 
        returns (
            address player1,
            address player2,
            uint256 kills1,
            uint256 kills2,
            address winner,
            bool processed
        ) 
    {
        GameReward storage reward = gameRewards[_gameId];
        
        return (
            reward.player1,
            reward.player2,
            reward.killCounts[reward.player1],
            reward.killCounts[reward.player2],
            reward.winner,
            reward.resultProcessed
        );
    }
    
    /**
     * @dev Gets the reward status of a game
     * @param _gameId ID of the game
     * @return totalAmount Total amount escrowed
     * @return distributed Whether rewards have been distributed
     * @return winner Address of the winner (if determined)
     */
    function getRewardStatus(uint256 _gameId) 
        external 
        view 
        returns (uint256 totalAmount, bool distributed, address winner) 
    {
        GameReward storage reward = gameRewards[_gameId];
        return (reward.totalAmount, reward.distributed, reward.winner);
    }
}