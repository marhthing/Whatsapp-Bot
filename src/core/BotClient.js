const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    generateWAMessageFromContent,
    downloadMediaMessage 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const EventEmitter = require('events');
const path = require('path');

const MessageProcessor = require('./MessageProcessor');
const AccessController = require('./AccessController');
const LoadingReaction = require('./LoadingReaction');
const MessageArchiver = require('./MessageArchiver');
const MediaVault = require('./MediaVault');
const PluginDiscovery = require('./PluginDiscovery');
const StateEngine = require('./StateEngine');
const EventBus = require('./EventBus');

const middlewareLoader = require('../middleware');

class BotClient extends EventEmitter {
    constructor() {
        super();
        
        this.client = null;
        this.messageProcessor = null;
        this.accessController = null;
        this.loadingReaction = null;
        this.messageArchiver = null;
        this.mediaVault = null;
        this.pluginDiscovery = null;
        this.stateEngine = null;
        this.eventBus = null;
        
        this.isInitialized = false;
        this.qrCode = null;
        this.ownerJid = null;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing bot client components...');

            // Initialize event bus first
            this.eventBus = new EventBus();

            // Initialize WhatsApp client
            await this.initializeWhatsAppClient();

            // Initialize core components
            this.accessController = new AccessController();
            await this.accessController.initialize();

            this.loadingReaction = new LoadingReaction(this.client);
            this.messageArchiver = new MessageArchiver();
            await this.messageArchiver.initialize();

            this.mediaVault = new MediaVault();
            await this.mediaVault.initialize();

            this.stateEngine = new StateEngine();
            await this.stateEngine.initialize();

            // Initialize plugin system
            this.pluginDiscovery = new PluginDiscovery();
            await this.pluginDiscovery.initialize();

            // Initialize message processor
            this.messageProcessor = new MessageProcessor({
                client: this.client,
                accessController: this.accessController,
                loadingReaction: this.loadingReaction,
                messageArchiver: this.messageArchiver,
                mediaVault: this.mediaVault,
                stateEngine: this.stateEngine,
                pluginDiscovery: this.pluginDiscovery,
                eventBus: this.eventBus
            });

            // Load middleware
            await middlewareLoader.initialize({
                client: this.client,
                messageProcessor: this.messageProcessor,
                accessController: this.accessController,
                loadingReaction: this.loadingReaction,
                messageArchiver: this.messageArchiver,
                mediaVault: this.mediaVault,
                stateEngine: this.stateEngine,
                eventBus: this.eventBus
            });

            this.isInitialized = true;
            console.log('✅ Bot client initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize bot client:', error);
            throw error;
        }
    }

    async initializeWhatsAppClient() {
        const sessionId = process.env.WHATSAPP_SESSION_ID || 'main';
        const sessionDir = process.env.SESSION_DIR || path.join(process.cwd(), 'sessions', sessionId);
        const authMethod = process.env.AUTH_METHOD || '1';
        const phoneNumber = process.env.PHONE_NUMBER;

        console.log(`🔧 Initializing WhatsApp client for session: ${sessionId}`);
        if (phoneNumber) {
            console.log(`📱 Phone number: ${phoneNumber}`);
            console.log(`🔐 Auth method: ${authMethod === '1' ? 'QR Code' : '8-digit Pairing Code'}`);
        }

        // Initialize Baileys auth state
        const authPath = path.join(sessionDir, 'auth');
        const { state, saveCreds } = await useMultiFileAuthState(authPath);

        // Create Baileys socket
        this.client = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }), // Reduce log noise
            printQRInTerminal: false, // We'll handle QR ourselves
            browser: ['WhatsApp Personal Assistant', 'Chrome', '1.0.0'],
            defaultQueryTimeoutMs: 60000
        });

        // Save credentials when updated
        this.client.ev.on('creds.update', saveCreds);

        // Setup Baileys event handlers
        this.client.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code generated for authentication');
                console.log('🔗 Scan this QR code with your WhatsApp to link the bot to your account');
                this.qrCode = qr;
                this.emit('qr', qr);
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('🔌 Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
                
                if (shouldReconnect) {
                    // Reconnect automatically
                    setTimeout(() => this.initializeWhatsAppClient(), 3000);
                } else {
                    this.emit('auth_failure', 'Logged out');
                }
                
                this.emit('disconnected', lastDisconnect?.error);
            } else if (connection === 'open') {
                console.log('🔐 WhatsApp connection opened successfully!');
                
                // Get owner JID - this is the actual user's JID that the bot will use as its identity
                this.ownerJid = this.client.user.id;
                await this.accessController.setOwnerJid(this.ownerJid);

                console.log(`🔐 Bot ready! Operating as: ${this.ownerJid}`);
                console.log(`✅ Bot will send messages using your WhatsApp account`);
                
                // Save the detected JID to session config
                await this.updateSessionJid(this.ownerJid);
                
                this.qrCode = null;
                this.emit('ready');
            }
        });

        // Handle pairing code for method 2
        if (authMethod === '2' && phoneNumber) {
            try {
                const code = await this.client.requestPairingCode(phoneNumber);
                console.log(`🔐 Your pairing code: ${code}`);
                console.log('📱 Enter this code in WhatsApp Settings > Linked Devices > Link a Device');
                this.emit('pairing_code', code);
            } catch (error) {
                console.error('❌ Failed to request pairing code:', error);
                this.emit('auth_failure', error.message);
            }
        }

        // Handle incoming messages
        this.client.ev.on('messages.upsert', async (m) => {
            const messages = m.messages;
            for (const message of messages) {
                if (message.key.fromMe) continue; // Skip messages sent by the bot
                try {
                    if (this.messageProcessor) {
                        await this.messageProcessor.processMessage(message);
                    }
                } catch (error) {
                    console.error('❌ Error processing message:', error);
                    this.eventBus.emit('error', { type: 'message_processing', error, message });
                }
            }
        });

        // Handle message deletions
        this.client.ev.on('messages.delete', async (messageDelete) => {
            try {
                if (this.messageProcessor) {
                    await this.messageProcessor.processDeletedMessage(messageDelete);
                }
            } catch (error) {
                console.error('❌ Error processing deleted message:', error);
            }
        });

        console.log('🔧 WhatsApp client initialization started...');
    }

    /**
     * Update session configuration with detected JID
     */
    async updateSessionJid(detectedJid) {
        try {
            const sessionDir = process.env.SESSION_DIR;
            if (!sessionDir) return;

            const fs = require('fs').promises;
            
            // Update session config
            const configPath = path.join(sessionDir, 'config.json');
            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configData);
                
                config.ownerJid = detectedJid;
                config.authStatus = 'authenticated';
                config.lastActive = new Date().toISOString();
                
                await fs.writeFile(configPath, JSON.stringify(config, null, 2));
                console.log(`💾 Updated session config with JID: ${detectedJid}`);
            } catch (error) {
                console.warn('⚠️ Could not update session config:', error.message);
            }

            // Update metadata
            const metadataPath = path.join(sessionDir, 'metadata.json');
            try {
                const metadataData = await fs.readFile(metadataPath, 'utf8');
                const metadata = JSON.parse(metadataData);
                
                metadata.OWNER_JID = detectedJid;
                
                await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
                console.log(`💾 Updated session metadata with JID`);
            } catch (error) {
                console.warn('⚠️ Could not update session metadata:', error.message);
            }

            // Update environment variable
            process.env.OWNER_JID = detectedJid;
            
        } catch (error) {
            console.error('❌ Failed to update session JID:', error);
        }
    }

    async sendMessage(chatId, content, options = {}) {
        if (!this.isReady()) {
            throw new Error('Bot client is not ready');
        }

        try {
            let message;
            
            if (typeof content === 'string') {
                message = await this.client.sendMessage(chatId, { text: content, ...options });
            } else if (content.mimetype) {
                // Media message
                message = await this.client.sendMessage(chatId, content);
            } else {
                throw new Error('Invalid message content type');
            }

            // Archive sent message
            if (this.messageArchiver) {
                await this.messageArchiver.archiveMessage(message);
            }
            
            return message;

        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    async sendReaction(message, emoji) {
        if (!this.isReady()) {
            return false;
        }

        try {
            const reactionMessage = {
                react: {
                    text: emoji,
                    key: message.key
                }
            };
            await this.client.sendMessage(message.key.remoteJid, reactionMessage);
            return true;
        } catch (error) {
            console.error('❌ Failed to send reaction:', error);
            return false;
        }
    }

    async downloadMedia(message) {
        if (!message.message?.imageMessage && !message.message?.videoMessage && 
            !message.message?.audioMessage && !message.message?.documentMessage &&
            !message.message?.stickerMessage) {
            return null;
        }

        try {
            const buffer = await downloadMediaMessage(message, 'buffer', {});
            return buffer;
        } catch (error) {
            console.error('❌ Failed to download media:', error);
            return null;
        }
    }

    isReady() {
        return this.client && this.client.user && this.isInitialized;
    }

    getStatus() {
        return {
            ready: this.isReady(),
            authenticated: this.client?.user ? true : false,
            ownerJid: this.ownerJid,
            qrCode: this.qrCode,
            uptime: process.uptime()
        };
    }

    async destroy() {
        try {
            if (this.client) {
                await this.client.logout();
            }
            
            if (this.messageProcessor) {
                await this.messageProcessor.shutdown();
            }

            console.log('✅ Bot client destroyed');
        } catch (error) {
            console.error('❌ Error destroying bot client:', error);
        }
    }
}

module.exports = BotClient;
