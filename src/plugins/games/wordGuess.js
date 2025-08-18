class WordGuess {
    constructor(botClient, eventBus, gameStates) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.gameStates = gameStates;
        
        this.games = new Map(); // chatId -> game data
        this.wordList = [
            'JAVASCRIPT', 'WHATSAPP', 'COMPUTER', 'KEYBOARD', 'INTERNET', 'PROGRAMMING', 'ALGORITHM',
            'DATABASE', 'NETWORK', 'SOFTWARE', 'HARDWARE', 'SECURITY', 'ENCRYPTION', 'ARTIFICIAL',
            'INTELLIGENCE', 'MACHINE', 'LEARNING', 'TECHNOLOGY', 'DEVELOPMENT', 'FRAMEWORK'
        ];
    }

    async startGame(chatId, player) {
        try {
            // Select random word
            const word = this.wordList[Math.floor(Math.random() * this.wordList.length)];
            
            // Create new game state
            const gameData = {
                word: word.toUpperCase(),
                guessedLetters: new Set(),
                correctLetters: new Set(),
                wrongLetters: new Set(),
                player: player,
                gameStatus: 'active',
                maxWrongGuesses: 6,
                wrongGuesses: 0,
                startTime: new Date().toISOString(),
                hints: this.getHints(word)
            };
            
            this.games.set(chatId, gameData);
            await this.gameStates.startGame(chatId, 'wordguess', gameData);
            
            const display = this.getWordDisplay(gameData);
            const hangman = this.getHangmanDrawing(gameData.wrongGuesses);
            
            let message = `🔤 **Word Guessing Game Started!**\n\n`;
            message += hangman + '\n\n';
            message += `**Word:** ${display}\n`;
            message += `**Length:** ${word.length} letters\n`;
            message += `**Wrong guesses:** 0/${gameData.maxWrongGuesses}\n\n`;
            message += `🎮 **Instructions:**\n`;
            message += `• Send a single letter to guess\n`;
            message += `• Send "hint" for a clue\n`;
            message += `• Send "quit" to end the game\n\n`;
            message += `👤 **Player:** ${player.split('@')[0]}`;
            
            this.eventBus.emit('game_started', {
                chatId,
                gameType: 'wordguess',
                players: [player]
            });
            
            return {
                success: true,
                message,
                players: [player]
            };
            
        } catch (error) {
            console.error('Error starting word guess game:', error);
            return {
                success: false,
                message: '❌ Failed to start word guess game'
            };
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
                return this.getHint(gameData);
            }
            
            // Validate single letter input
            if (!/^[a-zA-Z]$/.test(input)) {
                return {
                    message: '❌ Please enter a single letter (A-Z)',
                    gameEnded: false
                };
            }
            
            const letter = input.toUpperCase();
            
            // Check if letter already guessed
            if (gameData.guessedLetters.has(letter)) {
                return {
                    message: `❌ You already guessed "${letter}". Try a different letter.`,
                    gameEnded: false
                };
            }
            
            // Make the guess
            gameData.guessedLetters.add(letter);
            
            let message = `🔤 **Word Guessing Game**\n\n`;
            
            if (gameData.word.includes(letter)) {
                // Correct guess
                gameData.correctLetters.add(letter);
                message += `✅ Good guess! "${letter}" is in the word.\n\n`;
            } else {
                // Wrong guess
                gameData.wrongLetters.add(letter);
                gameData.wrongGuesses++;
                message += `❌ Sorry, "${letter}" is not in the word.\n\n`;
            }
            
            // Check for win condition
            const allLettersGuessed = gameData.word.split('').every(char => gameData.correctLetters.has(char));
            
            const hangman = this.getHangmanDrawing(gameData.wrongGuesses);
            const display = this.getWordDisplay(gameData);
            
            message += hangman + '\n\n';
            message += `**Word:** ${display}\n`;
            message += `**Wrong guesses:** ${gameData.wrongGuesses}/${gameData.maxWrongGuesses}\n`;
            message += `**Guessed letters:** ${Array.from(gameData.guessedLetters).sort().join(', ')}\n\n`;
            
            if (allLettersGuessed) {
                // Player won
                gameData.gameStatus = 'won';
                message += `🎉 **Congratulations!**\n`;
                message += `🏆 You guessed the word: **${gameData.word}**\n`;
                message += `⏱️ Time: ${this.getGameDuration(gameData.startTime)}\n`;
                message += `🎯 Wrong guesses: ${gameData.wrongGuesses}/${gameData.maxWrongGuesses}`;
                
                this.games.delete(chatId);
                await this.gameStates.endGame(chatId, gameData);
                
                return {
                    message,
                    gameEnded: true
                };
                
            } else if (gameData.wrongGuesses >= gameData.maxWrongGuesses) {
                // Player lost
                gameData.gameStatus = 'lost';
                message += `💀 **Game Over!**\n`;
                message += `😞 You ran out of guesses.\n`;
                message += `🔤 The word was: **${gameData.word}**\n`;
                message += `⏱️ Time: ${this.getGameDuration(gameData.startTime)}`;
                
                this.games.delete(chatId);
                await this.gameStates.endGame(chatId, gameData);
                
                return {
                    message,
                    gameEnded: true
                };
                
            } else {
                // Continue game
                const remainingGuesses = gameData.maxWrongGuesses - gameData.wrongGuesses;
                message += `🎮 Keep guessing! ${remainingGuesses} wrong guess${remainingGuesses === 1 ? '' : 'es'} remaining.`;
                
                await this.gameStates.updateGame(chatId, gameData);
                
                return {
                    message,
                    gameEnded: false
                };
            }
            
        } catch (error) {
            console.error('Error handling word guess input:', error);
            return {
                message: '❌ Error processing guess',
                gameEnded: false
            };
        }
    }

    getWordDisplay(gameData) {
        return gameData.word
            .split('')
            .map(letter => gameData.correctLetters.has(letter) ? letter : '_')
            .join(' ');
    }

    getHangmanDrawing(wrongGuesses) {
        const drawings = [
            // 0 wrong guesses
            '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
            // 1 wrong guess
            '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
            // 2 wrong guesses
            '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
            // 3 wrong guesses
            '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
            // 4 wrong guesses
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
            // 5 wrong guesses
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
            // 6 wrong guesses (game over)
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
        ];
        
        return drawings[Math.min(wrongGuesses, drawings.length - 1)];
    }

    getHints(word) {
        const hints = {
            'JAVASCRIPT': 'A popular programming language for web development',
            'WHATSAPP': 'A messaging application owned by Meta',
            'COMPUTER': 'An electronic device for processing data',
            'KEYBOARD': 'Input device with keys for typing',
            'INTERNET': 'Global network connecting computers worldwide',
            'PROGRAMMING': 'The process of creating computer software',
            'ALGORITHM': 'A step-by-step procedure for solving problems',
            'DATABASE': 'Organized collection of data',
            'NETWORK': 'Group of interconnected devices',
            'SOFTWARE': 'Computer programs and applications',
            'HARDWARE': 'Physical components of a computer',
            'SECURITY': 'Protection against threats and attacks',
            'ENCRYPTION': 'Process of encoding information',
            'ARTIFICIAL': 'Man-made or synthetic',
            'INTELLIGENCE': 'Ability to learn and understand',
            'MACHINE': 'Device that performs work',
            'LEARNING': 'Process of acquiring knowledge',
            'TECHNOLOGY': 'Application of scientific knowledge',
            'DEVELOPMENT': 'Process of creating or improving',
            'FRAMEWORK': 'Basic structure or foundation'
        };
        
        return hints[word.toUpperCase()] || 'No hint available for this word';
    }

    getHint(gameData) {
        const hint = gameData.hints;
        return {
            message: `💡 **Hint:** ${hint}`,
            gameEnded: false
        };
    }

    async endGame(chatId, reason = 'normal') {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData) {
                return {
                    success: false,
                    message: '❌ No active word guess game'
                };
            }
            
            let message = `🔤 **Word Guessing Game Ended**\n\n`;
            
            if (reason === 'quit') {
                message += `⏹️ Game quit by player\n`;
                message += `🔤 The word was: **${gameData.word}**\n`;
            } else {
                message += `🏁 Game ended\n`;
            }
            
            const display = this.getWordDisplay(gameData);
            message += `**Progress:** ${display}\n`;
            message += `🎯 Wrong guesses: ${gameData.wrongGuesses}/${gameData.maxWrongGuesses}\n`;
            message += `⏱️ Duration: ${this.getGameDuration(gameData.startTime)}`;
            
            this.games.delete(chatId);
            await this.gameStates.endGame(chatId, gameData);
            
            this.eventBus.emit('game_ended', {
                chatId,
                gameType: 'wordguess',
                reason,
                wrongGuesses: gameData.wrongGuesses
            });
            
            return {
                success: true,
                message,
                gameEnded: true
            };
            
        } catch (error) {
            console.error('Error ending word guess game:', error);
            return {
                success: false,
                message: '❌ Error ending game'
            };
        }
    }

    async getGameInfo(chatId) {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData) {
                return '❌ No active word guess game';
            }
            
            const display = this.getWordDisplay(gameData);
            const hangman = this.getHangmanDrawing(gameData.wrongGuesses);
            
            let info = `🔤 **Word Guessing Game Info**\n\n`;
            info += hangman + '\n\n';
            info += `**Word:** ${display}\n`;
            info += `**Length:** ${gameData.word.length} letters\n`;
            info += `**Wrong guesses:** ${gameData.wrongGuesses}/${gameData.maxWrongGuesses}\n`;
            info += `**Guessed letters:** ${Array.from(gameData.guessedLetters).sort().join(', ')}\n`;
            info += `👤 **Player:** ${gameData.player.split('@')[0]}\n`;
            info += `⏱️ **Duration:** ${this.getGameDuration(gameData.startTime)}`;
            
            return info;
            
        } catch (error) {
            console.error('Error getting word guess game info:', error);
            return '❌ Error retrieving game information';
        }
    }

    getGameDuration(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        const durationMs = now - start;
        
        const minutes = Math.floor(durationMs / (1000 * 60));
        const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
        
        return `${minutes}m ${seconds}s`;
    }
}

module.exports = { WordGuess };
