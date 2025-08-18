const { Converter } = require('./converter');
const { Upscaler } = require('./upscaler');
const { Analyzer } = require('./analyzer');

class MediaToolsPlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.commands = {};
        this.converter = null;
        this.upscaler = null;
        this.analyzer = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🎨 Initializing Media Tools plugin...');
            
            // Initialize components
            this.converter = new Converter(this.botClient, this.eventBus);
            this.upscaler = new Upscaler(this.botClient, this.eventBus);
            this.analyzer = new Analyzer(this.botClient, this.eventBus);
            
            await this.converter.initialize();
            await this.upscaler.initialize();
            await this.analyzer.initialize();
            
            // Initialize commands
            this.initializeCommands();
            
            this.isInitialized = true;
            console.log('✅ Media Tools plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Media Tools plugin:', error);
            throw error;
        }
    }

    initializeCommands() {
        this.commands = {
            convert: this.converter.convert.bind(this.converter),
            upscale: this.upscaler.upscale.bind(this.upscaler),
            analyze: this.analyzer.analyze.bind(this.analyzer),
            mediainfo: this.analyzer.mediaInfo.bind(this.analyzer),
            compress: this.converter.compress.bind(this.converter),
            extract: this.converter.extract.bind(this.converter)
        };
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down Media Tools plugin...');
            
            if (this.converter) {
                await this.converter.shutdown();
            }
            
            if (this.upscaler) {
                await this.upscaler.shutdown();
            }
            
            if (this.analyzer) {
                await this.analyzer.shutdown();
            }
            
            this.isInitialized = false;
            
            console.log('✅ Media Tools plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during Media Tools plugin shutdown:', error);
        }
    }
}

module.exports = MediaToolsPlugin;
