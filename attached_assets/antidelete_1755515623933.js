// features/antidelete/antidelete.js
const fs = require('fs-extra');
const path = require('path');
const logger = require('../../utils/logger');
const settingsFile = path.join(__dirname, '../../storage/antidelete.json');

// Default settings
const defaultSettings = {
    enabled: false,
    recipientJid: ''
};

// Store references for event handling
let sock = null;
let messageStorage = null;
let recentMessages = new Map(); // Store recent messages for cross-referencing

async function getSettings() {
    try {
        await fs.ensureDir(path.dirname(settingsFile));
        
        if (!await fs.pathExists(settingsFile)) {
            await fs.writeJson(settingsFile, defaultSettings, { spaces: 2 });
            return defaultSettings;
        }
        return await fs.readJson(settingsFile);
    } catch (error) {
        logger.error('Error getting anti-delete settings:', error);
        return defaultSettings;
    }
}

async function saveSettings(settings) {
    try {
        await fs.ensureDir(path.dirname(settingsFile));
        await fs.writeJson(settingsFile, settings, { spaces: 2 });
        logger.info('✅ Anti-delete settings saved');
    } catch (error) {
        logger.error('Error saving anti-delete settings:', error);
    }
}

function cleanupOldMessages() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    let cleaned = 0;
    for (const [messageId, data] of recentMessages.entries()) {
        if (now - data.timestamp > maxAge) {
            recentMessages.delete(messageId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        logger.debug(`🧹 Cleaned up ${cleaned} old messages from cache`);
    }
}

// Initialize event handling for anti-delete
function initializeEventHandling(sockInstance, messageStorageInstance) {
    sock = sockInstance;
    messageStorage = messageStorageInstance;
    
    logger.info('🛡️ Anti-delete event handling initialized');
    
    // Listen for message events
    sock.ev.on('messages.upsert', handleMessagesUpsert);
    sock.ev.on('messages.update', handleMessagesUpdate);
    
    // Clean up old messages from memory every 5 minutes
    setInterval(() => {
        cleanupOldMessages();
    }, 5 * 60 * 1000);
}

// Handle new messages (for tracking)
async function handleMessagesUpsert(messageUpdate) {
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;
        
        for (const message of messages) {
            if (!message || !message.key) continue;
            
            const jid = message.key.remoteJid;
            const messageId = message.key.id;
            
            // Skip invalid messages or problematic JIDs
            if (!jid || !messageId || shouldSkipJid(jid)) continue;
            
            // Check if this is a protocol message indicating deletion
            if (message.message?.protocolMessage) {
                const settings = await getSettings();
                if (settings.enabled) {
                    logger.info('🔍 Protocol message detected - handling deletion');
                    await handleProtocolMessage(message, settings);
                }
                continue;
            }
            
            // Store regular messages in cache for deletion detection
            recentMessages.set(messageId, {
                jid: jid,
                message: message,
                timestamp: Date.now()
            });
            
            logger.debug(`📝 Stored message ${messageId} in cache from ${jid}`);
        }
    } catch (error) {
        logger.error('❌ Error handling messages upsert:', error);
    }
}

// Handle message updates (includes deletions)
async function handleMessagesUpdate(updates) {
    try {
        const settings = await getSettings();
        if (!settings.enabled) return;
        
        for (const update of updates) {
            logger.debug(`🔍 Message update received for: ${update.key?.id}`);
            
            // Check for message deletions
            if (update.update?.messageStubType === 68 || // MESSAGE_REVOKE
                update.update?.message?.protocolMessage?.type === 0) {
                
                logger.info('🗑️ Deletion detected via message update');
                await handleMessageDeletion(update, settings);
            }
        }
    } catch (error) {
        logger.error('❌ Error handling messages update:', error);
    }
}

