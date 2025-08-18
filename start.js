#!/usr/bin/env node

/**
 * WhatsApp Bot - Main Entry Point & Session Selector
 * Personal Assistant Architecture with Multi-Session Support
 * 
 * This file serves as the primary startup script for the WhatsApp bot,
 * handling session selection, initialization, and basic setup.
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

class WhatsAppBotStarter {
    constructor() {
        this.sessionsDir = path.join(__dirname, 'sessions');
        this.dataDir = path.join(__dirname, 'data');
        this.configDir = path.join(__dirname, 'config');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Main startup method
     */
    async start() {
        try {
            console.log(`${colors.cyan}${colors.bright}`);
            console.log('╔═══════════════════════════════════════════╗');
            console.log('║        WhatsApp Personal Assistant        ║');
            console.log('║              Bot Starter v1.0             ║');
            console.log('╚═══════════════════════════════════════════╝');
            console.log(`${colors.reset}\n`);

            // Ensure required directories exist
            await this.ensureDirectories();

            // Check for existing sessions
            const sessions = await this.getAvailableSessions();
            
            if (sessions.length === 0) {
                await this.createNewSession();
            } else {
                await this.selectSession(sessions);
            }

        } catch (error) {
            console.error(`${colors.red}Error starting WhatsApp Bot:${colors.reset}`, error.message);
            process.exit(1);
        }
    }

    /**
     * Ensure all required directories exist
     */
    async ensureDirectories() {
        const dirs = [
            this.sessionsDir,
            this.dataDir,
            this.configDir,
            path.join(this.dataDir, 'messages'),
            path.join(this.dataDir, 'media'),
            path.join(this.dataDir, 'plugins'),
            path.join(this.dataDir, 'system')
        ];

        for (const dir of dirs) {
            try {
                await fs.access(dir);
            } catch {
                await fs.mkdir(dir, { recursive: true });
                console.log(`${colors.green}Created directory: ${dir}${colors.reset}`);
            }
        }
    }

    /**
     * Get list of available sessions
     */
    async getAvailableSessions() {
        try {
            const registryPath = path.join(this.sessionsDir, 'session_registry.json');
            
            try {
                const registryData = await fs.readFile(registryPath, 'utf8');
                const registry = JSON.parse(registryData);
                return registry.sessions || [];
            } catch {
                // Registry doesn't exist or is invalid
                return [];
            }
        } catch (error) {
            console.warn(`${colors.yellow}Warning: Could not read session registry${colors.reset}`);
            return [];
        }
    }

    /**
     * Create a new session
     */
    async createNewSession() {
        console.log(`${colors.yellow}No existing sessions found. Creating new session...${colors.reset}\n`);
        
        const sessionId = await this.promptUser('Enter session name (or press Enter for auto-generated): ');
        const finalSessionId = sessionId.trim() || `session_${Date.now()}`;
        
        // Ask for authentication method
        console.log(`${colors.blue}Authentication Methods:${colors.reset}`);
        console.log(`${colors.cyan}1.${colors.reset} QR Code (scan with your phone)`);
        console.log(`${colors.cyan}2.${colors.reset} 8-digit pairing code (link to existing WhatsApp)\n`);
        
        const authMethod = await this.promptUser('Select authentication method (1 or 2): ');
        
        let phoneNumber = null;
        if (authMethod === '1') {
            console.log(`${colors.green}QR Code authentication selected.${colors.reset}`);
            console.log(`${colors.yellow}A QR code will be displayed for you to scan with your WhatsApp.${colors.reset}`);
            console.log(`${colors.blue}The bot will use your WhatsApp account to send and receive messages.${colors.reset}\n`);
        } else if (authMethod === '2') {
            console.log(`${colors.green}8-digit pairing code authentication selected.${colors.reset}`);
            console.log(`${colors.yellow}You will receive an 8-digit code to enter in WhatsApp settings.${colors.reset}\n`);
            phoneNumber = await this.promptUser('Enter your phone number (with country code, e.g., +2347046040727): ');
            
            // Clean and validate phone number for pairing code method
            const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
            if (!cleanedPhone) {
                console.error(`${colors.red}Invalid phone number format. Please include country code.${colors.reset}`);
                process.exit(1);
            }
            phoneNumber = cleanedPhone;
            console.log(`${colors.green}Phone number: ${phoneNumber}${colors.reset}`);
        } else {
            console.error(`${colors.red}Invalid authentication method selected.${colors.reset}`);
            process.exit(1);
        }

        console.log(`${colors.blue}After successful authentication, your JID will be automatically detected.${colors.reset}\n`);

        await this.initializeSession(finalSessionId, phoneNumber, authMethod);
    }

    /**
     * Clean and validate phone number
     */
    cleanPhoneNumber(phoneNumber) {
        if (!phoneNumber) return null;
        
        // Remove all non-digit characters except +
        let cleaned = phoneNumber.replace(/[^\d+]/g, '');
        
        // Remove leading + if present
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }
        
        // Validate: should be 10-15 digits
        if (!/^\d{10,15}$/.test(cleaned)) {
            return null;
        }
        
        return cleaned;
    }

    /**
     * Select from existing sessions
     */
    async selectSession(sessions) {
        console.log(`${colors.blue}Available Sessions:${colors.reset}`);
        sessions.forEach((session, index) => {
            console.log(`${colors.cyan}${index + 1}.${colors.reset} ${session.id} (Owner: ${session.ownerJid})`);
        });
        console.log(`${colors.cyan}${sessions.length + 1}.${colors.reset} Create new session\n`);

        const choice = await this.promptUser('Select session (enter number): ');
        const sessionIndex = parseInt(choice) - 1;

        if (sessionIndex === sessions.length) {
            await this.createNewSession();
        } else if (sessionIndex >= 0 && sessionIndex < sessions.length) {
            await this.startSession(sessions[sessionIndex]);
        } else {
            console.error(`${colors.red}Invalid selection${colors.reset}`);
            process.exit(1);
        }
    }

    /**
     * Initialize a new session
     */
    async initializeSession(sessionId, phoneNumber, authMethod) {
        const sessionDir = path.join(this.sessionsDir, sessionId);
        
        try {
            await fs.mkdir(sessionDir, { recursive: true });
            await fs.mkdir(path.join(sessionDir, 'auth'), { recursive: true });

            // Create session config (JID will be updated after authentication)
            const sessionConfig = {
                id: sessionId,
                phoneNumber: phoneNumber, // Only set for pairing code method
                ownerJid: null, // Will be set after successful authentication
                authMethod: authMethod,
                authStatus: 'pending',
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString()
            };

            await fs.writeFile(
                path.join(sessionDir, 'config.json'),
                JSON.stringify(sessionConfig, null, 2)
            );

            // Create metadata
            const metadata = {
                SESSION_ID: sessionId,
                PHONE_NUMBER: phoneNumber, // Only set for pairing code method
                OWNER_JID: null, // Will be updated after authentication
                AUTH_METHOD: authMethod,
                version: '1.0.0'
            };

            await fs.writeFile(
                path.join(sessionDir, 'metadata.json'),
                JSON.stringify(metadata, null, 2)
            );

            // Update session registry
            await this.updateSessionRegistry(sessionConfig);

            console.log(`${colors.green}Session '${sessionId}' created successfully!${colors.reset}`);
            console.log(`${colors.yellow}Ready to authenticate with WhatsApp...${colors.reset}\n`);
            
            await this.startSession(sessionConfig);

        } catch (error) {
            console.error(`${colors.red}Error creating session:${colors.reset}`, error.message);
            process.exit(1);
        }
    }

    /**
     * Update session registry
     */
    async updateSessionRegistry(sessionConfig) {
        const registryPath = path.join(this.sessionsDir, 'session_registry.json');
        
        let registry = { sessions: [] };
        
        try {
            const registryData = await fs.readFile(registryPath, 'utf8');
            registry = JSON.parse(registryData);
        } catch {
            // Registry doesn't exist, will create new one
        }

        // Add or update session
        const existingIndex = registry.sessions.findIndex(s => s.id === sessionConfig.id);
        if (existingIndex >= 0) {
            registry.sessions[existingIndex] = sessionConfig;
        } else {
            registry.sessions.push(sessionConfig);
        }

        await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
    }

    /**
     * Start the selected session
     */
    async startSession(sessionConfig) {
        console.log(`${colors.green}Starting session: ${sessionConfig.id}${colors.reset}`);
        
        if (sessionConfig.ownerJid) {
            console.log(`${colors.blue}Owner JID: ${sessionConfig.ownerJid}${colors.reset}`);
        } else {
            if (sessionConfig.phoneNumber) {
                console.log(`${colors.blue}Phone Number: ${sessionConfig.phoneNumber}${colors.reset}`);
            }
            console.log(`${colors.yellow}JID will be detected after authentication${colors.reset}`);
        }
        
        console.log(`${colors.blue}Auth Method: ${sessionConfig.authMethod === '1' ? 'QR Code' : '8-digit Pairing Code'}${colors.reset}\n`);

        // Set environment variables for the session
        process.env.WHATSAPP_SESSION_ID = sessionConfig.id;
        process.env.PHONE_NUMBER = sessionConfig.phoneNumber || '';
        process.env.OWNER_JID = sessionConfig.ownerJid || '';
        process.env.AUTH_METHOD = sessionConfig.authMethod;
        process.env.SESSION_DIR = path.join(this.sessionsDir, sessionConfig.id);

        // Check if src/index.js exists
        const mainFile = path.join(process.cwd(), 'src', 'index.js');
        
        try {
            await fs.access(mainFile);
            console.log(`${colors.cyan}Loading main bot application...${colors.reset}`);
            console.log(`${colors.yellow}The bot will authenticate and then use your WhatsApp account.${colors.reset}`);
            console.log(`${colors.yellow}After authentication, your actual JID will be detected automatically.${colors.reset}\n`);
            
            // Close readline interface before requiring the main app
            this.rl.close();
            
            // Require and start the main bot application
            require(mainFile);
            
        } catch (error) {
            console.log(`${colors.yellow}Main bot application not found at src/index.js${colors.reset}`);
            console.log(`${colors.blue}Session initialized successfully. Ready for bot implementation.${colors.reset}`);
            console.log(`${colors.green}You can now implement the WhatsApp authentication in src/index.js${colors.reset}\n`);
            
            // Show session info
            console.log('Session Information:');
            console.log(`- Session ID: ${sessionConfig.id}`);
            console.log(`- Phone Number: ${sessionConfig.phoneNumber}`);
            console.log(`- Auth Method: ${sessionConfig.authMethod === '1' ? 'QR Code' : '8-digit Pairing Code'}`);
            console.log(`- Session Directory: ${path.join(this.sessionsDir, sessionConfig.id)}`);
            console.log(`- Environment variables set for bot initialization\n`);
            
            console.log(`${colors.cyan}Next Steps:${colors.reset}`);
            console.log(`1. Implement WhatsApp authentication in src/index.js`);
            console.log(`2. Use the auth method preference: ${sessionConfig.authMethod === '1' ? 'QR Code' : '8-digit Pairing Code'}`);
            console.log(`3. After successful auth, detect and save the actual JID`);
            console.log(`4. Bot will then operate using your WhatsApp account\n`);
            
            this.rl.close();
            process.exit(0);
        }
    }

    /**
     * Prompt user for input
     */
    async promptUser(question) {
        return new Promise((resolve) => {
            this.rl.question(`${colors.yellow}${question}${colors.reset}`, (answer) => {
                resolve(answer);
            });
        });
    }

    /**
     * Handle process termination
     */
    handleExit() {
        console.log(`\n${colors.cyan}WhatsApp Bot Starter stopped.${colors.reset}`);
        this.rl.close();
        process.exit(0);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Received SIGINT, shutting down gracefully...${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(`\n${colors.yellow}Received SIGTERM, shutting down gracefully...${colors.reset}`);
    process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error(`${colors.red}Uncaught Exception:${colors.reset}`, error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`${colors.red}Unhandled Rejection at:${colors.reset}`, promise, 'reason:', reason);
    process.exit(1);
});

// Start the application
if (require.main === module) {
    const starter = new WhatsAppBotStarter();
    starter.start().catch((error) => {
        console.error(`${colors.red}Failed to start WhatsApp Bot:${colors.reset}`, error);
        process.exit(1);
    });
}

module.exports = WhatsAppBotStarter;
