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
        
        const ownerJid = await this.promptUser('Enter your WhatsApp JID (phone number with country code, e.g., 1234567890@s.whatsapp.net): ');
        
        if (!ownerJid.includes('@s.whatsapp.net')) {
            console.error(`${colors.red}Invalid JID format. Please include @s.whatsapp.net${colors.reset}`);
            process.exit(1);
        }

        await this.initializeSession(finalSessionId, ownerJid);
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
    async initializeSession(sessionId, ownerJid) {
        const sessionDir = path.join(this.sessionsDir, sessionId);
        
        try {
            await fs.mkdir(sessionDir, { recursive: true });
            await fs.mkdir(path.join(sessionDir, 'auth'), { recursive: true });

            // Create session config
            const sessionConfig = {
                id: sessionId,
                ownerJid: ownerJid,
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString()
            };

            await fs.writeFile(
                path.join(sessionDir, 'config.json'),
                JSON.stringify(sessionConfig, null, 2)
            );

            // Create metadata
            const metadata = {
                OWNER_JID: ownerJid,
                sessionId: sessionId,
                version: '1.0.0'
            };

            await fs.writeFile(
                path.join(sessionDir, 'metadata.json'),
                JSON.stringify(metadata, null, 2)
            );

            // Update session registry
            await this.updateSessionRegistry(sessionConfig);

            console.log(`${colors.green}Session '${sessionId}' created successfully!${colors.reset}`);
            
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
        console.log(`${colors.blue}Owner JID: ${sessionConfig.ownerJid}${colors.reset}\n`);

        // Set environment variables for the session
        process.env.WHATSAPP_SESSION_ID = sessionConfig.id;
        process.env.OWNER_JID = sessionConfig.ownerJid;
        process.env.SESSION_DIR = path.join(this.sessionsDir, sessionConfig.id);

        // Check if src/index.js exists
        const mainFile = path.join(__dirname, 'src', 'index.js');
        
        try {
            await fs.access(mainFile);
            console.log(`${colors.cyan}Loading main bot application...${colors.reset}`);
            
            // Close readline interface before requiring the main app
            this.rl.close();
            
            // Require and start the main bot application
            require(mainFile);
            
        } catch (error) {
            console.log(`${colors.yellow}Main bot application not found at src/index.js${colors.reset}`);
            console.log(`${colors.blue}Session initialized successfully. Ready for bot implementation.${colors.reset}`);
            console.log(`${colors.green}You can now create the src/ directory and implement the bot core.${colors.reset}\n`);
            
            // Show session info
            console.log('Session Information:');
            console.log(`- Session ID: ${sessionConfig.id}`);
            console.log(`- Owner JID: ${sessionConfig.ownerJid}`);
            console.log(`- Session Directory: ${path.join(this.sessionsDir, sessionConfig.id)}`);
            console.log(`- Environment variables set for bot initialization\n`);
            
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
