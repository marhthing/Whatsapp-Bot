const commands = require('./commands');
const envCommands = require('./envCommands');
const states = require('./states');

class CoreCommandsPlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.commands = {};
        this.states = new states(this.botClient, this.eventBus);
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing Core Commands plugin...');
            
            // Initialize command handlers
            await this.initializeCommands();
            
            // Initialize environment commands
            await this.initializeEnvCommands();
            
            this.isInitialized = true;
            console.log('✅ Core Commands plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Core Commands plugin:', error);
            throw error;
        }
    }

    async initializeCommands() {
        const commandHandlers = new commands(this.botClient, this.eventBus, this.states);
        
        this.commands = {
            help: commandHandlers.help.bind(commandHandlers),
            info: commandHandlers.info.bind(commandHandlers),
            settings: commandHandlers.settings.bind(commandHandlers),
            allow: commandHandlers.allow.bind(commandHandlers),
            disallow: commandHandlers.disallow.bind(commandHandlers),
            status: commandHandlers.status.bind(commandHandlers),
            reload: commandHandlers.reload.bind(commandHandlers)
        };
    }

    async initializeEnvCommands() {
        const envCommandHandlers = new envCommands(this.botClient, this.eventBus);
        
        this.commands.env = envCommandHandlers.env.bind(envCommandHandlers);
    }

    async executeCommand(commandName, message, args) {
        if (!this.isInitialized) {
            throw new Error('Core Commands plugin not initialized');
        }

        const commandHandler = this.commands[commandName];
        if (!commandHandler) {
            throw new Error(`Command '${commandName}' not found in core-commands plugin`);
        }

        // Create context object for compatibility
        const context = {
            message: message,
            args: args,
            reply: async (text) => {
                await this.botClient.sendMessage(message.key.remoteJid, text);
            }
        };

        return await commandHandler(context);
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down Core Commands plugin...');
            
            this.isInitialized = false;
            
            console.log('✅ Core Commands plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during Core Commands plugin shutdown:', error);
        }
    }
}

module.exports = CoreCommandsPlugin;