// Handle protocol messages (main deletion detection method)
async function handleProtocolMessage(message, settings) {
    try {
        const protocolMessage = message.message.protocolMessage;
        
        if (!protocolMessage || !protocolMessage.key) {
            return;
        }
        
        // Check if this is a deletion (REVOKE type)
        if (protocolMessage.type === 0) { // 0 = REVOKE
            const deletedMessageKey = protocolMessage.key;
            const messageId = deletedMessageKey.id;
            
            if (!messageId) {
                logger.debug('❌ No message ID in protocol message');
                return;
            }
            
            logger.info(`🗑️ DELETION DETECTED - MessageID: ${messageId}`);
            
            // Process the deletion
            await processDeletion(messageId, deletedMessageKey, settings);
        }
    } catch (error) {
        logger.error('❌ Error handling protocol message:', error);
    }
}

// Process a deletion with comprehensive lookup
async function processDeletion(messageId, deletedMessageKey, settings) {
    try {
        let originalMessage = null;
        let chatJid = null;
        let foundInCache = false;
        
        // Step 1: Check cache first
        if (recentMessages.has(messageId)) {
            const cachedData = recentMessages.get(messageId);
            originalMessage = cachedData.message;
            chatJid = cachedData.jid;
            foundInCache = true;
            logger.info(`📦 Found deleted message in cache - Chat: ${chatJid}`);
        } else {
            // Step 2: Search in message storage
            logger.info(`🔍 Searching for message ${messageId} in storage...`);
            
            try {
                const storedMessage = await messageStorage.findMessageById(messageId);
                
                if (storedMessage) {
                    originalMessage = reconstructMessage(storedMessage);
                    chatJid = storedMessage.jid;
                    logger.info(`💾 Found deleted message in storage - Chat: ${chatJid}`);
                }
            } catch (storageError) {
                logger.error('❌ Error searching message storage:', storageError);
            }
        }
        
        if (originalMessage && chatJid) {
            // Mark as deleted in storage (if not found in cache)
            if (!foundInCache) {
                try {
                    await messageStorage.markMessageAsDeleted(chatJid, messageId);
                } catch (markError) {
                    logger.error('❌ Error marking message as deleted:', markError);
                }
            }
            
            // Get participant info
            const participant = deletedMessageKey.participant || 
                              originalMessage.key?.participant || 
                              (originalMessage.key?.fromMe ? 'Bot' : null);
            
            // Send deletion alert
            await sendDeletedMessageAlert(sock, originalMessage, settings, participant, chatJid);
            logger.info(`✅ Anti-delete alert sent for message: ${messageId}`);
            
            // Clean up cache
            recentMessages.delete(messageId);
        } else {
            // Message not found anywhere
            logger.warn(`⚠️ Message ${messageId} not found in cache or storage`);
        }
        
    } catch (error) {
        logger.error('❌ Error processing deletion:', error);
    }
}

// Handle message deletion from updates
async function handleMessageDeletion(update, settings) {
    try {
        let messageId = update.key?.id;
        
        // Try different ways to get message ID
        if (!messageId) {
            messageId = update.update?.message?.protocolMessage?.key?.id;
        }
        
        if (!messageId) {
            logger.debug('❌ No message ID found in deletion event');
            return;
        }
        
        logger.info(`🗑️ Processing deletion for MessageID: ${messageId}`);
        
        // Get the protocol message key for context
        const protocolMessageKey = update.update?.message?.protocolMessage?.key || update.key;
        
        await processDeletion(messageId, protocolMessageKey, settings);
        
    } catch (error) {
        logger.error('❌ Error handling message deletion:', error);
    }
}

// Reconstruct WhatsApp message format from stored message
function reconstructMessage(storedMessage) {
    return {
        key: {
            remoteJid: storedMessage.jid,
            id: storedMessage.id,
            fromMe: storedMessage.fromMe || false,
            participant: storedMessage.participant
        },
        message: storedMessage.originalMessage || storedMessage.message || {},
        messageTimestamp: storedMessage.timestamp,
        pushName: storedMessage.pushName || storedMessage.sender
    };
}

