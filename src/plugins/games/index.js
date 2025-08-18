const { TicTacToe } = require('./ticTacToe');
const { WordGuess } = require('./wordGuess');
const { GameStates } = require('./gameStates');

class GamesPlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.commands = {};
        this.gameStates = null;
        this.ticTacToe = null;
        this.wordGuess = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🎮 Initializing Games plugin...');
            
            // Initialize game state management
            this.gameStates = new GameStates(this.botClient, this.eventBus);
            
            // Initialize game engines
            this.ticTacToe = new TicTacToe(this.botClient, this.eventBus, this.gameStates);
            this.wordGuess = new WordGuess(this.botClient, this.eventBus, this.gameStates);
            
            // Initialize commands
            this.initializeCommands();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            this.isInitialized = true;
            console.log('✅ Games plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Games plugin:', error);
            throw error;
        }
    }

    initializeCommands() {
        this.commands = {
            tictactoe: this.startTicTacToe.bind(this),
            wordguess: this.startWordGuess.bind(this),
            endgame: this.endGame.bind(this),
            gameinfo: this.gameInfo.bind(this),
            gamestats: this.gameStats.bind(this)
        };
    }

    setupEventHandlers() {
        // Handle game input from non-owners
        this.eventBus.on('game_input_received', async (data) => {
            await this.handleGameInput(data);
        });
        
        // Handle game state changes
        this.eventBus.on('game_state_changed', (data) => {
            console.log(`🎮 Game state changed in ${data.chatId}: ${data.gameType}`);
        });
    }

    async startTicTacToe(context) {
        try {
            const { args, reply, message } = context;
            const chatId = message.from;
            
            // Check if game already active
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (activeGame) {
                await reply(`🎮 A ${activeGame.type} game is already active in this chat. Use .endgame to stop it first.`);
                return;
            }
            
            // Parse opponent (optional)
            let opponent = null;
            if (args.length > 0) {
                // Handle @mentions or phone numbers
                opponent = args[0].replace('@', '').replace(/\D/g, '');
                if (opponent) {
                    opponent += '@s.whatsapp.net';
                }
            }
            
            // Start the game
            const gameResult = await this.ticTacToe.startGame(chatId, message.author || message.from, opponent);
            
            if (gameResult.success) {
                await reply(gameResult.message);
                
                // Register game with access controller
                accessController.startGame(chatId, 'tictactoe', {
                    startedBy: message.author || message.from,
                    players: gameResult.players,
                    state: 'active'
                });
            } else {
                await reply(gameResult.message);
            }
            
        } catch (error) {
            console.error('Error starting tic-tac-toe:', error);
            await context.reply('❌ Error starting tic-tac-toe game');
        }
    }

    async startWordGuess(context) {
        try {
            const { reply, message } = context;
            const chatId = message.from;
            
            // Check if game already active
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (activeGame) {
                await reply(`🎮 A ${activeGame.type} game is already active in this chat. Use .endgame to stop it first.`);
                return;
            }
            
            // Start the game
            const gameResult = await this.wordGuess.startGame(chatId, message.author || message.from);
            
            if (gameResult.success) {
                await reply(gameResult.message);
                
                // Register game with access controller
                accessController.startGame(chatId, 'wordguess', {
                    startedBy: message.author || message.from,
                    players: [message.author || message.from],
                    state: 'active'
                });
            } else {
                await reply(gameResult.message);
            }
            
        } catch (error) {
            console.error('Error starting word guess:', error);
            await context.reply('❌ Error starting word guess game');
        }
    }

    async endGame(context) {
        try {
            const { reply, message } = context;
            const chatId = message.from;
            
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (!activeGame) {
                await reply('❌ No active game in this chat');
                return;
            }
            
            // End the game based on type
            let result;
            if (activeGame.type === 'tictactoe') {
                result = await this.ticTacToe.endGame(chatId);
            } else if (activeGame.type === 'wordguess') {
                result = await this.wordGuess.endGame(chatId);
            }
            
            if (result && result.success) {
                await reply(result.message);
                
                // Unregister game from access controller
                accessController.endGame(chatId);
            } else {
                await reply('❌ Error ending game');
            }
            
        } catch (error) {
            console.error('Error ending game:', error);
            await context.reply('❌ Error ending game');
        }
    }

    async gameInfo(context) {
        try {
            const { reply, message } = context;
            const chatId = message.from;
            
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (!activeGame) {
                await reply('❌ No active game in this chat');
                return;
            }
            
            // Get game info based on type
            let info;
            if (activeGame.type === 'tictactoe') {
                info = await this.ticTacToe.getGameInfo(chatId);
            } else if (activeGame.type === 'wordguess') {
                info = await this.wordGuess.getGameInfo(chatId);
            }
            
            if (info) {
                await reply(info);
            } else {
                await reply('❌ Error retrieving game information');
            }
            
        } catch (error) {
            console.error('Error getting game info:', error);
            await context.reply('❌ Error retrieving game information');
        }
    }

    async gameStats(context) {
        try {
            const { reply } = context;
            
            const stats = this.gameStates.getGlobalStats();
            
            const statsText = `🎮 **Game Statistics**\n\n` +
                            `**Total Games Played:** ${stats.totalGames}\n` +
                            `**Active Games:** ${stats.activeGames}\n` +
                            `**Tic-Tac-Toe Games:** ${stats.ticTacToeGames || 0}\n` +
                            `**Word Guess Games:** ${stats.wordGuessGames || 0}\n\n` +
                            `**Most Active Players:**\n` +
                            (stats.topPlayers || []).slice(0, 5).map((player, i) => 
                                `${i + 1}. Player ${player.id.split('@')[0]}: ${player.games} games`
                            ).join('\n') || 'No data available';
            
            await reply(statsText);
            
        } catch (error) {
            console.error('Error getting game stats:', error);
            await context.reply('❌ Error retrieving game statistics');
        }
    }

    async executeCommand(commandName, context) {
        try {
            if (!this.isInitialized) {
                throw new Error('Games plugin not initialized');
            }

            const handler = this.commands[commandName];
            if (!handler) {
                throw new Error(`Unknown command: ${commandName}`);
            }

            return await handler(context);
            
        } catch (error) {
            console.error(`❌ Error executing games command '${commandName}':`, error);
            await context.reply(`❌ Error executing command: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async handleGameInput(data) {
        try {
            const { chatId, gameType, input, player, gameInfo } = data;
            
            let result;
            if (gameType === 'tictactoe') {
                result = await this.ticTacToe.handleInput(chatId, input, player);
            } else if (gameType === 'wordguess') {
                result = await this.wordGuess.handleInput(chatId, input, player);
            }
            
            if (result) {
                // Send game response
                await this.botClient.sendMessage(chatId, result.message);
                
                // Check if game ended
                if (result.gameEnded) {
                    const accessController = this.botClient.getAccessController();
                    accessController.endGame(chatId);
                }
            }
            
        } catch (error) {
            console.error('Error handling game input:', error);
        }
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down Games plugin...');
            
            // End all active games
            if (this.gameStates) {
                await this.gameStates.endAllGames();
            }
            
            this.isInitialized = false;
            
            console.log('✅ Games plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during Games plugin shutdown:', error);
        }
    }
}

module.exports = GamesPlugin;
