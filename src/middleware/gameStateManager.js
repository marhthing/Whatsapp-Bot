const EnvironmentManager = require('../core/EnvironmentManager');
const { jidManager } = require('../utils/jidManager');

class GameStateManagerMiddleware {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.botClient = null;
        this.eventBus = null;
        this.gameSessionStore = null;
        this.isInitialized = false;
    }

    async initialize(dependencies) {
        try {
            this.botClient = dependencies.client;
            this.eventBus = dependencies.eventBus;
            this.gameSessionStore = dependencies.gameSessionStore;
            await this.envManager.initialize();

            this.isInitialized = true;
            console.log('🎮 Game state manager middleware initialized');
            return this;

        } catch (error) {
            console.error('Error initializing Game State Manager middleware:', error);
            throw error;
        }
    }

    async process(context) {
        try {
            if (!this.isInitialized) return;

            const { message } = context;
            const messageText = message.body || '';

            // Only process if games are enabled
            if (this.envManager.get('ENABLE_GAMES') !== 'true') {
                return;
            }

            // Check if there's an active game in this chat
            const chatId = message.key.remoteJid;
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);

            if (activeGame) {
                // Check if this message is game input
                if (this.isValidGameInput(messageText, activeGame)) {
                    context.metadata.isGameInput = true;
                    context.metadata.gameInfo = activeGame;
                    await this.handleGameInput(context);
                    return;
                }
            }

            // Check if this is a game command
            const prefix = this.envManager.get('BOT_PREFIX', '.');

            if (messageText.startsWith(prefix)) {
                const command = messageText.substring(prefix.length).trim().split(' ')[0].toLowerCase();

                if (this.isGameCommand(command)) {
                    context.metadata.isGameCommand = true;
                    context.metadata.gameCommand = command;
                }
            }

        } catch (error) {
            console.error('Error in Game State Manager middleware:', error);
            this.eventBus.emit('middleware_error', { 
                middleware: 'GameStateManager', 
                error, 
                message: context.message 
            });
        }
    }

    async handleGameInput(context) {
        const { message } = context;
        const gameInfo = context.metadata.gameInfo;

        try {
            // Mark as valid game input for further processing
            context.metadata.validGameInput = true;
            context.stopped = true; // Stop further processing - game plugin will handle this

            const chatId = message.key.remoteJid;
            // Extract player JID properly - same logic as in TicTacToe plugin
            let player;
            const accessController = this.botClient.getAccessController();
            const ownerJid = accessController.ownerJid;
            
            if (message.key) {
                if (message.key.fromMe) {
                    // For outgoing messages from bot owner
                    player = ownerJid;
                } else {
                    // For incoming messages:
                    // - In groups: participant is the sender
                    // - In individual chats: remoteJid is the sender
                    player = message.key.participant || message.key.remoteJid;
                }
            } else {
                // Fallback for other message structures
                player = message.author || message.from || ownerJid;
            }

            // Use jidManager for proper normalization
            const normalizedPlayer = jidManager.normalizeJid(player);
            
            console.log('🎮 GameStateManager - Extracted player JID:', player, 'Normalized:', normalizedPlayer, 'Chat:', chatId);

            this.eventBus.emit('game_input_received', {
                chatId: chatId,
                gameType: gameInfo.type,
                input: message.body.trim(),
                player: player, // Keep original for logging
                normalizedPlayer: normalizedPlayer, // Use for matching
                gameInfo
            });

        } catch (error) {
            console.error('Error handling game input:', error);
        }
    }

    isGameCommand(command) {
        const gameCommands = ['tictactoe', 'wordguess', 'endgame', 'gameinfo'];
        return gameCommands.includes(command);
    }

    isValidGameInput(input, gameInfo) {
        if (!input || !gameInfo) return false;

        const text = input.trim();

        switch (gameInfo.type) {
            case 'tictactoe':
                // Valid moves are positions 1-9 or 'quit' (case insensitive)
                return /^[1-9]$/.test(text) || text.toLowerCase() === 'quit';

            case 'wordguess':
                // Valid inputs are single letters, 'start', or 'quit'
                const lowerText = text.toLowerCase();
                return /^[a-z]$/.test(lowerText) || lowerText === 'quit' || lowerText === 'start';

            default:
                return false;
        }
    }

    async shutdown() {
        this.isInitialized = false;
    }
}

module.exports = new GameStateManagerMiddleware();