class EndGamePlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🛑 Initializing EndGame plugin...');
            
            this.isInitialized = true;
            console.log('✅ EndGame plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize EndGame plugin:', error);
            throw error;
        }
    }

    async executeCommand(commandName, context) {
        try {
            if (!this.isInitialized) {
                throw new Error('EndGame plugin not initialized');
            }

            switch (commandName) {
                case 'endgame':
                    return await this.endGame(context);
                case 'quit':
                    return await this.endGame(context);
                default:
                    throw new Error(`Unknown command: ${commandName}`);
            }
            
        } catch (error) {
            console.error(`❌ Error executing EndGame command '${commandName}':`, error);
            await context.reply(`❌ Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async endGame(context) {
        try {
            const { reply, message } = context;
            const chatId = message.key.remoteJid;
            
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (!activeGame) {
                await reply('❌ No active game in this chat');
                return { success: false, message: 'No active game' };
            }
            
            // Get the appropriate game plugin to end the game
            const pluginDiscovery = this.botClient.pluginDiscovery;
            let result = { success: false, message: 'Error ending game' };
            
            try {
                // Try to get the specific game plugin
                const gamePlugin = pluginDiscovery.plugins.get(activeGame.type);
                if (gamePlugin && gamePlugin.instance.endGame) {
                    result = await gamePlugin.instance.endGame(chatId);
                }
            } catch (error) {
                console.log('Could not end game through plugin, using fallback');
            }
            
            // Always unregister game from access controller
            accessController.endGame(chatId);
            
            // Emit game ended event
            this.eventBus.emit('game_ended', {
                chatId,
                gameType: activeGame.type,
                reason: 'manual'
            });
            
            const gameType = activeGame.type || 'game';
            await reply(`🛑 **Game Ended!**\n\nThe ${gameType} has been stopped.`);
            
            return { success: true, message: 'Game ended successfully' };
            
        } catch (error) {
            console.error('Error ending game:', error);
            await context.reply('❌ Error ending game');
            return { success: false, error: error.message };
        }
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down EndGame plugin...');
            this.isInitialized = false;
            console.log('✅ EndGame plugin shutdown complete');
        } catch (error) {
            console.error('Error during EndGame plugin shutdown:', error);
        }
    }
}

module.exports = EndGamePlugin;