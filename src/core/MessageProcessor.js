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

            // Download and store media automatically for all message types
            if (this.hasMedia(message)) {
                await this.downloadAndStoreMedia(message);
            }

            // Only process messages that start with command prefix - optimize performance
            const messageText = this.getMessageText(message);
            const prefix = process.env.COMMAND_PREFIX || process.env.PREFIX || '.';

            // Skip processing if message doesn't start with prefix (for non-outgoing messages)
            if (!isOutgoing && (!messageText || !messageText.trim().startsWith(prefix))) {
                return; // Don't waste resources on non-command messages
            }

            // Extract command if present (for both incoming and outgoing messages)
            const command = this.extractCommand(message);

            // Skip non-command outgoing messages, but process command outgoing messages
            if (isOutgoing && !command) {
                return;
            }

            // Check access control
            const commandName = command ? command.name : null;
            const accessResult = this.accessController.canProcessMessage(message, commandName);

            if (!accessResult.allowed) {
                // Log access denied with proper JID extraction
                const senderJid = message.key?.participant || message.key?.remoteJid || message.author || message.from;
                console.log(`🚫 Access denied for ${senderJid}: ${accessResult.reason}`);
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

    hasMedia(message) {
        // Check if message has media content
        if (message.message) {
            return !!(message.message.imageMessage || 
                     message.message.videoMessage || 
                     message.message.audioMessage || 
                     message.message.documentMessage || 
                     message.message.stickerMessage);
        }
        return !!message.hasMedia;
    }

    hasValidMediaKey(message) {
        try {
            if (message.message?.imageMessage?.mediaKey) return true;
            if (message.message?.videoMessage?.mediaKey) return true;
            if (message.message?.audioMessage?.mediaKey) return true;
            if (message.message?.documentMessage?.mediaKey) return true;
            if (message.message?.stickerMessage?.mediaKey) return true;
            return false;
        } catch (error) {
            return false;
        }
    }

    async downloadAndStoreMedia(message) {
        try {
            if (!this.hasMedia(message)) {
                return null;
            }

            console.log('📥 Downloading media...');

            // Use Baileys downloadMediaMessage function
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const buffer = await downloadMediaMessage(message, 'buffer', {}, { 
                logger: require('pino')({ level: 'silent' })
            });

            if (!buffer) {
                console.warn('⚠️ Failed to download media - no buffer received');
                return null;
            }

            // Determine media type and mimetype
            let mediaType = 'document';
            let mimetype = 'application/octet-stream';
            let filename = 'file';

            if (message.message.imageMessage) {
                mediaType = 'image';
                mimetype = message.message.imageMessage.mimetype || 'image/jpeg';
                filename = 'image.jpg';
            } else if (message.message.videoMessage) {
                mediaType = 'video';
                mimetype = message.message.videoMessage.mimetype || 'video/mp4';
                filename = 'video.mp4';
            } else if (message.message.audioMessage) {
                mediaType = 'audio';
                mimetype = message.message.audioMessage.mimetype || 'audio/ogg';
                filename = 'audio.ogg';
            } else if (message.message.documentMessage) {
                mediaType = 'document';
                mimetype = message.message.documentMessage.mimetype || 'application/octet-stream';
                filename = message.message.documentMessage.fileName || 'document';
            } else if (message.message.stickerMessage) {
                mediaType = 'sticker';
                mimetype = message.message.stickerMessage.mimetype || 'image/webp';
                filename = 'sticker.webp';
            }

            // Store in media vault
            const mediaData = {
                data: buffer,
                mimetype: mimetype,
                filename: filename
            };

            const storedMedia = await this.mediaVault.storeMedia(mediaData, message);
            console.log(`✅ Media stored: ${storedMedia.filename} (${this.formatSize(buffer.length)})`);

            return storedMedia;

        } catch (error) {
            console.error('❌ Error downloading/storing media:', error);
            return null;
        }
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async executeCommand(message, command) {
        try {
            // Get command execution from plugin discovery
            const result = await this.pluginDiscovery.executeCommand(command.name, {
                message,
                command,
                args: command.args,
                reply: async (text, options = {}) => {
                    await this.sendMessage(message.key.remoteJid || message.from, text, options);
                }
            });

            return result;

        } catch (error) {
            console.error(`❌ Error executing command '${command.name}':`, error);
            await this.sendMessage(
                message.key.remoteJid || message.from, 
                `❌ Error executing command: ${error.message}`
            );
        }
    }

    async sendMessage(chatId, content, options = {}) {
        try {
            if (!this.client) {
                throw new Error('WhatsApp client not available');
            }

            let messageContent;
            if (typeof content === 'string') {
                messageContent = { text: content };
            } else {
                messageContent = content;
            }

            const sentMessage = await this.client.sendMessage(chatId, messageContent, options);

            // Archive the outgoing message
            if (sentMessage) {
                await this.messageArchiver.archiveMessage(sentMessage, true);
            }

            return sentMessage;

        } catch (error) {
            console.error('❌ Error sending message:', error);
            throw error;
        }
    }

    async sendErrorMessage(message, error) {
        try {
            const errorText = `❌ **Error**\n\n${error.message || 'An unknown error occurred'}`;
            await this.sendMessage(message.key.remoteJid || message.from, errorText);
        } catch (sendError) {
            console.error('❌ Failed to send error message:', sendError);
        }
    }

    extractCommand(message) {
        // Extract message text from different message types
        let text = '';

        if (message.message) {
            if (message.message.conversation) {
                text = message.message.conversation;
            } else if (message.message.extendedTextMessage?.text) {
                text = message.message.extendedTextMessage.text;
            } else if (message.message.imageMessage?.caption) {
                text = message.message.imageMessage.caption;
            } else if (message.message.videoMessage?.caption) {
                text = message.message.videoMessage.caption;
            }
        }

        // Fallback to direct body property
        if (!text && message.body) {
            text = message.body;
        }

        if (!text || typeof text !== 'string') {
            return null;
        }

        const trimmed = text.trim();
        const prefix = process.env.COMMAND_PREFIX || process.env.PREFIX || '.';

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
            // Extract sender JID properly from Baileys message structure
            let userJid;
            if (message.key) {
                userJid = message.key.participant || message.key.remoteJid;
            }
            if (!userJid) {
                userJid = message.author || message.from;
            }

            console.log(`🔍 processAllowedCommand: Extracted JID: ${userJid} for command: ${command.name}`);

            if (!this.accessController.isCommandAllowed(userJid, command.name)) {
                console.log(`❌ Command '${command.name}' not allowed for user: ${userJid}`);
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
            if (!this.hasMedia(message)) {
                return null;
            }

            console.log('📥 Downloading media...');

            // Use Baileys downloadMediaMessage function
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const buffer = await downloadMediaMessage(message, 'buffer', {}, { 
                logger: require('pino')({ level: 'silent' })
            });

            if (!buffer) {
                console.warn('⚠️ Failed to download media - no buffer received');
                return null;
            }

            // Determine media type and mimetype
            let mediaType = 'document';
            let mimetype = 'application/octet-stream';
            let filename = 'file';

            if (message.message.imageMessage) {
                mediaType = 'image';
                mimetype = message.message.imageMessage.mimetype || 'image/jpeg';
                filename = 'image.jpg';
            } else if (message.message.videoMessage) {
                mediaType = 'video';
                mimetype = message.message.videoMessage.mimetype || 'video/mp4';
                filename = 'video.mp4';
            } else if (message.message.audioMessage) {
                mediaType = 'audio';
                mimetype = message.message.audioMessage.mimetype || 'audio/ogg';
                filename = 'audio.ogg';
            } else if (message.message.documentMessage) {
                mediaType = 'document';
                mimetype = message.message.documentMessage.mimetype || 'application/octet-stream';
                filename = message.message.documentMessage.fileName || 'document';
            } else if (message.message.stickerMessage) {
                mediaType = 'sticker';
                mimetype = message.message.stickerMessage.mimetype || 'image/webp';
                filename = 'sticker.webp';
            }

            // Store in media vault
            const mediaData = {
                data: buffer,
                mimetype: mimetype,
                filename: filename
            };

            const storedMedia = await this.mediaVault.storeMedia(mediaData, message);
            console.log(`✅ Media stored: ${storedMedia.filename} (${this.formatSize(buffer.length)})`);

            return storedMedia;

        } catch (error) {
            console.error('❌ Error downloading/storing media:', error);
            return null;
        }
    }

    async processDeletedMessage(deletionData) {
        try {
            // Handle different deletion data formats from Baileys
            let messageKeys = [];

            if (Array.isArray(deletionData)) {
                // Array of message keys
                messageKeys = deletionData;
            } else if (deletionData.messages) {
                // Structured deletion data
                messageKeys = deletionData.messages;
            } else if (deletionData.key || deletionData.id) {
                // Single message deletion
                messageKeys = [deletionData];
            }

            for (const messageKey of messageKeys) {
                try {
                    const messageId = messageKey.id || messageKey;
                    const chatId = messageKey.remoteJid || messageKey.from;

                    // Try to recover from archive
                    const archivedMessage = await this.messageArchiver.getMessageById(messageId);

                    if (archivedMessage) {
                        // Get anti-delete plugin
                        const antiDeletePlugin = await this.pluginDiscovery.getPlugin('anti-delete');

                        if (antiDeletePlugin && typeof antiDeletePlugin.handleDeletedMessage === 'function') {
                            await antiDeletePlugin.handleDeletedMessage(messageKey, null, archivedMessage);
                        }
                    } else {
                        // Still notify anti-delete plugin about the deletion attempt
                        const antiDeletePlugin = await this.pluginDiscovery.getPlugin('anti-delete');
                        if (antiDeletePlugin && typeof antiDeletePlugin.handleDeletedMessage === 'function') {
                            await antiDeletePlugin.handleDeletedMessage(messageKey, null, null);
                        }
                    }
                } catch (msgError) {
                    console.error(`❌ Error processing individual deletion for ${messageKey}:`, msgError);
                }
            }

        } catch (error) {
            console.error('❌ Error processing deleted message:', error);
        }
    }

    async sendMessage(chatId, content, options = {}) {
        try {
            // Ensure content is properly formatted for Baileys
            let messageContent;

            if (typeof content === 'string') {
                messageContent = { text: content, ...options };
            } else if (content && typeof content === 'object') {
                messageContent = content;
            } else {
                throw new Error('Invalid message content format');
            }

            return await this.client.sendMessage(chatId, messageContent);
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    async sendErrorMessage(message, error) {
        try {
            const errorText = `❌ Error: ${error.message || 'Unknown error occurred'}`;
            await this.sendMessage(message.key.remoteJid, { text: errorText });
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

    getMessageText(message) {
        // Extract message text from different message types
        if (message.message) {
            if (message.message.conversation) {
                return message.message.conversation;
            } else if (message.message.extendedTextMessage?.text) {
                return message.message.extendedTextMessage.text;
            } else if (message.message.imageMessage?.caption) {
                return message.message.imageMessage.caption;
            } else if (message.message.videoMessage?.caption) {
                return message.message.videoMessage.caption;
            }
        }

        // Fallback to direct body property
        return message.body || '';
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