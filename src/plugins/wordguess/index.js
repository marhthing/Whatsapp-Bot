
const path = require('path');
const fs = require('fs-extra');

class WordGuessPlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.games = new Map(); // chatId -> game data
        this.waitingRooms = new Map(); // chatId -> waiting room data
        this.isInitialized = false;
        
        // Game storage path
        this.dataPath = path.join(process.cwd(), 'data', 'games', 'wordguess');
        
        // Word lists by length
        this.wordLists = {
            3: ['cat', 'dog', 'sun', 'car', 'run', 'sit', 'eat', 'win', 'box', 'map'],
            4: ['book', 'tree', 'bird', 'moon', 'fish', 'home', 'game', 'love', 'star', 'walk'],
            5: ['house', 'water', 'smile', 'happy', 'world', 'peace', 'light', 'music', 'dream', 'magic'],
            6: ['simple', 'nature', 'friend', 'flower', 'bridge', 'castle', 'island', 'forest', 'rocket', 'puzzle']
        };
    }

    async initialize() {
        try {
            console.log('🎲 Initializing WordGuess plugin...');
            
            // Ensure data directory exists
            await fs.ensureDir(this.dataPath);
            
            this.isInitialized = true;
            console.log('✅ WordGuess plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize WordGuess plugin:', error);
            throw error;
        }
    }

    async executeCommand(commandName, context) {
        try {
            if (!this.isInitialized) {
                throw new Error('WordGuess plugin not initialized');
            }

            switch (commandName) {
                case 'wordguess':
                    return await this.createWaitingRoom(context);
                case 'wg':
                    return await this.createWaitingRoom(context);
                default:
                    throw new Error(`Unknown command: ${commandName}`);
            }
            
        } catch (error) {
            console.error(`❌ Error executing WordGuess command '${commandName}':`, error);
            await context.reply(`❌ Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async createWaitingRoom(context) {
        try {
            const { reply, message } = context;
            const chatId = message.key.remoteJid;
            
            // Check if game already active
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (activeGame || this.games.has(chatId) || this.waitingRooms.has(chatId)) {
                await reply(`🎮 A game is already active in this chat. Use .endgame to stop it first.`);
                return { success: false, message: 'Game already active' };
            }
            
            // Create waiting room
            const waitingRoom = {
                chatId,
                players: [],
                createdAt: Date.now(),
                timeout: null
            };
            
            this.waitingRooms.set(chatId, waitingRoom);
            
            let responseMessage = `🎲 **Word Guess Game - Waiting Room**\n\n`;
            responseMessage += `📝 Type "start" to join the game!\n`;
            responseMessage += `⏱️ Waiting for players... (45 seconds)\n`;
            responseMessage += `👥 **Players joined:** 0\n`;
            responseMessage += `📋 **Minimum players:** 2\n\n`;
            responseMessage += `🎯 **How to play:**\n`;
            responseMessage += `• Guess letters in the secret word\n`;
            responseMessage += `• You have 30 seconds per turn\n`;
            responseMessage += `• Words start with 3 letters, then increase\n`;
            responseMessage += `• First to guess wins!`;
            
            await reply(responseMessage);
            
            // Set 45-second timeout
            waitingRoom.timeout = setTimeout(async () => {
                await this.processWaitingRoom(chatId);
            }, 45000);
            
            return { success: true, message: 'Waiting room created' };
            
        } catch (error) {
            console.error('Error creating word guess waiting room:', error);
            await context.reply('❌ Failed to create waiting room');
            return { success: false, error: error.message };
        }
    }

    async handleWaitingRoomInput(chatId, input, player) {
        const waitingRoom = this.waitingRooms.get(chatId);
        if (!waitingRoom) return null;
        
        if (input.toLowerCase().trim() === 'start') {
            if (!waitingRoom.players.includes(player)) {
                waitingRoom.players.push(player);
                
                const playerName = player.split('@')[0] || 'Player';
                const message = `✅ ${playerName} joined the game! (${waitingRoom.players.length} players)`;
                
                return { message, gameEnded: false };
            } else {
                return { message: '❌ You already joined the game!', gameEnded: false };
            }
        }
        
        return null;
    }

    async processWaitingRoom(chatId) {
        const waitingRoom = this.waitingRooms.get(chatId);
        if (!waitingRoom) return;
        
        clearTimeout(waitingRoom.timeout);
        
        if (waitingRoom.players.length >= 2) {
            // Start the game
            await this.startGame(chatId, waitingRoom.players);
        } else {
            // Not enough players
            await this.botClient.sendMessage(chatId, 
                `❌ **Game Cancelled**\n\nNot enough players joined (${waitingRoom.players.length}/2 minimum)\n\nTry again later!`
            );
        }
        
        this.waitingRooms.delete(chatId);
    }

    async startGame(chatId, players) {
        try {
            // Create new game state
            const gameData = {
                players,
                currentWordLength: 3,
                targetWord: this.selectRandomWord(3),
                guessedLetters: [],
                currentPlayerIndex: 0,
                gameStatus: 'active',
                turnTimeout: null,
                startTime: new Date().toISOString()
            };
            
            this.games.set(chatId, gameData);
            await this.saveGameData(chatId, gameData);
            
            const playerNames = players.map(p => p.split('@')[0]).join(', ');
            const currentPlayerName = players[0].split('@')[0];
            
            let responseMessage = `🎲 **Word Guess Game Started!**\n\n`;
            responseMessage += `👥 **Players:** ${playerNames}\n`;
            responseMessage += `📝 **Word Length:** ${gameData.currentWordLength} letters\n`;
            responseMessage += `🎯 **Word:** ${'_'.repeat(gameData.currentWordLength)}\n\n`;
            responseMessage += `🎮 **Current Turn:** ${currentPlayerName}\n`;
            responseMessage += `⏱️ **Time Limit:** 30 seconds per turn\n`;
            responseMessage += `📝 **Guess a letter!**`;
            
            await this.botClient.sendMessage(chatId, responseMessage);
            
            // Register game with access controller
            const accessController = this.botClient.getAccessController();
            accessController.startGame(chatId, 'wordguess', {
                startedBy: players[0],
                players: players,
                state: 'active'
            });
            
            // Start turn timer
            this.startTurnTimer(chatId);
            
            this.eventBus.emit('game_started', {
                chatId,
                gameType: 'wordguess',
                players: players
            });
            
        } catch (error) {
            console.error('Error starting word guess game:', error);
        }
    }

    startTurnTimer(chatId) {
        const gameData = this.games.get(chatId);
        if (!gameData) return;
        
        if (gameData.turnTimeout) {
            clearTimeout(gameData.turnTimeout);
        }
        
        gameData.turnTimeout = setTimeout(async () => {
            await this.handleTimeout(chatId);
        }, 30000);
    }

    async handleTimeout(chatId) {
        const gameData = this.games.get(chatId);
        if (!gameData) return;
        
        await this.botClient.sendMessage(chatId, '⏰ **Time\'s up!** Game cancelled due to inactivity.');
        await this.endGame(chatId, 'timeout');
    }

    selectRandomWord(length) {
        const words = this.wordLists[length] || this.wordLists[4];
        return words[Math.floor(Math.random() * words.length)].toLowerCase();
    }

    getWordDisplay(gameData) {
        return gameData.targetWord
            .split('')
            .map(letter => gameData.guessedLetters.includes(letter) ? letter.toUpperCase() : '_')
            .join(' ');
    }

    async handleInput(chatId, input, player) {
        try {
            // Check waiting room first
            const waitingRoomResult = await this.handleWaitingRoomInput(chatId, input, player);
            if (waitingRoomResult) return waitingRoomResult;
            
            const gameData = this.games.get(chatId);
            
            if (!gameData || gameData.gameStatus !== 'active') {
                return {
                    message: '❌ No active word guess game',
                    gameEnded: false
                };
            }
            
            // Check if it's player's turn
            const currentPlayer = gameData.players[gameData.currentPlayerIndex];
            if (player !== currentPlayer) {
                return {
                    message: `❌ It's not your turn. Waiting for ${currentPlayer.split('@')[0]}.`,
                    gameEnded: false
                };
            }
            
            const inputLower = input.toLowerCase().trim();
            
            // Handle quit command
            if (inputLower === 'quit') {
                return await this.endGame(chatId, 'quit');
            }
            
            // Validate letter input
            if (inputLower.length !== 1 || !/[a-z]/.test(inputLower)) {
                return {
                    message: '❌ Please enter a single letter (a-z)',
                    gameEnded: false
                };
            }
            
            // Check if letter already guessed
            if (gameData.guessedLetters.includes(inputLower)) {
                return {
                    message: `❌ Letter "${inputLower.toUpperCase()}" already guessed`,
                    gameEnded: false
                };
            }
            
            // Add letter to guessed letters
            gameData.guessedLetters.push(inputLower);
            
            // Clear turn timer
            if (gameData.turnTimeout) {
                clearTimeout(gameData.turnTimeout);
                gameData.turnTimeout = null;
            }
            
            let responseMessage = '';
            const playerName = player.split('@')[0];
            
            if (gameData.targetWord.includes(inputLower)) {
                // Correct guess
                responseMessage += `✅ **Good guess, ${playerName}!** Letter "${inputLower.toUpperCase()}" is in the word!\n\n`;
                
                // Check if word is complete
                const wordDisplay = this.getWordDisplay(gameData);
                if (!wordDisplay.includes('_')) {
                    // Word completed, advance to next word
                    gameData.currentWordLength++;
                    
                    if (gameData.currentWordLength > 6) {
                        // Game won
                        gameData.gameStatus = 'won';
                        responseMessage += `🎊 **Congratulations ${playerName}! You completed all words!**\n\n`;
                        responseMessage += `🎯 **Final word was:** ${gameData.targetWord.toUpperCase()}`;
                        
                        await this.saveGameData(chatId, gameData);
                        this.games.delete(chatId);
                        
                        return {
                            message: responseMessage,
                            gameEnded: true
                        };
                    } else {
                        // Next word
                        gameData.targetWord = this.selectRandomWord(gameData.currentWordLength);
                        gameData.guessedLetters = [];
                        responseMessage += `🎯 **Word completed!** Moving to ${gameData.currentWordLength}-letter word:\n\n`;
                        responseMessage += `📝 **New Word:** ${'_'.repeat(gameData.currentWordLength)}\n\n`;
                        responseMessage += `🎮 **${playerName}'s turn continues!**`;
                        
                        // Restart timer for same player
                        this.startTurnTimer(chatId);
                    }
                } else {
                    responseMessage += `📝 **Word:** ${wordDisplay}\n\n`;
                    responseMessage += `🎮 **${playerName}'s turn continues!**`;
                    
                    // Restart timer for same player
                    this.startTurnTimer(chatId);
                }
            } else {
                // Incorrect guess - next player's turn
                responseMessage += `❌ **Wrong, ${playerName}!** Letter "${inputLower.toUpperCase()}" is not in the word.\n\n`;
                
                // Move to next player
                gameData.currentPlayerIndex = (gameData.currentPlayerIndex + 1) % gameData.players.length;
                const nextPlayer = gameData.players[gameData.currentPlayerIndex];
                const nextPlayerName = nextPlayer.split('@')[0];
                
                responseMessage += `📝 **Word:** ${this.getWordDisplay(gameData)}\n`;
                responseMessage += `🔤 **Guessed Letters:** ${gameData.guessedLetters.map(l => l.toUpperCase()).join(', ')}\n\n`;
                responseMessage += `🎮 **Next Turn:** ${nextPlayerName}`;
                
                // Start timer for next player
                this.startTurnTimer(chatId);
            }
            
            await this.saveGameData(chatId, gameData);
            
            return {
                message: responseMessage,
                gameEnded: false
            };
            
        } catch (error) {
            console.error('Error handling WordGuess input:', error);
            return {
                message: '❌ Error processing guess',
                gameEnded: false
            };
        }
    }

    async saveGameData(chatId, gameData) {
        try {
            const filePath = path.join(this.dataPath, `${chatId.replace(/[@:]/g, '_')}.json`);
            await fs.writeJson(filePath, gameData, { spaces: 2 });
        } catch (error) {
            console.error('Error saving WordGuess game data:', error);
        }
    }

    async endGame(chatId, reason = 'ended') {
        try {
            const gameData = this.games.get(chatId);
            const waitingRoom = this.waitingRooms.get(chatId);
            
            if (gameData) {
                if (gameData.turnTimeout) {
                    clearTimeout(gameData.turnTimeout);
                }
                this.games.delete(chatId);
                
                return {
                    success: true,
                    message: `🎮 Word guess game ${reason}!${gameData.targetWord ? ` The word was: ${gameData.targetWord.toUpperCase()}` : ''}`
                };
            }
            
            if (waitingRoom) {
                if (waitingRoom.timeout) {
                    clearTimeout(waitingRoom.timeout);
                }
                this.waitingRooms.delete(chatId);
                
                return {
                    success: true,
                    message: `🎮 Word guess waiting room ${reason}!`
                };
            }
            
            return {
                success: false,
                message: '❌ No active word guess game'
            };
            
        } catch (error) {
            console.error('Error ending WordGuess game:', error);
            return {
                success: false,
                message: '❌ Error ending game'
            };
        }
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down WordGuess plugin...');
            
            // Save any active games
            for (const [chatId, gameData] of this.games.entries()) {
                if (gameData.turnTimeout) {
                    clearTimeout(gameData.turnTimeout);
                }
                await this.saveGameData(chatId, gameData);
            }
            
            // Clear waiting room timeouts
            for (const [chatId, waitingRoom] of this.waitingRooms.entries()) {
                if (waitingRoom.timeout) {
                    clearTimeout(waitingRoom.timeout);
                }
            }
            
            this.isInitialized = false;
            console.log('✅ WordGuess plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during WordGuess plugin shutdown:', error);
        }
    }
}

module.exports = WordGuessPlugin;
