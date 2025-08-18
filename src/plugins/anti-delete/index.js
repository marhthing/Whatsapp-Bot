const { Detector } = require('./detector');
const { Recovery } = require('./recovery');

class AntiDeletePlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.commands = {};
        this.detector = null;
        this.recovery = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🔍 Initializing Anti-Delete plugin...');
            
            // Initialize components
            this.detector = new Detector(this.botClient, this.eventBus);
            this.recovery = new Recovery(this.botClient, this.eventBus);
            
            await this.detector.initialize();
            await this.recovery.initialize();
            
            // Initialize commands
            this.initializeCommands();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            this.isInitialized = true;
            console.log('✅ Anti-Delete plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Anti-Delete plugin:', error);
            throw error;
        }
    }

    initializeCommands() {
        this.commands = {
            recover: this.recovery.recover.bind(this.recovery),
            deleted: this.recovery.listDeleted.bind(this.recovery),
            antilog: this.detector.getLog.bind(this.detector)
        };
    }

    setupEventHandlers() {
        // Listen for message deletion events
        this.eventBus.on('message_deleted', async (data) => {
            if (this.detector) {
                await this.detector.handleDeletion(data);
            }
        });
        
        // Listen for deletion detection events
        this.eventBus.on('deletion_detected', async (data) => {
            console.log(`🔍 Message deletion detected: ${data.id}`);
        });
    }

    // Method called by MessageProcessor when message is deleted
    async handleDeletedMessage(after, before, archivedMessage) {
        try {
            console.log('🗑️ Anti-delete plugin handling deleted message');
            
            if (this.detector) {
                const deletionData = {
                    after: after,
                    before: archivedMessage || before
                };
                await this.detector.handleDeletion(deletionData);
            }
            
        } catch (error) {
            console.error('❌ Error in anti-delete plugin handling deletion:', error);
        }
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down Anti-Delete plugin...');
            
            if (this.detector) {
                await this.detector.shutdown();
            }
            
            if (this.recovery) {
                await this.recovery.shutdown();
            }
            
            this.isInitialized = false;
            
            console.log('✅ Anti-Delete plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during Anti-Delete plugin shutdown:', error);
        }
    }
}

module.exports = AntiDeletePlugin;
