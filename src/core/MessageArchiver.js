const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');

class MessageArchiver {
    constructor() {
        this.messagesPath = path.join(process.cwd(), 'data', 'messages');
        this.isInitialized = false;
        this.archiveQueue = [];
        this.processing = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing message archiver...');

            // Ensure messages directory exists
            await fs.ensureDir(this.messagesPath);

            // Create current year/month directories
            await this.ensureCurrentDirectories();

            // Start processing queue
            this.startQueueProcessor();

            this.isInitialized = true;
            console.log('✅ Message archiver initialized');

        } catch (error) {
            console.error('❌ Failed to initialize message archiver:', error);
            throw error;
        }
    }

    async ensureCurrentDirectories() {
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        const yearPath = path.join(this.messagesPath, year);
        const monthPath = path.join(yearPath, month);

        await fs.ensureDir(path.join(monthPath, 'individual'));
        await fs.ensureDir(path.join(monthPath, 'groups'));
        await fs.ensureDir(path.join(monthPath, 'status'));
    }

    async archiveMessage(message, isOutgoing = false) {
        if (!this.isInitialized) {
            console.warn('⚠️ Message archiver not initialized, skipping archive');
            return;
        }

        // Add to queue for processing
        this.archiveQueue.push({
            message,
            timestamp: Date.now(),
            isOutgoing,
            archived: false
        });
    }

    startQueueProcessor() {
        setInterval(async () => {
            if (!this.processing && this.archiveQueue.length > 0) {
                await this.processArchiveQueue();
            }
        }, 1000); // Process every second
    }

    async processArchiveQueue() {
        if (this.processing || this.archiveQueue.length === 0) {
            return;
        }

        this.processing = true;
        
        try {
            const batch = this.archiveQueue.splice(0, 10); // Process in batches of 10
            
            for (const item of batch) {
                await this.saveMessage(item.message, item.isOutgoing);
                item.archived = true;
            }
            
            if (batch.length > 0) {
                console.log(`📁 Archived ${batch.length} messages`);
            }
            
        } catch (error) {
            console.error('❌ Error processing archive queue:', error);
        } finally {
            this.processing = false;
        }
    }

    async saveMessage(message, isOutgoing = false) {
        try {
            const messageData = {
                id: message.id?.id || message.id?._serialized || Date.now().toString(),
                from: message.from,
                to: message.to,
                body: message.body || '',
                type: message.type || 'text',
                timestamp: message.timestamp ? new Date(message.timestamp * 1000) : new Date(),
                isOutgoing,
                hasMedia: !!message.hasMedia,
                quotedMessage: message.quotedMessage ? {
                    id: message.quotedMessage.id?.id || message.quotedMessage.id?._serialized,
                    body: message.quotedMessage.body,
                    from: message.quotedMessage.from
                } : null,
                mentions: message.mentionedIds || [],
                isGroup: message.from?.includes('@g.us') || false,
                author: message.author, // For group messages
                mediaPath: null, // Will be updated by MediaVault
                archived: new Date().toISOString()
            };

            // Determine storage path based on message type
            const messageDate = messageData.timestamp;
            const year = messageDate.getFullYear().toString();
            const month = (messageDate.getMonth() + 1).toString().padStart(2, '0');
            const day = messageDate.getDate().toString().padStart(2, '0');

            let categoryPath;
            if (messageData.isGroup) {
                categoryPath = path.join(this.messagesPath, year, month, 'groups');
            } else if (messageData.from?.includes('@status')) {
                categoryPath = path.join(this.messagesPath, year, month, 'status');
            } else {
                categoryPath = path.join(this.messagesPath, year, month, 'individual');
            }

            await fs.ensureDir(categoryPath);

            // Create daily file
            const fileName = `${day}.json`;
            const filePath = path.join(categoryPath, fileName);

            // Load existing messages for the day
            let dailyMessages = [];
            if (await fs.pathExists(filePath)) {
                try {
                    dailyMessages = await fs.readJson(filePath);
                } catch (error) {
                    console.warn(`⚠️ Error reading existing messages file: ${fileName}`);
                    dailyMessages = [];
                }
            }

            // Add new message
            dailyMessages.push(messageData);

            // Save back to file
            await fs.writeJson(filePath, dailyMessages, { spaces: 2 });

            return messageData;

        } catch (error) {
            console.error('❌ Error saving message:', error);
            throw error;
        }
    }

    async recoverMissedMessages(client) {
        // This method can be called after reconnection to try to recover missed messages
        try {
            console.log('🔍 Checking for missed messages...');
            
            // Get recent chats and check for new messages
            // This is a placeholder - WhatsApp doesn't provide a direct way to get missed messages
            // But we can implement logic to check recent chat history
            
            const lastCheckFile = path.join(process.cwd(), 'data', 'system', 'last_message_check.json');
            let lastCheckTime = 0;
            
            try {
                if (await fs.pathExists(lastCheckFile)) {
                    const data = await fs.readJson(lastCheckFile);
                    lastCheckTime = data.timestamp || 0;
                }
            } catch (error) {
                console.warn('⚠️ Could not read last check time');
            }

            // Update last check time
            await fs.writeJson(lastCheckFile, {
                timestamp: Date.now(),
                lastCheck: new Date().toISOString()
            }, { spaces: 2 });

            console.log('✅ Message recovery check completed');

        } catch (error) {
            console.error('❌ Error during message recovery:', error);
        }

        try {
            const batch = this.archiveQueue.splice(0, 10); // Process up to 10 messages at once
            
            for (const item of batch) {
                await this.archiveMessageToFile(item.message);
            }

        } catch (error) {
            console.error('❌ Error processing archive queue:', error);
        } finally {
            this.processing = false;
        }
    }

    async archiveMessageToFile(message) {
        try {
            const messageData = this.extractMessageData(message);
            const filePath = this.getArchiveFilePath(messageData);

            // Read existing messages for the day
            let messages = [];
            if (await fs.pathExists(filePath)) {
                try {
                    const existingData = await fs.readJson(filePath);
                    messages = existingData.messages || [];
                } catch (error) {
                    console.error('⚠️ Failed to read existing archive, creating new:', error);
                }
            }

            // Add new message
            messages.push(messageData);

            // Sort by timestamp
            messages.sort((a, b) => a.timestamp - b.timestamp);

            // Write back to file
            const archiveData = {
                date: messageData.date,
                chatId: messageData.chatId,
                chatName: messageData.chatName,
                chatType: messageData.chatType,
                messageCount: messages.length,
                lastUpdated: new Date().toISOString(),
                messages: messages
            };

            await fs.writeJson(filePath, archiveData, { spaces: 2 });

        } catch (error) {
            console.error('❌ Failed to archive message:', error);
        }
    }

    extractMessageData(message) {
        const timestamp = message.timestamp * 1000; // Convert to milliseconds
        const date = new Date(timestamp);

        return {
            id: message.id._serialized || message.id.id,
            timestamp: timestamp,
            date: date.toISOString().split('T')[0], // YYYY-MM-DD
            dateTime: date.toISOString(),
            chatId: message.from,
            chatName: message._data.notifyName || message.from,
            chatType: message.from.includes('@g.us') ? 'group' : 
                     message.from.includes('@status') ? 'status' : 'individual',
            from: message.from,
            author: message.author || message.from,
            authorName: message._data.notifyName || null,
            to: message.to,
            body: message.body || '',
            type: message.type,
            hasMedia: message.hasMedia || false,
            mediaData: message.hasMedia ? {
                mimetype: message._data.mimetype,
                filename: message._data.filename,
                caption: message._data.caption,
                size: message._data.size
            } : null,
            quotedMessage: message.hasQuotedMsg ? {
                id: message._data.quotedMsg.id,
                body: message._data.quotedMsg.body,
                author: message._data.quotedMsg.author
            } : null,
            isForwarded: message.isForwarded || false,
            forwardingScore: message.forwardingScore || 0,
            isStarred: message.isStarred || false,
            broadcast: message.broadcast || false,
            fromMe: message.fromMe || false,
            deviceType: message.deviceType || null,
            isStatus: message.isStatus || false,
            links: message.links || [],
            mentionedIds: message.mentionedIds || [],
            location: message.location || null,
            vCards: message.vCards || [],
            isGif: message.isGif || false,
            archived: new Date().toISOString()
        };
    }

    getArchiveFilePath(messageData) {
        const date = new Date(messageData.timestamp);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');

        const monthPath = path.join(this.messagesPath, year, month);
        
        let categoryPath;
        switch (messageData.chatType) {
            case 'group':
                categoryPath = path.join(monthPath, 'groups');
                break;
            case 'status':
                categoryPath = path.join(monthPath, 'status');
                break;
            default:
                categoryPath = path.join(monthPath, 'individual');
        }

        // Use chat ID as filename (sanitized)
        const sanitizedChatId = messageData.chatId.replace(/[^a-zA-Z0-9@.-]/g, '_');
        return path.join(categoryPath, `${sanitizedChatId}_${day}.json`);
    }

    async searchMessages(criteria) {
        const {
            chatId,
            dateFrom,
            dateTo,
            text,
            author,
            hasMedia,
            limit = 50
        } = criteria;

        const results = [];
        
        try {
            // Determine date range to search
            const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            const endDate = dateTo ? new Date(dateTo) : new Date();

            // Get all archive files in date range
            const archiveFiles = await this.getArchiveFilesInRange(startDate, endDate);

            for (const filePath of archiveFiles) {
                try {
                    const archiveData = await fs.readJson(filePath);
                    
                    for (const message of archiveData.messages || []) {
                        // Apply filters
                        if (chatId && message.chatId !== chatId) continue;
                        if (author && message.author !== author) continue;
                        if (hasMedia !== undefined && message.hasMedia !== hasMedia) continue;
                        if (text && !message.body.toLowerCase().includes(text.toLowerCase())) continue;

                        results.push(message);

                        if (results.length >= limit) {
                            break;
                        }
                    }

                    if (results.length >= limit) {
                        break;
                    }

                } catch (error) {
                    console.error(`⚠️ Failed to read archive file ${filePath}:`, error);
                }
            }

        } catch (error) {
            console.error('❌ Error searching messages:', error);
        }

        return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    async getArchiveFilesInRange(startDate, endDate) {
        const files = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const year = currentDate.getFullYear().toString();
            const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            const day = currentDate.getDate().toString().padStart(2, '0');

            const monthPath = path.join(this.messagesPath, year, month);

            if (await fs.pathExists(monthPath)) {
                const categories = ['individual', 'groups', 'status'];
                
                for (const category of categories) {
                    const categoryPath = path.join(monthPath, category);
                    
                    if (await fs.pathExists(categoryPath)) {
                        const dayFiles = await fs.readdir(categoryPath);
                        
                        for (const filename of dayFiles) {
                            if (filename.endsWith(`_${day}.json`)) {
                                files.push(path.join(categoryPath, filename));
                            }
                        }
                    }
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return files;
    }

    async getMessageById(messageId) {
        try {
            // Search recent messages first (last 7 days)
            const recentMessages = await this.searchMessages({
                limit: 1000
            });

            for (const message of recentMessages) {
                if (message.id === messageId) {
                    return message;
                }
            }

            return null;

        } catch (error) {
            console.error('❌ Error getting message by ID:', error);
            return null;
        }
    }

    async getChatHistory(chatId, limit = 100) {
        return await this.searchMessages({
            chatId: chatId,
            limit: limit
        });
    }

    async getArchiveStats() {
        try {
            const stats = {
                totalMessages: 0,
                totalChats: new Set(),
                messagesByType: {},
                messagesByDate: {},
                oldestMessage: null,
                newestMessage: null
            };

            const yearDirs = await fs.readdir(this.messagesPath);
            
            for (const year of yearDirs) {
                const yearPath = path.join(this.messagesPath, year);
                if (!(await fs.stat(yearPath)).isDirectory()) continue;

                const monthDirs = await fs.readdir(yearPath);
                
                for (const month of monthDirs) {
                    const monthPath = path.join(yearPath, month);
                    if (!(await fs.stat(monthPath)).isDirectory()) continue;

                    const categories = ['individual', 'groups', 'status'];
                    
                    for (const category of categories) {
                        const categoryPath = path.join(monthPath, category);
                        
                        if (await fs.pathExists(categoryPath)) {
                            const files = await fs.readdir(categoryPath);
                            
                            for (const filename of files) {
                                if (!filename.endsWith('.json')) continue;

                                try {
                                    const archiveData = await fs.readJson(path.join(categoryPath, filename));
                                    const messages = archiveData.messages || [];
                                    
                                    stats.totalMessages += messages.length;
                                    stats.totalChats.add(archiveData.chatId);

                                    for (const message of messages) {
                                        // Count by type
                                        stats.messagesByType[message.type] = 
                                            (stats.messagesByType[message.type] || 0) + 1;

                                        // Count by date
                                        stats.messagesByDate[message.date] = 
                                            (stats.messagesByDate[message.date] || 0) + 1;

                                        // Track oldest/newest
                                        if (!stats.oldestMessage || message.timestamp < stats.oldestMessage) {
                                            stats.oldestMessage = message.timestamp;
                                        }
                                        if (!stats.newestMessage || message.timestamp > stats.newestMessage) {
                                            stats.newestMessage = message.timestamp;
                                        }
                                    }

                                } catch (error) {
                                    console.error(`⚠️ Failed to read archive file ${filename}:`, error);
                                }
                            }
                        }
                    }
                }
            }

            stats.totalChats = stats.totalChats.size;
            return stats;

        } catch (error) {
            console.error('❌ Error getting archive stats:', error);
            return null;
        }
    }

    getQueueStats() {
        return {
            queueSize: this.archiveQueue.length,
            processing: this.processing,
            oldestInQueue: this.archiveQueue.length > 0 ? 
                this.archiveQueue[0].timestamp : null
        };
    }
}

module.exports = MessageArchiver;
