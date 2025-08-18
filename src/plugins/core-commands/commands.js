const { EnvironmentManager } = require('../../core/EnvironmentManager');
const { constants } = require('../../utils/constants');

class Commands {
    constructor(botClient, eventBus, states) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.states = states;
        this.envManager = new EnvironmentManager();
    }

    async help(context) {
        try {
            const { args, reply } = context;
            
            if (args.length > 0) {
                // Show help for specific command
                return await this.showCommandHelp(args[0], reply);
            }
            
            // Show general help
            const prefix = this.envManager.get('BOT_PREFIX', '.');
            
            const helpText = `🤖 **WhatsApp Personal Assistant Bot**\n\n` +
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
                           
                           `**Admin Commands:**\n` +
                           `${prefix}systeminfo - Show system information\n` +
                           `${prefix}plugins - List loaded plugins\n\n` +
                           
                           `**Notes:**\n` +
                           `• This bot only responds to you (the owner) by default\n` +
                           `• Other users can participate in active games\n` +
                           `• Use ${prefix}allow to grant specific command permissions to others\n` +
                           `• All messages and media are automatically archived`;
            
            await reply(helpText);
            
        } catch (error) {
            console.error('Error in help command:', error);
            await context.reply('❌ Error showing help information');
        }
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
            tictactoe: '**tictactoe** - Start a tic-tac-toe game\nUsage: .tictactoe [@user]\nGame controls: Send numbers 1-9 for positions, or "quit" to end',
            wordguess: '**wordguess** - Start a word guessing game\nUsage: .wordguess\nGame controls: Send letters to guess, or "quit" to end'
        };

        const helpText = commandHelp[commandName.toLowerCase()];
        
        if (helpText) {
            await reply(`ℹ️ **Command Help**\n\n${helpText}`);
        } else {
            await reply(`❌ No help available for command: ${commandName}`);
        }
    }

    async info(context) {
        try {
            const { reply } = context;
            
            const clientInfo = this.botClient.getClientInfo();
            const botName = this.envManager.get('BOT_NAME', 'WhatsApp Personal Assistant Bot');
            const botDescription = this.envManager.get('BOT_DESCRIPTION', 'Your personal WhatsApp assistant');
            
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
                           `🎮 **Games:** ${this.envManager.get('ENABLE_GAMES') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                           `🔥 **Hot Reload:** ${this.envManager.get('ENABLE_HOT_RELOAD') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                           `📚 **Message Archival:** ${this.envManager.get('ENABLE_MESSAGE_ARCHIVAL') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                           `💾 **Media Download:** ${this.envManager.get('ENABLE_MEDIA_DOWNLOAD') === 'true' ? '✅ Enabled' : '❌ Disabled'}`;
            
            await reply(infoText);
            
        } catch (error) {
            console.error('Error in info command:', error);
            await context.reply('❌ Error retrieving bot information');
        }
    }

    async status(context) {
        try {
            const { reply } = context;
            
            // Get performance monitor from event bus context
            let performanceStats = { uptime: 0, memoryUsage: {}, systemLoad: 'Unknown' };
            
            const statusText = `📊 **Bot Status**\n\n` +
                             `⏱️ **Uptime:** ${this.formatUptime(performanceStats.uptime)}\n` +
                             `💾 **Memory Usage:** ${performanceStats.memoryUsage.current || 'Unknown'}\n` +
                             `📈 **System Load:** ${performanceStats.systemLoad}\n\n` +
                             
                             `📱 **WhatsApp Client:** ${this.botClient.getClientInfo()?.connected ? '✅ Connected' : '❌ Disconnected'}\n` +
                             `🔌 **Plugins:** Loading...\n` +
                             `📨 **Messages Processed:** Loading...\n` +
                             `⚠️ **Errors:** Loading...\n\n` +
                             
                             `🎮 **Active Games:** Loading...\n` +
                             `🔥 **Hot Reload Status:** ${this.envManager.get('ENABLE_HOT_RELOAD') === 'true' ? '✅ Active' : '❌ Disabled'}\n` +
                             `📡 **Web Interface:** ${this.envManager.get('WEB_INTERFACE_ENABLED') === 'true' ? '✅ Running' : '❌ Disabled'}`;
            
            await reply(statusText);
            
        } catch (error) {
            console.error('Error in status command:', error);
            await context.reply('❌ Error retrieving bot status');
        }
    }

    async settings(context) {
        try {
            const { reply } = context;
            
            const userVars = this.envManager.listUserVars();
            
            let settingsText = `⚙️ **Bot Settings**\n\n`;
            
            // Group settings by category
            const categories = {
                'Basic Settings': ['BOT_NAME', 'BOT_PREFIX', 'BOT_DESCRIPTION'],
                'Features': ['ENABLE_MESSAGE_ARCHIVAL', 'ENABLE_MEDIA_DOWNLOAD', 'ENABLE_ANTI_DELETE', 'ENABLE_GAMES', 'ENABLE_HOT_RELOAD'],
                'Performance': ['MAX_CONCURRENT_DOWNLOADS', 'MESSAGE_BATCH_SIZE', 'PLUGIN_SCAN_INTERVAL'],
                'Interface': ['WEB_INTERFACE_ENABLED', 'WEB_PORT'],
                'Session': ['SESSION_NAME', 'AUTO_RESTART', 'SAVE_SESSION'],
                'Logging': ['LOG_LEVEL', 'LOG_TO_FILE']
            };
            
            for (const [category, keys] of Object.entries(categories)) {
                settingsText += `**${category}:**\n`;
                
                for (const key of keys) {
                    const value = userVars[key] || 'Not set';
                    const displayValue = this.formatSettingValue(key, value);
                    settingsText += `• ${key}: ${displayValue}\n`;
                }
                
                settingsText += '\n';
            }
            
            settingsText += `💡 **Note:** Use \`.env set <key> <value>\` to modify settings`;
            
            await reply(settingsText);
            
        } catch (error) {
            console.error('Error in settings command:', error);
            await context.reply('❌ Error retrieving bot settings');
        }
    }

    async allow(context) {
        try {
            const { args, reply, message } = context;
            
            if (args.length === 0) {
                await reply('❌ Please specify a command to allow\nUsage: .allow <command>\nExample: .allow ping');
                return;
            }
            
            const commandName = args[0].toLowerCase();
            const userJid = message.from;
            
            // Check if this is a group chat
            if (userJid.includes('@g.us')) {
                await reply('❌ Allow command can only be used in individual chats');
                return;
            }
            
            const accessController = this.botClient.getAccessController();
            const success = accessController.allowCommand(userJid, commandName);
            
            if (success) {
                await reply(`✅ User is now allowed to use the \`.${commandName}\` command`);
                
                this.eventBus.emit('command_permission_granted', {
                    userJid,
                    command: commandName,
                    grantedBy: message.from,
                    timestamp: new Date().toISOString()
                });
            } else {
                await reply('❌ Failed to grant command permission');
            }
            
        } catch (error) {
            console.error('Error in allow command:', error);
            await context.reply('❌ Error granting command permission');
        }
    }

    async disallow(context) {
        try {
            const { args, reply, message } = context;
            
            if (args.length === 0) {
                await reply('❌ Please specify a command to disallow\nUsage: .disallow <command>\nExample: .disallow ping');
                return;
            }
            
            const commandName = args[0].toLowerCase();
            const userJid = message.from;
            
            // Check if this is a group chat
            if (userJid.includes('@g.us')) {
                await reply('❌ Disallow command can only be used in individual chats');
                return;
            }
            
            const accessController = this.botClient.getAccessController();
            const success = accessController.disallowCommand(userJid, commandName);
            
            if (success) {
                await reply(`✅ User can no longer use the \`.${commandName}\` command`);
                
                this.eventBus.emit('command_permission_revoked', {
                    userJid,
                    command: commandName,
                    revokedBy: message.from,
                    timestamp: new Date().toISOString()
                });
            } else {
                await reply('❌ Command permission was not previously granted or failed to revoke');
            }
            
        } catch (error) {
            console.error('Error in disallow command:', error);
            await context.reply('❌ Error revoking command permission');
        }
    }

    async reload(context) {
        try {
            const { args, reply } = context;
            
            await reply('🔄 Reloading plugins...');
            
            if (args.length > 0) {
                // Reload specific plugin
                const pluginName = args[0];
                this.eventBus.emit('plugin_reload_requested', { pluginName });
                
                await reply(`🔄 Requested reload of plugin: ${pluginName}`);
            } else {
                // Reload all plugins
                this.eventBus.emit('plugins_reload_requested');
                
                await reply('🔄 Requested reload of all plugins');
            }
            
        } catch (error) {
            console.error('Error in reload command:', error);
            await context.reply('❌ Error reloading plugins');
        }
    }

    formatUptime(uptimeMs) {
        if (!uptimeMs) return 'Unknown';
        
        const seconds = Math.floor(uptimeMs / 1000) % 60;
        const minutes = Math.floor(uptimeMs / (1000 * 60)) % 60;
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60)) % 24;
        const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m ${seconds}s`;
        }
    }

    formatSettingValue(key, value) {
        // Format boolean-like values
        if (value === 'true') return '✅ Enabled';
        if (value === 'false') return '❌ Disabled';
        
        // Format numeric values
        if (key.includes('PORT') || key.includes('SIZE') || key.includes('INTERVAL')) {
            return `\`${value}\``;
        }
        
        // Format other values
        return `\`${value}\``;
    }
}

module.exports = { Commands };
