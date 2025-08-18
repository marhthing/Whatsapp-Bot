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
        this.isInitialized = false;
        
        // Game storage path
        this.dataPath = path.join(process.cwd(), 'data', 'games', 'wordguess');
        
        // Word lists by difficulty
        this.wordLists = {
            easy: ['cat', 'dog', 'sun', 'moon', 'tree', 'book', 'car', 'fish', 'bird', 'house'],
            medium: ['elephant', 'computer', 'rainbow', 'mountain', 'butterfly', 'keyboard', 'sandwich', 'umbrella'],
            hard: ['encyclopedia', 'extraordinary', 'sophisticated', 'philosophical', 'responsibility', 'communication']
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
                    return await this.startGame(context);
                case 'wg':
                    return await this.startGame(context);
                default:
                    throw new Error(`Unknown command: ${commandName}`);
            }
            
        } catch (error) {
            console.error(`❌ Error executing WordGuess command '${commandName}':`, error);
            await context.reply(`❌ Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async startGame(context) {
        try {
            const { args, reply, message } = context;
            const chatId = message.key.remoteJid;
            const player = message.key.participant || message.key.remoteJid;
            
            // Check if game already active
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (activeGame) {
                await reply(`🎮 A ${activeGame.type} game is already active in this chat. Use .endgame to stop it first.`);
                return { success: false, message: 'Game already active' };
            }
            
            // Parse difficulty (default: medium)
            let difficulty = 'medium';
            if (args.length > 0) {
                const inputDifficulty = args[0].toLowerCase();
                if (['easy', 'medium', 'hard'].includes(inputDifficulty)) {
                    difficulty = inputDifficulty;
                }
            }
            
            // Select random word
            const wordList = this.wordLists[difficulty];
            const targetWord = wordList[Math.floor(Math.random() * wordList.length)].toLowerCase();
            
            // Create new game state
            const gameData = {
                targetWord,
                guessedLetters: [],
                incorrectGuesses: [],
                maxAttempts: 6,
                difficulty,
                gameStatus: 'active',
                startTime: new Date().toISOString(),
                player
            };
            
            this.games.set(chatId, gameData);
            await this.saveGameData(chatId, gameData);
            
            const wordDisplay = this.getWordDisplay(gameData);
            const playerName = player.split('@')[0] || 'Player';
            
            let responseMessage = `🎲 **Word Guess Game Started!**\n\n`;
            responseMessage += `👤 **Player:** ${playerName}\n`;
            responseMessage += `🎯 **Difficulty:** ${difficulty.toUpperCase()}\n`;
            responseMessage += `📝 **Word:** ${wordDisplay}\n`;
            responseMessage += `❌ **Wrong Guesses:** 0/${gameData.maxAttempts}\n\n`;
            responseMessage += `📋 **Instructions:**\n`;
            responseMessage += `• Send a letter to guess\n`;
            responseMessage += `• Send "quit" to end the game\n`;
            responseMessage += `• Send "hint" for a clue\n\n`;
            responseMessage += `🎮 **Start guessing letters!**`;
            
            await reply(responseMessage);
            
            // Register game with access controller
            accessController.startGame(chatId, 'wordguess', {
                startedBy: player,
                players: [player],
                state: 'active'
            });
            
            this.eventBus.emit('game_started', {
                chatId,
                gameType: 'wordguess',
                players: [player]
            });
            
            return { success: true, message: 'Game started successfully' };
            
        } catch (error) {
            console.error('Error starting word guess game:', error);
            await context.reply('❌ Failed to start word guess game');
            return { success: false, error: error.message };
        }
    }

    getWordDisplay(gameData) {
        return gameData.targetWord
            .split('')
            .map(letter => gameData.guessedLetters.includes(letter) ? letter.toUpperCase() : '_')
            .join(' ');
    }

    async saveGameData(chatId, gameData) {
        try {
            const filePath = path.join(this.dataPath, `${chatId.replace(/[@:]/g, '_')}.json`);
            await fs.writeJson(filePath, gameData, { spaces: 2 });
        } catch (error) {
            console.error('Error saving WordGuess game data:', error);
        }
    }

    async handleInput(chatId, input, player) {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData || gameData.gameStatus !== 'active') {
                return {
                    message: '❌ No active word guess game',
                    gameEnded: false
                };
            }
            
            const inputLower = input.toLowerCase().trim();
            
            // Handle special commands
            if (inputLower === 'quit') {
                return await this.endGame(chatId, 'quit');
            }
            
            if (inputLower === 'hint') {
                const hint = this.getHint(gameData);
                return {
                    message: `💡 **Hint:** ${hint}`,
                    gameEnded: false
                };
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
                    message: `❌ You already guessed the letter "${inputLower.toUpperCase()}"`,
                    gameEnded: false
                };
            }
            
            // Add letter to guessed letters
            gameData.guessedLetters.push(inputLower);
            
            let responseMessage = '';
            
            if (gameData.targetWord.includes(inputLower)) {
                // Correct guess
                responseMessage += `✅ **Good guess!** The letter "${inputLower.toUpperCase()}" is in the word!\n\n`;
                
                // Check if word is complete
                const wordDisplay = this.getWordDisplay(gameData);
                if (!wordDisplay.includes('_')) {
                    gameData.gameStatus = 'won';
                    responseMessage += `🎊 **Congratulations! You won!**\n\n`;
                    responseMessage += `🎯 **The word was:** ${gameData.targetWord.toUpperCase()}\n`;
                    responseMessage += `📊 **Stats:** ${gameData.incorrectGuesses.length}/${gameData.maxAttempts} wrong guesses`;
                    
                    await this.saveGameData(chatId, gameData);
                    this.games.delete(chatId);
                    
                    return {
                        message: responseMessage,
                        gameEnded: true
                    };
                } else {
                    responseMessage += `📝 **Word:** ${wordDisplay}\n`;
                    responseMessage += `❌ **Wrong Guesses:** ${gameData.incorrectGuesses.length}/${gameData.maxAttempts}`;
                }
            } else {
                // Incorrect guess
                gameData.incorrectGuesses.push(inputLower);
                
                if (gameData.incorrectGuesses.length >= gameData.maxAttempts) {
                    gameData.gameStatus = 'lost';
                    responseMessage += `💀 **Game Over!** You've used all your attempts.\n\n`;
                    responseMessage += `🎯 **The word was:** ${gameData.targetWord.toUpperCase()}`;
                    
                    await this.saveGameData(chatId, gameData);
                    this.games.delete(chatId);
                    
                    return {
                        message: responseMessage,
                        gameEnded: true
                    };
                } else {
                    responseMessage += `❌ **Wrong!** The letter "${inputLower.toUpperCase()}" is not in the word.\n\n`;
                    responseMessage += `📝 **Word:** ${this.getWordDisplay(gameData)}\n`;
                    responseMessage += `❌ **Wrong Guesses:** ${gameData.incorrectGuesses.length}/${gameData.maxAttempts}\n`;
                    responseMessage += `🔤 **Incorrect Letters:** ${gameData.incorrectGuesses.map(l => l.toUpperCase()).join(', ')}`;
                }
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

    getHint(gameData) {
        const hints = {
            easy: 'This is a simple everyday word',
            medium: 'This word has multiple syllables',
            hard: 'This is a complex or sophisticated word'
        };
        
        const letterCount = gameData.targetWord.length;
        const vowels = gameData.targetWord.match(/[aeiou]/gi);
        const vowelCount = vowels ? vowels.length : 0;
        
        return `${hints[gameData.difficulty]}. It has ${letterCount} letters and ${vowelCount} vowels.`;
    }

    async endGame(chatId, reason = 'ended') {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData) {
                return {
                    success: false,
                    message: '❌ No active word guess game'
                };
            }
            
            this.games.delete(chatId);
            
            return {
                success: true,
                message: `🎮 Word guess game ${reason}! The word was: ${gameData.targetWord.toUpperCase()}`
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
                await this.saveGameData(chatId, gameData);
            }
            
            this.isInitialized = false;
            console.log('✅ WordGuess plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during WordGuess plugin shutdown:', error);
        }
    }
}

module.exports = WordGuessPlugin;