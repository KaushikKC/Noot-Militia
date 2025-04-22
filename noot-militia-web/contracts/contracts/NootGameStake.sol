// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IRewardsContract {
    function escrowGameStake(uint256 gameId, address player1, address player2, uint256 totalAmount) external;
}

/**
 * @title NootGameStake
 * @dev Contract for staking NOOT tokens to join 1v1 games
 */
contract NootGameStake is Ownable {
    // NOOT token contract
    IERC20 public nootToken;
    
    // Reference to the rewards contract
    address public rewardsContract;
    
    // Player information struct
    struct PlayerInfo {
        address playerAddress;     // EOA address of the player
        address smartAccount;      // Smart account address
        uint256 stakedAmount;      // Amount of NOOT tokens staked
        bool isStaked;             // Whether the player has staked
    }
    
    // Game state enum
    enum GameState { INACTIVE, STAKING, ACTIVE, COMPLETED }
    
    // Game struct to store game details for 1v1 matches
    struct Game {
        uint256 id;
        uint256 stakeAmount;       // Required stake amount per player
        PlayerInfo player1;
        PlayerInfo player2;
        GameState state;
        uint256 createdAt;
    }
    
    // Game ID counter
    uint256 private gameIdCounter;
    
    // Mapping from game ID to Game struct
    mapping(uint256 => Game) public games;
    
    // Events
    event GameCreated(uint256 indexed gameId, uint256 stakeAmount);
    event PlayerStaked(uint256 indexed gameId, address indexed player, address smartAccount, uint256 amount);
    event GameStaked(uint256 indexed gameId, address player1, address player2);
    event GameStarted(uint256 indexed gameId);
    event GameCompleted(uint256 indexed gameId, address winner);
    
    /**
     * @dev Constructor sets the NOOT token address
     * @param _nootToken Address of the NOOT token contract
     */
    constructor(address _nootToken) Ownable(msg.sender) {
        require(_nootToken != address(0), "Invalid token address");
        nootToken = IERC20(_nootToken);
        gameIdCounter = 1;
    }
    
    /**
     * @dev Sets the rewards contract address
     * @param _rewardsContract Address of the rewards contract
     */
    function setRewardsContract(address _rewardsContract) external onlyOwner {
        require(_rewardsContract != address(0), "Invalid rewards contract address");
        rewardsContract = _rewardsContract;
    }
    
    /**
     * @dev Creates a new game with the specified stake amount
     * @param _stakeAmount Amount of NOOT tokens required to join
     * @return gameId ID of the created game
     */
    function createGame(uint256 _stakeAmount) external onlyOwner returns (uint256) {
        require(_stakeAmount > 0, "Stake amount must be greater than 0");
        
        uint256 gameId = gameIdCounter++;
        
        Game storage newGame = games[gameId];
        newGame.id = gameId;
        newGame.stakeAmount = _stakeAmount;
        newGame.state = GameState.STAKING;
        newGame.createdAt = block.timestamp;
        
        emit GameCreated(gameId, _stakeAmount);
        
        return gameId;
    }
    
    /**
     * @dev Stakes tokens to join a game using player info structs
     * @param _gameId ID of the game to join
     * @param _player1 PlayerInfo struct for player 1
     * @param _player2 PlayerInfo struct for player 2
     */
    function stakeToJoinGame(
        uint256 _gameId,
        PlayerInfo memory _player1,
        PlayerInfo memory _player2
    ) external  {
        Game storage game = games[_gameId];
        
        require(game.state == GameState.STAKING, "Game is not in staking state");
        require(_player1.playerAddress != address(0) && _player2.playerAddress != address(0), "Invalid player addresses");
        require(_player1.smartAccount != address(0) && _player2.smartAccount != address(0), "Invalid smart account addresses");
        require(_player1.stakedAmount == game.stakeAmount && _player2.stakedAmount == game.stakeAmount, "Incorrect stake amounts");
        require(_player1.isStaked && _player2.isStaked, "Both players must be staked");
        
        // Only contract owner or players themselves can submit stakes
        require(
            msg.sender == owner() || 
            msg.sender == _player1.playerAddress || 
            msg.sender == _player2.playerAddress, 
            "Unauthorized"
        );
        
        // Check if players are already in other active games
        require(!game.player1.isStaked, "Player 1 slot is already filled");
        require(!game.player2.isStaked, "Player 2 slot is already filled");
        
        // Store player info in the game
        game.player1 = _player1;
        game.player2 = _player2;
        
        // Calculate total stake
        uint256 totalStake = game.stakeAmount * 2;
        
        // Transfer NOOT tokens from players to this contract
        require(nootToken.transferFrom(_player1.playerAddress, address(this), game.stakeAmount), "Player 1 token transfer failed");
        require(nootToken.transferFrom(_player2.playerAddress, address(this), game.stakeAmount), "Player 2 token transfer failed");
        
        // Emit event that both players have staked
        emit PlayerStaked(_gameId, _player1.playerAddress, _player1.smartAccount, game.stakeAmount);
        emit PlayerStaked(_gameId, _player2.playerAddress, _player2.smartAccount, game.stakeAmount);
        emit GameStaked(_gameId, _player1.playerAddress, _player2.playerAddress);
        
        // Transfer tokens to rewards contract
        transferToRewards(_gameId, totalStake);
    }
    
    /**
     * @dev Alternative staking function that allows individual players to stake
     * @param _gameId ID of the game to join
     * @param _playerAddress EOA address of the player
     * @param _smartAccount Smart account address for the player
     */
    function stake(uint256 _gameId, address _playerAddress, address _smartAccount) external  {
        Game storage game = games[_gameId];
        
        require(game.state == GameState.STAKING, "Game is not in staking state");
        require(_playerAddress != address(0), "Invalid player address");
        require(_smartAccount != address(0), "Invalid smart account address");
        require(msg.sender == _playerAddress || msg.sender == owner(), "Only player or owner can stake");
        
        // Determine which player slot to fill
        if (!game.player1.isStaked) {
            // Fill player 1 slot
            game.player1.playerAddress = _playerAddress;
            game.player1.smartAccount = _smartAccount;
            game.player1.stakedAmount = game.stakeAmount;
            game.player1.isStaked = true;
            
            // Transfer tokens from player to contract
            require(nootToken.transferFrom(_playerAddress, address(this), game.stakeAmount), "Token transfer failed");
            
            emit PlayerStaked(_gameId, _playerAddress, _smartAccount, game.stakeAmount);
        } else if (!game.player2.isStaked) {
            // Fill player 2 slot
            game.player2.playerAddress = _playerAddress;
            game.player2.smartAccount = _smartAccount;
            game.player2.stakedAmount = game.stakeAmount;
            game.player2.isStaked = true;
            
            // Transfer tokens from player to contract
            require(nootToken.transferFrom(_playerAddress, address(this), game.stakeAmount), "Token transfer failed");
            
            emit PlayerStaked(_gameId, _playerAddress, _smartAccount, game.stakeAmount);
            
            // Check if both players have staked
            if (game.player1.isStaked && game.player2.isStaked) {
                emit GameStaked(_gameId, game.player1.playerAddress, game.player2.playerAddress);
                
                // Transfer tokens to rewards contract
                transferToRewards(_gameId, game.stakeAmount * 2);
            }
        } else {
            revert("Game is already full");
        }
    }
    
    /**
     * @dev Internal function to transfer staked tokens to rewards contract
     * @param _gameId ID of the game
     * @param _totalStake Total staked amount
     */
    function transferToRewards(uint256 _gameId, uint256 _totalStake) internal {
        Game storage game = games[_gameId];
        
        // Approve rewards contract to spend tokens
        require(nootToken.approve(rewardsContract, _totalStake), "Approval failed");
        
        // Call the rewards contract to escrow the funds
        IRewardsContract(rewardsContract).escrowGameStake(
            _gameId,
            game.player1.playerAddress,
            game.player2.playerAddress,
            _totalStake
        );
        
        // Update game state
        game.state = GameState.ACTIVE;
        
        emit GameStarted(_gameId);
    }
    
    /**
     * @dev Called by rewards contract when a game is completed
     * @param _gameId ID of the game
     * @param _winner Address of the winner
     */
    function completeGame(uint256 _gameId, address _winner) external {
        require(msg.sender == rewardsContract, "Only rewards contract can complete a game");
        
        Game storage game = games[_gameId];
        require(game.state == GameState.ACTIVE, "Game is not active");
        
        // Verify winner is a player in this game
        require(
            _winner == game.player1.playerAddress || _winner == game.player2.playerAddress,
            "Winner is not a player in this game"
        );
        
        // Update game state
        game.state = GameState.COMPLETED;
        
        emit GameCompleted(_gameId, _winner);
    }
    
    /**
     * @dev Gets player details for a game
     * @param _gameId ID of the game
     * @return player1Address EOA address of player 1
     * @return player1Smart Smart account of player 1
     * @return player2Address EOA address of player 2
     * @return player2Smart Smart account of player 2
     */
    function getGamePlayers(uint256 _gameId) external view returns (
        address player1Address,
        address player1Smart,
        address player2Address,
        address player2Smart
    ) {
        Game storage game = games[_gameId];
        
        return (
            game.player1.playerAddress,
            game.player1.smartAccount,
            game.player2.playerAddress,
            game.player2.smartAccount
        );
    }
    
    /**
     * @dev Gets game state
     * @param _gameId ID of the game
     * @return state Current state of the game
     */
    function getGameState(uint256 _gameId) external view returns (GameState) {
        return games[_gameId].state;
    }
    
    /**
     * @dev Gets stake amount for a game
     * @param _gameId ID of the game
     * @return amount Stake amount for the game
     */
    function getStakeAmount(uint256 _gameId) external view returns (uint256) {
        return games[_gameId].stakeAmount;
    }
}