async function sendDeletedMessageAlert(sock, originalMessage, settings, participant, chatJid) {
    try {
        const recipientJid = settings.recipientJid || sock.user.id;
        
        logger.info(`📤 Sending deletion alert to: ${recipientJid}`);
        
        // Get actual sender JID (not the display name)
        const senderJid = participant || originalMessage.key?.participant || originalMessage.key?.remoteJid;
        const messageId = originalMessage.key.id;
        
        logger.debug(`Sender JID: ${senderJid}`);
        
        // Check if we have stored message data
        let storedMessage = null;
        try {
            storedMessage = await messageStorage.findMessageById(messageId);
        } catch (error) {
            logger.warn('Could not retrieve stored message details:', error);
            return; // Exit if we can't get stored message
        }
        
        if (!storedMessage) {
            logger.warn('No stored message found, skipping alert');
            return; // Exit if no stored message
        }
        
        // Create proper contextInfo for tagging with actual sender JID
        const contextInfo = {
            quotedMessage: {
                conversation: "" // Empty as requested
            },
            participant: senderJid, // Use actual JID, not display name
            remoteJid: chatJid
        };
        
        // Forward based on message type
        if (isMediaType(storedMessage.message?.type)) {
            logger.info(`📸 Forwarding deleted media as tagged message...`);
            await forwardStoredMediaMessageAsTagged(sock, messageId, storedMessage, recipientJid, contextInfo);
        } else if (storedMessage.message?.type === 'text') {
            // Forward text as tagged message - just the plain text, no emojis
            await sock.sendMessage(recipientJid, { 
                text: storedMessage.message.text,
                contextInfo: contextInfo
            });
            logger.info(`✅ Deleted text message forwarded as tagged message`);
        }
        // Remove all other fallback cases - if it's not text or media, don't send anything
        
    } catch (error) {
        logger.error('❌ Error sending deleted message alert:', error);
    }
}

async function forwardStoredMediaMessageAsTagged(sock, messageId, storedMessage, recipientJid, contextInfo) {
    try {
        const messageContent = storedMessage.message;
        const mediaType = messageContent.type;

        // Get media buffer from storage
        const mediaBuffer = await messageStorage.getMediaBuffer(messageId);
        if (!mediaBuffer) {
            logger.warn(`No media buffer found for ${messageId}, skipping`);
            return; // Don't send anything if media not available
        }

        logger.info(`📤 Forwarding deleted ${mediaType} as tagged message`);

        let messageToSend = {};
        
        switch (mediaType) {
            case 'image':
                messageToSend = { 
                    image: mediaBuffer, 
                    caption: messageContent.caption || undefined,
                    contextInfo: contextInfo
                };
                break;
                
            case 'video':
                messageToSend = { 
                    video: mediaBuffer, 
                    caption: messageContent.caption || undefined,
                    contextInfo: contextInfo
                };
                break;
                
            case 'audio':
            case 'voice':
                messageToSend = { 
                    audio: mediaBuffer, 
                    ptt: messageContent.media?.ptt || false,
                    mimetype: messageContent.media?.mimetype || 'audio/mpeg',
                    contextInfo: contextInfo
                };
                break;
                
            case 'document':
                messageToSend = { 
                    document: mediaBuffer, 
                    fileName: messageContent.media?.fileName || 'deleted_document',
                    mimetype: messageContent.media?.mimetype || 'application/octet-stream',
                    caption: messageContent.caption || undefined,
                    contextInfo: contextInfo
                };
                break;
                
            case 'sticker':
                messageToSend = { 
                    sticker: mediaBuffer,
                    contextInfo: contextInfo
                };
                break;
                
            default:
                logger.warn(`Unknown media type: ${mediaType}, skipping`);
                return; // Don't send anything for unknown types
        }
        
        // Send the media message with tag
        await sock.sendMessage(recipientJid, messageToSend);
        logger.info(`✅ Successfully forwarded deleted ${mediaType} as tagged message`);

    } catch (error) {
        logger.error('❌ Error forwarding tagged media message:', error);
        // Remove all fallback error messages - just log and exit
    }
}

