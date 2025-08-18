const { EnvironmentManager } = require('../core/EnvironmentManager');

class LoadingReactionMiddleware {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.botClient = null;
        this.eventBus = null;
        this.isInitialized = false;
    }

    async initialize(botClient, eventBus) {
        try {
            this.botClient = botClient;
            this.eventBus = eventBus;
            await this.envManager.initialize();
            
            this.isInitialized = true;
            return this;
            
        } catch (error) {
            console.error('Error initializing Loading Reaction middleware:', error);
            throw error;
        }
    }

    async process(context) {
        try {
            if (!this.isInitialized) return;
            
            const { message } = context;
            const messageText = message.body || '';
            const prefix = this.envManager.get('BOT_PREFIX', '.');
            
            // Only show loading reaction for commands from owner
            if (!messageText.startsWith(prefix)) {
                return;
            }
            
            const accessController = this.botClient.getAccessController();
            const isOwner = await accessController.isOwner(message.from);
            
            if (isOwner && context.metadata.accessGranted) {
                // Show loading reaction for owner's commands
                await this.botClient.showLoadingReaction(message);
                
                context.metadata.loadingReactionShown = true;
                
                // Set up automatic removal after timeout
                const loadingReaction = this.botClient.getLoadingReaction();
                if (loadingReaction) {
                    // The loading reaction will auto-remove after timeout
                    // but we'll also remove it when command processing completes
                }
            }
            
        } catch (error) {
            console.error('Error in Loading Reaction middleware:', error);
            this.eventBus.emit('middleware_error', { 
                middleware: 'LoadingReaction', 
                error, 
                message: context.message 
            });
        }
    }

    async shutdown() {
        this.isInitialized = false;
    }
}

module.exports = {
    loadingReaction: {
        initialize: async (botClient, eventBus) => {
            const middleware = new LoadingReactionMiddleware();
            return await middleware.initialize(botClient, eventBus);
        }
    }
};
