const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
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
        const sessionName = process.env.SESSION_NAME || 'main';
        const sessionPath = path.join(process.cwd(), 'sessions', `session_${sessionName}`);

        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionName,
                dataPath: sessionPath
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            }
        });

        // Setup WhatsApp client event handlers
        this.client.on('qr', (qr) => {
            this.qrCode = qr;
            this.emit('qr', qr);
        });

        this.client.on('authenticated', () => {
            this.emit('authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            this.emit('auth_failure', msg);
        });

        this.client.on('ready', async () => {
            this.qrCode = null;
            
            // Get owner JID
            this.ownerJid = this.client.info.wid._serialized;
            await this.accessController.setOwnerJid(this.ownerJid);

            console.log(`🔐 Bot ready for owner: ${this.ownerJid}`);
            this.emit('ready');
        });

        this.client.on('message', async (message) => {
            try {
                await this.messageProcessor.processMessage(message);
            } catch (error) {
                console.error('❌ Error processing message:', error);
                this.eventBus.emit('error', { type: 'message_processing', error, message });
            }
        });

        this.client.on('message_revoke_everyone', async (after, before) => {
            try {
                await this.messageProcessor.processDeletedMessage(after, before);
            } catch (error) {
                console.error('❌ Error processing deleted message:', error);
            }
        });

        this.client.on('disconnected', (reason) => {
            this.emit('disconnected', reason);
        });

        // Initialize client
        await this.client.initialize();
    }

    async sendMessage(chatId, content, options = {}) {
        if (!this.isReady()) {
            throw new Error('Bot client is not ready');
        }

        try {
            let message;
            
            if (typeof content === 'string') {
                message = await this.client.sendMessage(chatId, content, options);
            } else if (content instanceof MessageMedia) {
                message = await this.client.sendMessage(chatId, content, options);
            } else {
                throw new Error('Invalid message content type');
            }

            // Archive sent message
            await this.messageArchiver.archiveMessage(message);
            
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
            await message.react(emoji);
            return true;
        } catch (error) {
            console.error('❌ Failed to send reaction:', error);
            return false;
        }
    }

    async downloadMedia(message) {
        if (!message.hasMedia) {
            return null;
        }

        try {
            return await message.downloadMedia();
        } catch (error) {
            console.error('❌ Failed to download media:', error);
            return null;
        }
    }

    isReady() {
        return this.client && this.client.info && this.isInitialized;
    }

    getStatus() {
        return {
            ready: this.isReady(),
            authenticated: this.client?.info ? true : false,
            ownerJid: this.ownerJid,
            qrCode: this.qrCode,
            uptime: process.uptime()
        };
    }

    async destroy() {
        try {
            if (this.client) {
                await this.client.destroy();
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
