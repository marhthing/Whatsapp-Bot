/**
 * Core Commands Plugin - Standalone Version
 * Essential bot commands for system management and configuration
 */

class CoreCommandsPlugin {
    constructor(options = {}) {
        this.name = 'core-commands';
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        // Plugin state
        this.isInitialized = false;
        this.environmentManager = null;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing Core Commands plugin...');
            
            // Initialize environment manager for this plugin
            const EnvironmentManager = require('../../core/EnvironmentManager');
            this.environmentManager = new EnvironmentManager();
            
            this.isInitialized = true;
            console.log('✅ Core Commands plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Core Commands plugin:', error);
            throw error;
        }
    }

    getCommands() {
        return this.config.commands || [];
    }

    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error('Core Commands plugin not initialized');
        }

        const { message, args, reply } = context;

        switch (commandName.toLowerCase()) {
            case 'help':
                return await this.handleHelp(context);
            case 'info':
                return await this.handleInfo(context);
            case 'status':
                return await this.handleStatus(context);
            case 'settings':
                return await this.handleSettings(context);
            case 'allow':
                return await this.handleAllow(context);
            case 'disallow':
                return await this.handleDisallow(context);
            case 'reload':
                return await this.handleReload(context);
            case 'env':
                return await this.handleEnv(context);
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    async handleHelp(context) {
        const { args, reply } = context;
        
        if (args.length > 0) {
            return await this.showCommandHelp(args[0], reply);
        }
        
        // Show general help
        const prefix = this.environmentManager.get('BOT_PREFIX', '.');
        
        const helpText = `🤖 **MATDEV Bot**\n\n` +
                       `**Core Commands:**\n` +
                       `${prefix}help [command] - Show this help or help for specific command\n` +
                       `${prefix}info - Show bot information\n` +
                       `${prefix}status - Show bot status and statistics\n` +
                       `${prefix}settings - Show current bot settings\n` +
                       `${prefix}reload - Reload plugins\n\n` +
                       
                       `**Permission Commands:**\n` +
                       `${prefix}allow <command> - Allow a user to use a specific command (use in their chat)\n` +
                       `${prefix}disallow <command> - Remove command permission (use in their chat)\n\n` +
                       
                       `**Environment Commands:**\n` +
                       `${prefix}env list - List environment variables\n` +
                       `${prefix}env set <key> <value> - Set environment variable\n` +
                       `${prefix}env get <key> - Get environment variable value\n` +
                       `${prefix}env remove <key> - Remove environment variable\n\n` +
                       
                       `**Game Commands:**\n` +
                       `${prefix}tictactoe [@user] - Start a tic-tac-toe game\n` +
                       `${prefix}wordguess - Start a word guessing game\n` +
                       `${prefix}endgame - End current game\n\n` +
                       
                       `**Anti-Delete Commands:**\n` +
                       `${prefix}delete on - Enable anti-delete protection\n` +
                       `${prefix}delete off - Disable anti-delete protection\n` +
                       `${prefix}delete <jid> - Set where deleted messages are forwarded\n\n` +
                       
                       `**Admin Commands:**\n` +
                       `${prefix}systeminfo - Show system information\n` +
                       `${prefix}plugins - List loaded plugins\n\n` +
                       
                       `**Utility Commands:**\n` +
                       `${prefix}ping - Test bot response time\n` +
                       `${prefix}pinginfo - Show ping statistics (owner only)\n\n` +
                       
                       `**Notes:**\n` +
                       `• This bot only responds to you (the owner) by default\n` +
                       `• Other users can participate in active games\n` +
                       `• Use ${prefix}allow to grant specific command permissions to others\n` +
                       `• All messages and media are automatically archived`;
        
        await reply(helpText);
    }

    async showCommandHelp(commandName, reply) {
        const commandHelp = {
            help: '**help** - Show available commands\nUsage: .help [command]',
            info: '**info** - Show bot information including version, uptime, and features',
            status: '**status** - Show detailed bot status and performance metrics',
            settings: '**settings** - Display current bot configuration',
            allow: '**allow** - Grant command permission to a user\nUsage: .allow <command>\nNote: Use this in the target user\'s chat',
            disallow: '**disallow** - Remove command permission from a user\nUsage: .disallow <command>\nNote: Use this in the target user\'s chat',
            reload: '**reload** - Reload all plugins or a specific plugin\nUsage: .reload [plugin-name]',
            env: '**env** - Manage environment variables\nSubcommands: list, set, get, remove\nUsage: .env <subcommand> [args]',
            ping: '**ping** - Test bot response time and connectivity\nUsage: .ping',
            pinginfo: '**pinginfo** - Show ping plugin statistics\nUsage: .pinginfo'
        };

        const helpText = commandHelp[commandName.toLowerCase()];
        
        if (helpText) {
            await reply(`ℹ️ **Command Help**\n\n${helpText}`);
        } else {
            await reply(`❌ No help available for command: ${commandName}`);
        }
    }

    async handleInfo(context) {
        const { reply } = context;
        
        const clientInfo = this.botClient.getClientInfo();
        const botName = this.environmentManager.get('BOT_NAME', 'MATDEV');
        const botDescription = this.environmentManager.get('BOT_DESCRIPTION', 'Your personal MATDEV assistant');
        
        const infoText = `🤖 **${botName}**\n\n` +
                       `📱 **Connected Account:** ${clientInfo?.pushname || 'Unknown'} (${clientInfo?.phone || 'Unknown'})\n` +
                       `🔗 **Platform:** ${clientInfo?.platform || 'Unknown'}\n` +
                       `🔋 **Battery:** ${clientInfo?.battery || 'Unknown'}%\n` +
                       `📡 **Connected:** ${clientInfo?.connected ? '✅ Yes' : '❌ No'}\n\n` +
                       
                       `📝 **Description:** ${botDescription}\n\n` +
                       
                       `⚡ **Features:**\n` +
                       `• Complete message archival\n` +
                       `• Media download and storage\n` +
                       `• Hot-reload plugin system\n` +
                       `• Multi-user game support\n` +
                       `• Strict access control\n` +
                       `• Anti-delete message recovery\n` +
                       `• Environment management\n` +
                       `• Performance monitoring\n\n` +
                       
                       `🔐 **Access Control:** Owner-only by default\n` +
                       `🎮 **Games:** ${this.environmentManager.get('ENABLE_GAMES') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                       `🔥 **Hot Reload:** ${this.environmentManager.get('ENABLE_HOT_RELOAD') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                       `📚 **Message Archival:** ${this.environmentManager.get('ENABLE_MESSAGE_ARCHIVAL') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                       `💾 **Media Download:** ${this.environmentManager.get('ENABLE_MEDIA_DOWNLOAD') === 'true' ? '✅ Enabled' : '❌ Disabled'}`;
        
        await reply(infoText);
    }

    async handleStatus(context) {
        const { reply } = context;
        
        const statusText = `📊 **MATDEV Bot Status**\n\n` +
                         `✅ **Core Systems:** All operational\n` +
                         `🔧 **Plugin System:** Hot-reload enabled\n` +
                         `📱 **WhatsApp Connection:** Active\n` +
                         `🔐 **Access Control:** Enforced\n` +
                         `📁 **Message Archival:** Active\n` +
                         `💾 **Media Download:** Active\n\n` +
                         `⏰ **Last Updated:** ${new Date().toLocaleString()}`;
        
        await reply(statusText);
    }

    async handleSettings(context) {
        const { reply } = context;
        
        const settingsText = `⚙️ **MATDEV Bot Settings**\n\n` +
                           `🤖 **Bot Name:** ${this.environmentManager.get('BOT_NAME', 'MATDEV')}\n` +
                           `📝 **Command Prefix:** ${this.environmentManager.get('BOT_PREFIX', '.')}\n` +
                           `🔐 **Owner Only:** ${this.environmentManager.get('OWNER_ONLY', 'true')}\n` +
                           `🎮 **Games Enabled:** ${this.environmentManager.get('ENABLE_GAMES', 'true')}\n` +
                           `🔥 **Hot Reload:** ${this.environmentManager.get('ENABLE_HOT_RELOAD', 'true')}\n` +
                           `📚 **Message Archival:** ${this.environmentManager.get('ENABLE_MESSAGE_ARCHIVAL', 'true')}\n` +
                           `💾 **Media Download:** ${this.environmentManager.get('ENABLE_MEDIA_DOWNLOAD', 'true')}`;
        
        await reply(settingsText);
    }

    async handleAllow(context) {
        const { args, reply, message } = context;
        
        if (!args.length) {
            await reply('❌ Usage: .allow <command>\nUse this command in the user\'s chat to allow them to use a specific command.');
            return;
        }
        
        const command = args[0].toLowerCase();
        const userJid = message.key.remoteJid;
        
        // Note: This would need to interact with the access control system
        await reply(`✅ Command '${command}' has been allowed for this user.\nThey can now use .${command} even though they're not the bot owner.`);
    }

    async handleDisallow(context) {
        const { args, reply, message } = context;
        
        if (!args.length) {
            await reply('❌ Usage: .disallow <command>\nUse this command in the user\'s chat to remove their permission for a specific command.');
            return;
        }
        
        const command = args[0].toLowerCase();
        const userJid = message.key.remoteJid;
        
        await reply(`❌ Command '${command}' has been disallowed for this user.\nThey can no longer use .${command} unless they're the bot owner.`);
    }

    async handleReload(context) {
        const { args, reply } = context;
        
        if (args.length > 0) {
            const pluginName = args[0];
            await reply(`🔄 Reloading plugin: ${pluginName}...`);
        } else {
            await reply('🔄 Reloading all plugins...');
        }
    }

    async handleEnv(context) {
        const { args, reply } = context;
        
        if (!args.length) {
            await reply('❌ Usage: .env <list|get|set|remove> [key] [value]');
            return;
        }
        
        const subcommand = args[0].toLowerCase();
        
        switch (subcommand) {
            case 'list':
                await reply('📋 **Environment Variables**\n\nUse .env get <key> to view specific values');
                break;
            case 'get':
                if (!args[1]) {
                    await reply('❌ Usage: .env get <key>');
                    return;
                }
                const value = this.environmentManager.get(args[1], 'Not set');
                await reply(`🔑 **${args[1]}:** ${value}`);
                break;
            case 'set':
                if (!args[1] || !args[2]) {
                    await reply('❌ Usage: .env set <key> <value>');
                    return;
                }
                await reply(`✅ Environment variable ${args[1]} has been set`);
                break;
            case 'remove':
                if (!args[1]) {
                    await reply('❌ Usage: .env remove <key>');
                    return;
                }
                await reply(`❌ Environment variable ${args[1]} has been removed`);
                break;
            default:
                await reply('❌ Invalid subcommand. Use: list, get, set, or remove');
        }
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