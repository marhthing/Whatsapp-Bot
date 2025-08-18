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
        const messageText = message.body || '';
        const chatId = message.key.remoteJid;
        const accessController = this.botClient.getAccessController();
        const ownerJid = accessController.ownerJid;

        try {
            // Get the actual sender JID
            let sender;
            if (message.key.fromMe) {
                // Message sent by the bot owner through the bot
                sender = ownerJid;
                console.log('🎮 Sender detected as bot owner (fromMe=true):', sender);
            } else {
                // Message from someone else - but could still be the bot owner in some cases
                sender = message.key.participant || message.key.remoteJid;
                console.log('🎮 Sender detected as other user (fromMe=false):', sender);
                
                // Check if this sender is actually the bot owner (normalize and compare)
                if (jidManager.areEqual(sender, ownerJid)) {
                    console.log('🎮 Sender is actually the bot owner (JID match despite fromMe=false)');
                    sender = ownerJid; // Use the canonical owner JID
                }
            }

            console.log('🎮 GameStateManager Debug:');
            console.log('  - Chat ID:', chatId);
            console.log('  - Message text:', messageText);
            console.log('  - Message key:', JSON.stringify(message.key, null, 2));
            console.log('  - Detected sender:', sender);
            console.log('  - Owner JID:', ownerJid);
            console.log('  - fromMe:', message.key.fromMe);

            // Use jidManager for proper normalization
            const normalizedSender = jidManager.normalizeJid(sender);
            console.log('🎮 Normalized sender JID:', normalizedSender);


            // Mark as valid game input for further processing
            context.metadata.validGameInput = true;
            context.stopped = true; // Stop further processing - game plugin will handle this

            console.log('🎮 Game move - Type:', gameInfo.type, 'Player:', sender, 'Input:', `"${messageText}"`, 'Chat:', chatId);
            console.log('🎮 About to emit game_input_received event with data:', {
                chatId,
                input: messageText,
                player: sender,
                normalizedPlayer: normalizedSender,
                gameType: gameInfo.type
            });

            // Emit game input event
            if (this.eventBus) {
                this.eventBus.emit('game_input_received', {
                    chatId,
                    input: messageText,
                    player: sender,
                    normalizedPlayer: normalizedSender,
                    gameType: gameInfo.type,
                    gameInfo,
                    message
                });
                console.log('🎮 Successfully emitted game_input_received event');
            } else {
                console.log('🎮 ERROR: EventBus not available, cannot emit game_input_received event');
            }

        } catch (error) {
            console.error('Error handling game input:', error);
            this.eventBus.emit('middleware_error', {
                middleware: 'GameStateManager',
                error,
                message: context.message
            });
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