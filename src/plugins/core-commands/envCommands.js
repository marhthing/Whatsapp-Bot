const { EnvironmentManager } = require('../../core/EnvironmentManager');

class EnvCommands {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.envManager = new EnvironmentManager();
    }

    async env(context) {
        try {
            const { args, reply } = context;
            
            if (args.length === 0) {
                await reply('❌ Please specify an environment command\nUsage: .env <list|set|get|remove> [args]\nExample: .env list');
                return;
            }
            
            const subCommand = args[0].toLowerCase();
            
            switch (subCommand) {
                case 'list':
                    await this.listEnvVars(context);
                    break;
                    
                case 'set':
                    await this.setEnvVar(context);
                    break;
                    
                case 'get':
                    await this.getEnvVar(context);
                    break;
                    
                case 'remove':
                    await this.removeEnvVar(context);
                    break;
                    
                default:
                    await reply('❌ Invalid environment command\nAvailable: list, set, get, remove');
            }
            
        } catch (error) {
            console.error('Error in env command:', error);
            await context.reply('❌ Error executing environment command');
        }
    }

    async listEnvVars(context) {
        try {
            const { reply } = context;
            
            const userVars = this.envManager.listUserVars();
            const systemVars = this.envManager.listSystemVars();
            
            let envText = '🔧 **Environment Variables**\n\n';
            
            // User variables (editable)
            envText += '**User Variables (Editable):**\n';
            if (Object.keys(userVars).length === 0) {
                envText += 'No user variables set\n';
            } else {
                for (const [key, value] of Object.entries(userVars)) {
                    const displayValue = this.formatEnvValue(key, value);
                    envText += `• ${key} = ${displayValue}\n`;
                }
            }
            
            envText += '\n**System Variables (Read-only):**\n';
            if (Object.keys(systemVars).length === 0) {
                envText += 'No system variables\n';
            } else {
                for (const [key, value] of Object.entries(systemVars)) {
                    const displayValue = this.formatEnvValue(key, value);
                    envText += `• ${key} = ${displayValue}\n`;
                }
            }
            
            envText += '\n💡 **Note:** Use `.env set <key> <value>` to modify user variables';
            
            await reply(envText);
            
        } catch (error) {
            console.error('Error listing environment variables:', error);
            await context.reply('❌ Error listing environment variables');
        }
    }

    async setEnvVar(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 3) {
                await reply('❌ Please specify key and value\nUsage: .env set <key> <value>\nExample: .env set BOT_NAME "My Bot"');
                return;
            }
            
            const key = args[1].toUpperCase();
            const value = args.slice(2).join(' ').replace(/^["']|["']$/g, ''); // Remove quotes
            
            // Validate key format
            if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
                await reply('❌ Invalid key format. Use uppercase letters, numbers, and underscores only');
                return;
            }
            
            // Check if it's a system variable (read-only)
            const systemVars = this.envManager.listSystemVars();
            if (systemVars.hasOwnProperty(key)) {
                await reply(`❌ Cannot modify system variable: ${key}`);
                return;
            }
            
            // Set the variable
            await this.envManager.addUserVar(key, value);
            
            await reply(`✅ Environment variable set: ${key} = \`${this.formatEnvValue(key, value)}\``);
            
            this.eventBus.emit('env_var_changed', {
                key,
                value,
                action: 'set',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error setting environment variable:', error);
            await context.reply('❌ Error setting environment variable');
        }
    }

    async getEnvVar(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 2) {
                await reply('❌ Please specify the key\nUsage: .env get <key>\nExample: .env get BOT_NAME');
                return;
            }
            
            const key = args[1].toUpperCase();
            const value = this.envManager.get(key);
            
            if (value === null) {
                await reply(`❌ Environment variable not found: ${key}`);
                return;
            }
            
            const displayValue = this.formatEnvValue(key, value);
            await reply(`🔧 **${key}** = \`${displayValue}\``);
            
        } catch (error) {
            console.error('Error getting environment variable:', error);
            await context.reply('❌ Error getting environment variable');
        }
    }

    async removeEnvVar(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 2) {
                await reply('❌ Please specify the key\nUsage: .env remove <key>\nExample: .env remove CUSTOM_SETTING');
                return;
            }
            
            const key = args[1].toUpperCase();
            
            // Check if it's a system variable (read-only)
            const systemVars = this.envManager.listSystemVars();
            if (systemVars.hasOwnProperty(key)) {
                await reply(`❌ Cannot remove system variable: ${key}`);
                return;
            }
            
            const success = await this.envManager.removeUserVar(key);
            
            if (success) {
                await reply(`✅ Environment variable removed: ${key}`);
                
                this.eventBus.emit('env_var_changed', {
                    key,
                    action: 'remove',
                    timestamp: new Date().toISOString()
                });
            } else {
                await reply(`❌ Environment variable not found: ${key}`);
            }
            
        } catch (error) {
            console.error('Error removing environment variable:', error);
            await context.reply('❌ Error removing environment variable');
        }
    }

    formatEnvValue(key, value) {
        // Mask sensitive values
        if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
            return '••••••••';
        }
        
        // Format boolean values
        if (value === 'true' || value === 'false') {
            return value === 'true' ? '✅ true' : '❌ false';
        }
        
        // Truncate long values
        if (typeof value === 'string' && value.length > 50) {
            return value.substring(0, 47) + '...';
        }
        
        return value;
    }
}

module.exports = { envCommands: EnvCommands };
