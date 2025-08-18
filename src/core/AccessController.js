const fs = require('fs-extra');
const path = require('path');

class AccessController {
    constructor() {
        this.ownerJid = null;
        this.allowedCommands = new Map(); // userJid -> Set of allowed commands
        this.activeGames = new Map(); // chatId -> game info
        this.accessControlPath = path.join(process.cwd(), 'data', 'system', 'access_control.json');
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing access controller...');

            // Ensure data directory exists
            await fs.ensureDir(path.dirname(this.accessControlPath));

            // Load existing access control data
            await this.loadAccessControlData();

            this.isInitialized = true;
            console.log('✅ Access controller initialized');

        } catch (error) {
            console.error('❌ Failed to initialize access controller:', error);
            throw error;
        }
    }

    async loadAccessControlData() {
        try {
            if (await fs.pathExists(this.accessControlPath)) {
                const data = await fs.readJson(this.accessControlPath);
                
                this.ownerJid = data.ownerJid || null;
                
                // Load allowed commands
                if (data.allowedCommands) {
                    for (const [userJid, commands] of Object.entries(data.allowedCommands)) {
                        this.allowedCommands.set(userJid, new Set(commands));
                    }
                }

                // Load active games
                if (data.activeGames) {
                    for (const [chatId, gameInfo] of Object.entries(data.activeGames)) {
                        this.activeGames.set(chatId, gameInfo);
                    }
                }
            }
        } catch (error) {
            console.error('⚠️ Failed to load access control data, starting fresh:', error);
        }
    }

    async saveAccessControlData() {
        try {
            const data = {
                ownerJid: this.ownerJid,
                allowedCommands: {},
                activeGames: {},
                lastUpdated: new Date().toISOString()
            };

            // Convert allowed commands map to object
            for (const [userJid, commands] of this.allowedCommands) {
                data.allowedCommands[userJid] = Array.from(commands);
            }

            // Convert active games map to object
            for (const [chatId, gameInfo] of this.activeGames) {
                data.activeGames[chatId] = gameInfo;
            }

            await fs.writeJson(this.accessControlPath, data, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save access control data:', error);
        }
    }

    async setOwnerJid(jid) {
        this.ownerJid = jid;
        await this.saveAccessControlData();
        console.log(`🔐 Owner JID set: ${jid}`);
    }

    isOwner(jid) {
        if (!this.ownerJid || !jid) return false;
        
        // Extract phone number from both JIDs for comparison
        const getPhoneNumber = (jidStr) => {
            // Extract the phone number part before @ symbol
            const match = jidStr.match(/^(\d+)/);
            return match ? match[1] : null;
        };
        
        const phoneFromInput = getPhoneNumber(jid);
        const phoneFromOwner = getPhoneNumber(this.ownerJid);
        
        // Disable debug logs for performance - only enable when needed
        // console.log(`🔍 JID Debug - Input: ${jid}, Phone: ${phoneFromInput}`);
        // console.log(`🔍 Owner Debug - Stored: ${this.ownerJid}, Phone: ${phoneFromOwner}`);
        // console.log(`🔍 Match Result: ${phoneFromInput === phoneFromOwner}`);
        
        const result = phoneFromInput === phoneFromOwner && phoneFromInput !== null;
        if (result) {
            console.log(`✅ Owner access granted for: ${jid}`);
        }
        
        return result;
    }

    async allowCommand(userJid, command) {
        if (!this.allowedCommands.has(userJid)) {
            this.allowedCommands.set(userJid, new Set());
        }
        
        this.allowedCommands.get(userJid).add(command);
        await this.saveAccessControlData();
        
        console.log(`✅ Allowed command '${command}' for user: ${userJid}`);
    }

    async disallowCommand(userJid, command) {
        if (this.allowedCommands.has(userJid)) {
            this.allowedCommands.get(userJid).delete(command);
            
            // Remove user entry if no commands left
            if (this.allowedCommands.get(userJid).size === 0) {
                this.allowedCommands.delete(userJid);
            }
            
            await this.saveAccessControlData();
            console.log(`❌ Disallowed command '${command}' for user: ${userJid}`);
        }
    }

    isCommandAllowed(userJid, command) {
        return this.allowedCommands.has(userJid) && 
               this.allowedCommands.get(userJid).has(command);
    }

    getUserAllowedCommands(userJid) {
        return this.allowedCommands.has(userJid) ? 
               Array.from(this.allowedCommands.get(userJid)) : [];
    }

    getAllAllowedCommands() {
        const result = {};
        for (const [userJid, commands] of this.allowedCommands) {
            result[userJid] = Array.from(commands);
        }
        return result;
    }

    async startGame(chatId, gameType, players = [], gameData = {}) {
        const gameInfo = {
            type: gameType,
            players: players,
            startedBy: players[0] || null,
            startTime: new Date().toISOString(),
            status: 'active',
            data: gameData
        };

        this.activeGames.set(chatId, gameInfo);
        await this.saveAccessControlData();
        
        console.log(`🎮 Started game '${gameType}' in chat: ${chatId}`);
        return gameInfo;
    }

    async endGame(chatId) {
        if (this.activeGames.has(chatId)) {
            this.activeGames.delete(chatId);
            await this.saveAccessControlData();
            console.log(`🎮 Ended game in chat: ${chatId}`);
            return true;
        }
        return false;
    }

    getActiveGame(chatId) {
        return this.activeGames.get(chatId) || null;
    }

    isGameActive(chatId) {
        return this.activeGames.has(chatId);
    }

    isGamePlayer(chatId, userJid) {
        const game = this.getActiveGame(chatId);
        return game && game.players.includes(userJid);
    }

    getAllActiveGames() {
        return Object.fromEntries(this.activeGames);
    }

    async updateGameData(chatId, data) {
        if (this.activeGames.has(chatId)) {
            this.activeGames.get(chatId).data = { ...this.activeGames.get(chatId).data, ...data };
            await this.saveAccessControlData();
        }
    }

    /**
     * Main access control logic - determines if a user can process a command
     */
    canProcessMessage(message, command = null) {
        // Extract sender JID properly from Baileys message structure
        let senderJid, chatId;
        
        if (message.key) {
            // For group messages, participant is the sender
            // For individual messages, remoteJid is the sender
            senderJid = message.key.participant || message.key.remoteJid;
            chatId = message.key.remoteJid;
        } else {
            // Fallback for other message structures
            senderJid = message.author || message.from;
            chatId = message.from;
        }

        // Debug log for troubleshooting
        // console.log(`🔍 Access check - Sender: ${senderJid}, Owner: ${this.ownerJid}, Chat: ${chatId}`);

        // Owner can always process any message
        if (this.isOwner(senderJid)) {
            return {
                allowed: true,
                reason: 'owner'
            };
        }

        // Check if there's an active game and user is a player
        if (this.isGameActive(chatId)) {
            const game = this.getActiveGame(chatId);
            if (game.players.includes(senderJid)) {
                return {
                    allowed: true,
                    reason: 'game_player',
                    gameType: game.type
                };
            }
        }

        // Check if command is specifically allowed for this user
        if (command && this.isCommandAllowed(senderJid, command)) {
            return {
                allowed: true,
                reason: 'allowed_command',
                command: command
            };
        }

        // Default: deny access
        return {
            allowed: false,
            reason: 'access_denied'
        };
    }

    /**
     * Check if message is a valid game input
     */
    isValidGameInput(message, gameType) {
        const text = message.body.trim().toLowerCase();

        switch (gameType) {
            case 'tictactoe':
                // Valid positions: 1-9 or coordinates like a1, b2, etc.
                return /^[1-9]$/.test(text) || /^[abc][123]$/.test(text);

            case 'wordguess':
                // Single letter guess or full word
                return /^[a-z]$/.test(text) || /^[a-z]{2,}$/.test(text);

            default:
                return false;
        }
    }

    getAccessStats() {
        return {
            ownerJid: this.ownerJid,
            totalAllowedUsers: this.allowedCommands.size,
            totalActiveGames: this.activeGames.size,
            allowedCommandsCount: Array.from(this.allowedCommands.values())
                .reduce((total, commands) => total + commands.size, 0)
        };
    }
}

module.exports = AccessController;