// Helper functions
function getSenderInfo(originalMessage, participant) {
    if (originalMessage.key?.fromMe) {
        return 'You (Bot)';
    }
    
    if (originalMessage.pushName && originalMessage.pushName.trim()) {
        return originalMessage.pushName;
    }
    
    const senderJid = participant || originalMessage.key?.participant || originalMessage.key?.remoteJid;
    if (senderJid && senderJid.includes('@')) {
        return senderJid.split('@')[0];
    }
    
    return 'Unknown User';
}

function getChatInfo(jid, chatType) {
    if (!jid) return 'Unknown Chat';
    
    const jidDisplay = jid.split('@')[0];
    
    switch (chatType) {
        case 'private':
            return `Private Chat (+${jidDisplay})`;
        case 'group':
            return `Group Chat (${jidDisplay})`;
        default:
            return `${chatType} (${jidDisplay})`;
    }
}

function getChatType(jid) {
    if (!jid) return 'unknown';
    if (jid.includes('@g.us')) return 'group';
    if (jid.includes('@s.whatsapp.net')) return 'private';
    return 'unknown';
}

function isMediaType(messageType) {
    const mediaTypes = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];
    return mediaTypes.includes(messageType);
}

function shouldSkipJid(jid) {
    if (!jid || typeof jid !== 'string') return true;
    
    return jid.includes('@newsletter') || 
           jid === 'status@broadcast' ||
           jid.includes('@broadcast') ||
           jid.includes('lid');
}

async function execute({ message, args, sock }) {
    const fromJid = message.key.remoteJid;
    const settings = await getSettings();
    const command = args[0]?.toLowerCase();

    if (!command) {
        // Show current status
        const status = settings.enabled ? 'enabled' : 'disabled';
        const recipient = settings.recipientJid || 'the bot owner\'s chat';
        await sock.sendMessage(fromJid, { 
            text: `🗂️ *Anti-delete Status*\n\n` +
                  `Status: *${status}*\n` +
                  `Forward to: ${recipient}\n\n` +
                  `Commands:\n` +
                  `• \`.delete on\` - Enable anti-delete\n` +
                  `• \`.delete off\` - Disable anti-delete\n` +
                  `• \`.delete <jid>\` - Set recipient JID\n\n` +
                  `JID formats:\n` +
                  `• Private: 1234567890@s.whatsapp.net\n` +
                  `• Group: 120363xxxxx@g.us`
        });
        return;
    }

    if (command === 'on') {
        settings.enabled = true;
        await saveSettings(settings);
        await sock.sendMessage(fromJid, { 
            text: '✅ Anti-delete feature is now *enabled*.\n\n' +
                  '🔍 Deleted messages will be monitored and forwarded to the set recipient.' 
        });
    } else if (command === 'off') {
        settings.enabled = false;
        await saveSettings(settings);
        await sock.sendMessage(fromJid, { text: '❌ Anti-delete feature is now *disabled*.' });
    } else if (args[0].includes('@s.whatsapp.net') || args[0].includes('@g.us')) {
        settings.recipientJid = args[0];
        await saveSettings(settings);
        await sock.sendMessage(fromJid, { text: `✅ Deleted messages will now be forwarded to:\n*${args[0]}*` });
    } else {
        await sock.sendMessage(fromJid, { 
            text: `⚠️ Invalid command format.\n\n` +
                  `*Usage:*\n` +
                  `• \`.delete on\` - Enable\n` +
                  `• \`.delete off\` - Disable\n` +
                  `• \`.delete <jid>\` - Set recipient\n\n` +
                  `*JID formats:*\n` +
                  `• Private: 1234567890@s.whatsapp.net\n` +
                  `• Group: 120363xxxxx@g.us` 
        });
    }
}

module.exports = {
    command: 'delete',
    execute,
    getSettings,
    saveSettings,
    initializeEventHandling,
    // Deprecated exports for compatibility
    handlePotentialDeletion: async () => {},
    isMessageDeleted: () => false,
    handleDeletedMessage: async () => {}
};