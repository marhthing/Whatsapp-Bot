const EventEmitter = require('events');

class MessageProcessor extends EventEmitter {
    constructor(dependencies) {
        super();
        
        this.client = dependencies.client;
        this.accessController = dependencies.accessController;
        this.loadingReaction = dependencies.loadingReaction;
        this.messageArchiver = dependencies.messageArchiver;
        this.mediaVault = dependencies.mediaVault;
        this.stateEngine = dependencies.stateEngine;
        this.pluginDiscovery = dependencies.pluginDiscovery;
        this.eventBus = dependencies.eventBus;
        
        this.processingQueue = [];
        this.isProcessing = false;
        this.maxConcurrentProcessing = parseInt(process.env.MAX_CONCURRENT_COMMANDS || '5');
        this.activeProcessing = new Set();
    }

    async processMessage(message) {
        try {
            const isOutgoing = message.key.fromMe;
            
            // Emit message received event
            this.eventBus?.emitMessageReceived(message);

            // Always archive the message first (both incoming and outgoing)
            await this.messageArchiver.archiveMessage(message, isOutgoing);

            // Download media if present
            if (message.hasMedia && process.env.AUTO_DOWNLOAD_MEDIA === 'true') {
                await this.downloadAndStoreMedia(message);
            }

            // Skip command processing for outgoing messages (sent by bot)
            if (isOutgoing) {
                return;
            }

            // Extract command if present for incoming messages
            const command = this.extractCommand(message);
            
            // Check access control
            const accessResult = this.accessController.canProcessMessage(message, command);
            
            if (!accessResult.allowed) {
                // Log access denied but don't respond
                console.log(`🚫 Access denied for ${message.author || message.from}: ${accessResult.reason}`);
                this.eventBus?.emitAccessDenied(message, accessResult.reason);
                return;
            }

            // Process based on access reason
            switch (accessResult.reason) {
                case 'owner':
                    await this.processOwnerMessage(message, command);
                    break;
                    
                case 'game_player':
                    await this.processGameMessage(message, accessResult.gameType);
                    break;
                    
                case 'allowed_command':
                    await this.processAllowedCommand(message, command);
                    break;
            }

        } catch (error) {
            console.error('❌ Error processing message:', error);
            this.eventBus?.emit('error', { type: 'message_processing', error, message });
        }
    }

    extractCommand(message) {
        const text = message.body;
        if (!text || typeof text !== 'string') {
            return null;
        }
        
        const trimmed = text.trim();
        const prefix = process.env.COMMAND_PREFIX || '.';
        
        if (!trimmed.startsWith(prefix)) {
            return null;
        }

        const parts = trimmed.substring(prefix.length).split(' ');
        return {
            name: parts[0].toLowerCase(),
            args: parts.slice(1),
            raw: trimmed,
            prefix: prefix
        };
    }

    async processOwnerMessage(message, command) {
        if (!command) {
            // Not a command, just archive and return
            return;
        }

        try {
            // Show loading reaction for owner commands
            await this.loadingReaction.processCommandWithReaction(message, async () => {
                return await this.executeCommand(message, command);
            });

        } catch (error) {
            console.error(`❌ Error processing owner command '${command.name}':`, error);
            await this.sendErrorMessage(message, error);
        }
    }

    async processGameMessage(message, gameType) {
        try {
            const chatId = message.from;
            const activeGame = this.accessController.getActiveGame(chatId);
            
            if (!activeGame) {
                return; // Game no longer active
            }

            // Check if message is a valid game input
            if (this.accessController.isValidGameInput(message, gameType)) {
                await this.executeGameMove(message, activeGame);
            }
            // Invalid game input is silently ignored

        } catch (error) {
            console.error(`❌ Error processing game message:`, error);
        }
    }

    async processAllowedCommand(message, command) {
        if (!command) {
            return; // Not a command
        }

        try {
            // Check if this specific command is allowed
            const userJid = message.author || message.from;
            if (!this.accessController.isCommandAllowed(userJid, command.name)) {
                return; // Command not allowed
            }

            // Execute allowed command (no loading reaction for non-owners)
            await this.executeCommand(message, command);

        } catch (error) {
            console.error(`❌ Error processing allowed command '${command.name}':`, error);
        }
    }

    async executeCommand(message, command) {
        const startTime = Date.now();
        
        try {
            // Find and execute command through plugin system
            const result = await this.pluginDiscovery.executeCommand(command.name, message, command);
            
            const duration = Date.now() - startTime;
            
            // Log command execution
            console.log(`⚡ Command '${command.name}' executed in ${duration}ms`);
            
            // Emit command executed event
            this.eventBus?.emitCommandExecuted(command.name, message, result);
            
            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            
            console.error(`❌ Command '${command.name}' failed after ${duration}ms:`, error);
            
            // Emit command error event
            this.eventBus?.emitCommandError(command.name, message, error);
            
            throw error;
        }
    }

    async executeGameMove(message, gameInfo) {
        try {
            // Get game plugin
            const gamePlugin = await this.pluginDiscovery.getPlugin('games');
            
            if (gamePlugin && gamePlugin.processGameMove) {
                await gamePlugin.processGameMove(message, gameInfo);
            }

        } catch (error) {
            console.error('❌ Error executing game move:', error);
        }
    }

    async downloadAndStoreMedia(message) {
        try {
            // Download media data
            const media = await message.downloadMedia();
            
            if (media) {
                // Store in media vault
                const stored = await this.mediaVault.storeMedia(media, message);
                
                console.log(`📁 Downloaded and stored ${stored.category}: ${stored.filename}`);
                
                // Emit media downloaded event
                this.eventBus?.emitMediaDownloaded(stored, message);
                
                return stored;
            }

        } catch (error) {
            console.error('❌ Failed to download and store media:', error);
        }
        
        return null;
    }

    async processDeletedMessage(after, before) {
        try {
            // Log deleted message
            console.log('🗑️ Message deleted detected');
            
            // Try to recover from archive
            const messageId = before?.id?._serialized || before?.id?.id;
            
            if (messageId) {
                const archivedMessage = await this.messageArchiver.getMessageById(messageId);
                
                if (archivedMessage) {
                    // Get anti-delete plugin
                    const antiDeletePlugin = await this.pluginDiscovery.getPlugin('anti-delete');
                    
                    if (antiDeletePlugin && antiDeletePlugin.handleDeletedMessage) {
                        await antiDeletePlugin.handleDeletedMessage(after, before, archivedMessage);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error processing deleted message:', error);
        }
    }

    async sendMessage(chatId, content, options = {}) {
        try {
            return await this.client.sendMessage(chatId, content, options);
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    async sendErrorMessage(message, error) {
        try {
            const errorMessage = `❌ Error: ${error.message || 'Unknown error occurred'}`;
            await this.sendMessage(message.from, errorMessage);
        } catch (sendError) {
            console.error('❌ Failed to send error message:', sendError);
        }
    }

    async replyToMessage(message, content, options = {}) {
        try {
            // Quote the original message
            return await message.reply(content, options);
        } catch (error) {
            console.error('❌ Failed to reply to message:', error);
            throw error;
        }
    }

    getProcessingStats() {
        return {
            queueSize: this.processingQueue.length,
            isProcessing: this.isProcessing,
            activeProcessing: this.activeProcessing.size,
            maxConcurrent: this.maxConcurrentProcessing
        };
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down message processor...');
            
            // Wait for active processing to complete
            while (this.activeProcessing.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log('✅ Message processor shutdown complete');

        } catch (error) {
            console.error('❌ Error during message processor shutdown:', error);
        }
    }
}

module.exports = MessageProcessor;
