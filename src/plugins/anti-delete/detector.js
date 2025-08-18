const fs = require('fs-extra');
const path = require('path');
const EnvironmentManager = require('../../core/EnvironmentManager');

class Detector {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.envManager = new EnvironmentManager();
        
        this.deletionLog = [];
        this.maxLogSize = 1000;
        this.dataPath = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.envManager.initialize();
            
            this.dataPath = path.join(
                this.envManager.get('DATA_DIR', './data'),
                'plugins',
                'anti-delete'
            );
            
            await fs.ensureDir(this.dataPath);
            
            // Load existing deletion log
            await this.loadDeletionLog();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Error initializing Anti-Delete Detector:', error);
            throw error;
        }
    }

    setPlugin(plugin) {
        this.plugin = plugin;
    }

    async loadDeletionLog() {
        try {
            const logPath = path.join(this.dataPath, 'deletion_log.json');
            
            if (await fs.pathExists(logPath)) {
                this.deletionLog = await fs.readJson(logPath);
            }
            
        } catch (error) {
            console.error('Error loading deletion log:', error);
        }
    }

    async saveDeletionLog() {
        try {
            const logPath = path.join(this.dataPath, 'deletion_log.json');
            
            // Keep only the most recent entries
            if (this.deletionLog.length > this.maxLogSize) {
                this.deletionLog = this.deletionLog.slice(-this.maxLogSize);
            }
            
            await fs.writeJson(logPath, this.deletionLog, { spaces: 2 });
            
        } catch (error) {
            console.error('Error saving deletion log:', error);
        }
    }

    async handleDeletion(data) {
        try {
            console.log('🔍 Anti-delete handling deletion data:', JSON.stringify(data, null, 2));
            
            const { after, before } = data;
            
            if (!before) {
                console.log('🔍 Message deletion detected but no original message available');
                return;
            }
            
            // Extract proper data from Baileys message structure
            const messageText = this.extractMessageText(before);
            const senderJid = this.extractSenderJid(before);
            const chatId = this.extractChatId(before);
            const messageId = this.extractMessageId(before);
            
            console.log(`🔍 Processing deletion - Chat: ${chatId}, Sender: ${senderJid}, MessageID: ${messageId}`);
            
            const deletionEntry = {
                id: this.generateId(),
                originalMessageId: messageId,
                deletedMessageId: after ? this.extractMessageId(after) : null,
                chatId: chatId,
                sender: senderJid,
                originalTimestamp: new Date(before.messageTimestamp * 1000).toISOString(),
                deletedTimestamp: new Date().toISOString(),
                messageType: this.getMessageType(before),
                messageBody: messageText,
                hasMedia: this.hasMedia(before),
                mediaType: this.hasMedia(before) ? this.getMediaType(before) : null,
                notifiedOwner: false
            };
            
            this.deletionLog.push(deletionEntry);
            await this.saveDeletionLog();
            
            // Emit deletion detected event
            this.eventBus.emit('deletion_detected', deletionEntry);
            
            // Notify and forward deleted message (always enabled for now)
            await this.forwardDeletedMessage(deletionEntry);
            
            console.log(`🔍 Logged message deletion: ${deletionEntry.originalMessageId}`);
            
        } catch (error) {
            console.error('Error handling message deletion:', error);
        }
    }

    async forwardDeletedMessage(deletionEntry) {
        try {
            // Get target JID from plugin
            let targetJid;
            
            if (this.plugin) {
                targetJid = this.plugin.getTargetJid();
            } else {
                // Fallback to owner JID
                const accessController = this.botClient.getAccessController();
                targetJid = accessController.ownerJid;
            }
            
            if (!targetJid) {
                console.warn('⚠️ Target JID not available for anti-delete forwarding');
                return;
            }
            
            const senderPhone = deletionEntry.sender.split('@')[0];
            const chatPhone = deletionEntry.chatId.split('@')[0];
            
            let notificationText = `🗑️ **DELETED MESSAGE RECOVERED**\n\n`;
            notificationText += `👤 **Sender:** ${senderPhone}\n`;
            notificationText += `💬 **From Chat:** ${chatPhone}\n`;
            notificationText += `📅 **Original:** ${new Date(deletionEntry.originalTimestamp).toLocaleString()}\n`;
            notificationText += `🗑️ **Deleted:** ${new Date(deletionEntry.deletedTimestamp).toLocaleString()}\n\n`;
            
            if (deletionEntry.messageBody) {
                notificationText += `💬 **Deleted Content:**\n"${deletionEntry.messageBody}"\n\n`;
            } else {
                notificationText += `💬 **Content:** (No text content)\n\n`;
            }
            
            if (deletionEntry.hasMedia) {
                notificationText += `📎 **Had Media:** ${deletionEntry.mediaType}\n\n`;
            }
            
            notificationText += `💡 Use \`.recover ${deletionEntry.id}\` to restore this message`;
            
            await this.botClient.sendMessage(targetJid, { text: notificationText });
            
            // Mark as notified
            deletionEntry.notifiedOwner = true;
            await this.saveDeletionLog();
            
            console.log(`📤 Forwarded deleted message to: ${targetJid}`);
            
        } catch (error) {
            console.error('Error forwarding deleted message:', error);
        }
    }

    async notifyOwner(deletionEntry) {
        // This method is now replaced by forwardDeletedMessage
        // Keeping for backward compatibility if needed
        await this.forwardDeletedMessage(deletionEntry);
    }

    async getLog(context) {
        try {
            const { args, reply } = context;
            
            const limit = parseInt(args[0]) || 10;
            const recentDeletions = this.deletionLog.slice(-limit).reverse();
            
            if (recentDeletions.length === 0) {
                await reply('📝 No deleted messages detected');
                return;
            }
            
            let logText = `🔍 **Anti-Delete Log**\n\n`;
            logText += `📊 **Total Deletions:** ${this.deletionLog.length}\n`;
            logText += `📋 **Showing:** Last ${Math.min(limit, recentDeletions.length)}\n\n`;
            
            recentDeletions.forEach((entry, index) => {
                const senderPhone = entry.sender.split('@')[0];
                const timeAgo = this.getTimeAgo(entry.deletedTimestamp);
                
                logText += `**${index + 1}.** ID: \`${entry.id}\`\n`;
                logText += `👤 Sender: ${senderPhone}\n`;
                logText += `⏰ ${timeAgo}\n`;
                
                if (entry.messageBody && entry.messageBody.length > 50) {
                    logText += `💬 "${entry.messageBody.substring(0, 50)}..."\n`;
                } else if (entry.messageBody) {
                    logText += `💬 "${entry.messageBody}"\n`;
                }
                
                if (entry.hasMedia) {
                    logText += `📎 ${entry.mediaType}\n`;
                }
                
                logText += `🔄 Recover: \`.recover ${entry.id}\`\n\n`;
            });
            
            logText += `💡 **Commands:**\n`;
            logText += `• \`.antilog [limit]\` - Show deletion log\n`;
            logText += `• \`.recover <id>\` - Recover specific message\n`;
            logText += `• \`.deleted\` - List all deleted messages`;
            
            await reply(logText);
            
        } catch (error) {
            console.error('Error getting anti-delete log:', error);
            await context.reply('❌ Error retrieving deletion log');
        }
    }

    getDeletionById(id) {
        return this.deletionLog.find(entry => entry.id === id);
    }

    getDeletionsByChat(chatId, limit = 50) {
        return this.deletionLog
            .filter(entry => entry.chatId === chatId)
            .slice(-limit)
            .reverse();
    }

    getDeletionsBySender(senderId, limit = 50) {
        return this.deletionLog
            .filter(entry => entry.sender === senderId)
            .slice(-limit)
            .reverse();
    }

    getRecentDeletions(hours = 24) {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this.deletionLog.filter(entry => 
            new Date(entry.deletedTimestamp) > cutoff
        );
    }

    getDeletionStats() {
        const stats = {
            total: this.deletionLog.length,
            byChat: {},
            bySender: {},
            byType: {},
            recent24h: this.getRecentDeletions(24).length,
            recent7d: this.getRecentDeletions(24 * 7).length
        };
        
        this.deletionLog.forEach(entry => {
            // By chat
            const chatId = entry.chatId;
            stats.byChat[chatId] = (stats.byChat[chatId] || 0) + 1;
            
            // By sender
            const senderId = entry.sender;
            stats.bySender[senderId] = (stats.bySender[senderId] || 0) + 1;
            
            // By type
            const messageType = entry.messageType;
            stats.byType[messageType] = (stats.byType[messageType] || 0) + 1;
        });
        
        return stats;
    }

    generateId() {
        return `del_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMinutes < 1) {
            return 'Just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else {
            return `${diffDays}d ago`;
        }
    }

    async shutdown() {
        try {
            await this.saveDeletionLog();
            this.isInitialized = false;
        } catch (error) {
            console.error('Error during Anti-Delete Detector shutdown:', error);
        }
    }

    // Utility methods for extracting data from Baileys message structure
    extractMessageText(message) {
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
        return message.body || '';
    }

    extractSenderJid(message) {
        if (message.key) {
            return message.key.participant || message.key.remoteJid;
        }
        return message.author || message.from;
    }

    extractChatId(message) {
        if (message.key) {
            return message.key.remoteJid;
        }
        return message.from;
    }

    extractMessageId(message) {
        if (message.key) {
            return message.key.id;
        }
        return message.id?._serialized || message.id?.id || message.id;
    }

    getMessageType(message) {
        if (message.message) {
            const messageKeys = Object.keys(message.message);
            return messageKeys[0] || 'unknown';
        }
        return message.type || 'text';
    }

    hasMedia(message) {
        if (message.message) {
            return !!(message.message.imageMessage || 
                     message.message.videoMessage || 
                     message.message.audioMessage || 
                     message.message.documentMessage || 
                     message.message.stickerMessage);
        }
        return !!message.hasMedia;
    }

    getMediaType(message) {
        if (message.message) {
            if (message.message.imageMessage) return 'image';
            if (message.message.videoMessage) return 'video';
            if (message.message.audioMessage) return 'audio';
            if (message.message.documentMessage) return 'document';
            if (message.message.stickerMessage) return 'sticker';
        }
        return message.type || 'unknown';
    }
}

module.exports = { Detector };
