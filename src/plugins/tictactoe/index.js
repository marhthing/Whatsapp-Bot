const path = require('path');
const fs = require('fs-extra');

class TicTacToePlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.games = new Map(); // chatId -> game data
        this.isInitialized = false;
        
        // Game storage path
        this.dataPath = path.join(process.cwd(), 'data', 'games', 'tictactoe');
    }

    async initialize() {
        try {
            console.log('🎯 Initializing TicTacToe plugin...');
            
            // Ensure data directory exists
            await fs.ensureDir(this.dataPath);
            
            this.isInitialized = true;
            console.log('✅ TicTacToe plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize TicTacToe plugin:', error);
            throw error;
        }
    }

    async executeCommand(commandName, context) {
        try {
            if (!this.isInitialized) {
                throw new Error('TicTacToe plugin not initialized');
            }

            switch (commandName) {
                case 'tictactoe':
                    return await this.startGame(context);
                case 'ttt':
                    return await this.startGame(context);
                default:
                    throw new Error(`Unknown command: ${commandName}`);
            }
            
        } catch (error) {
            console.error(`❌ Error executing TicTacToe command '${commandName}':`, error);
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
            
            // Parse opponent (required for multiplayer)
            let opponent = null;
            if (args.length > 0) {
                // Handle @mentions or phone numbers
                const mention = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (mention) {
                    opponent = mention;
                } else {
                    opponent = args[0].replace('@', '').replace(/\D/g, '');
                    if (opponent) {
                        opponent += '@s.whatsapp.net';
                    }
                }
            }
            
            if (!opponent) {
                await reply('❌ Please tag someone to play with: .tictactoe @username');
                return { success: false, message: 'No opponent specified' };
            }
            
            // Create new game state
            const gameData = {
                board: Array(9).fill(null), // 0-8 positions
                players: {
                    X: player,
                    O: opponent
                },
                currentPlayer: 'X',
                gameStatus: 'active',
                moves: 0,
                startTime: new Date().toISOString()
            };
            
            this.games.set(chatId, gameData);
            await this.saveGameData(chatId, gameData);
            
            const board = this.renderBoard(gameData.board);
            const playerName = player.split('@')[0] || 'Player1';
            const opponentName = opponent.split('@')[0] || 'Player2';
            
            let responseMessage = `🎯 **Tic-Tac-Toe Game Started!**\n\n`;
            responseMessage += board;
            responseMessage += `\n\n👤 **Players:**\n`;
            responseMessage += `❌ X: ${playerName}\n`;
            responseMessage += `⭕ O: ${opponentName}\n\n`;
            responseMessage += `🎮 **Current Turn:** X (${playerName})\n`;
            responseMessage += `📝 **Instructions:** Send a number 1-9 to place your mark, or "quit" to end the game\n\n`;
            responseMessage += `\`\`\`\n1 | 2 | 3\n---------\n4 | 5 | 6\n---------\n7 | 8 | 9\`\`\``;
            
            await reply(responseMessage);
            
            // Register game with access controller
            accessController.startGame(chatId, 'tictactoe', {
                startedBy: player,
                players: [player, opponent],
                state: 'active'
            });
            
            this.eventBus.emit('game_started', {
                chatId,
                gameType: 'tictactoe',
                players: [player, opponent]
            });
            
            return { success: true, message: 'Game started successfully' };
            
        } catch (error) {
            console.error('Error starting tic-tac-toe game:', error);
            await context.reply('❌ Failed to start tic-tac-toe game');
            return { success: false, error: error.message };
        }
    }

    renderBoard(board) {
        const symbols = board.map((cell, index) => {
            if (cell === 'X') return '❌';
            if (cell === 'O') return '⭕';
            return (index + 1).toString();
        });
        
        return `\`\`\`\n ${symbols[0]} | ${symbols[1]} | ${symbols[2]} \n-----------\n ${symbols[3]} | ${symbols[4]} | ${symbols[5]} \n-----------\n ${symbols[6]} | ${symbols[7]} | ${symbols[8]} \n\`\`\``;
    }

    async saveGameData(chatId, gameData) {
        try {
            const filePath = path.join(this.dataPath, `${chatId.replace(/[@:]/g, '_')}.json`);
            await fs.writeJson(filePath, gameData, { spaces: 2 });
        } catch (error) {
            console.error('Error saving TicTacToe game data:', error);
        }
    }

    async handleInput(chatId, input, player) {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData || gameData.gameStatus !== 'active') {
                return {
                    message: '❌ No active tic-tac-toe game',
                    gameEnded: false
                };
            }
            
            const inputLower = input.toLowerCase().trim();
            
            // Handle quit command
            if (inputLower === 'quit') {
                return await this.endGame(chatId, 'quit');
            }
            
            // Parse move (1-9)
            const move = parseInt(input);
            if (isNaN(move) || move < 1 || move > 9) {
                return {
                    message: '❌ Invalid move. Please enter a number 1-9.',
                    gameEnded: false
                };
            }
            
            const boardIndex = move - 1;
            
            // Check if position is already taken
            if (gameData.board[boardIndex] !== null) {
                return {
                    message: '❌ That position is already taken. Choose another.',
                    gameEnded: false
                };
            }
            
            // Validate player turn
            const currentPlayerSymbol = gameData.currentPlayer;
            const expectedPlayer = gameData.players[currentPlayerSymbol];
            
            if (player !== expectedPlayer) {
                return {
                    message: `❌ It's not your turn. Waiting for ${expectedPlayer.split('@')[0]}.`,
                    gameEnded: false
                };
            }
            
            // Make the move
            gameData.board[boardIndex] = currentPlayerSymbol;
            gameData.moves++;
            
            // Check for winner
            const winner = this.checkWinner(gameData.board);
            let responseMessage = '';
            
            if (winner) {
                gameData.gameStatus = 'finished';
                const winnerName = winner === 'AI' ? 'AI' : gameData.players[winner].split('@')[0];
                responseMessage = `🎊 **Game Over!**\n\n${this.renderBoard(gameData.board)}\n\n🏆 **Winner: ${winnerName} (${winner === 'X' ? '❌' : '⭕'})**`;
                
                await this.saveGameData(chatId, gameData);
                this.games.delete(chatId);
                
                return {
                    message: responseMessage,
                    gameEnded: true
                };
            } else if (gameData.moves >= 9) {
                gameData.gameStatus = 'finished';
                responseMessage = `🤝 **Game Over!**\n\n${this.renderBoard(gameData.board)}\n\n**Result: It's a tie!**`;
                
                await this.saveGameData(chatId, gameData);
                this.games.delete(chatId);
                
                return {
                    message: responseMessage,
                    gameEnded: true
                };
            } else {
                // Switch turns
                gameData.currentPlayer = gameData.currentPlayer === 'X' ? 'O' : 'X';
                const nextPlayer = gameData.players[gameData.currentPlayer];
                const nextPlayerName = nextPlayer === 'AI' ? 'AI' : nextPlayer.split('@')[0];
                
                responseMessage = `${this.renderBoard(gameData.board)}\n\n🎮 **Next Turn:** ${gameData.currentPlayer} (${nextPlayerName})`;
                
                await this.saveGameData(chatId, gameData);
                
                return {
                    message: responseMessage,
                    gameEnded: false
                };
            }
            
        } catch (error) {
            console.error('Error handling TicTacToe input:', error);
            return {
                message: '❌ Error processing move',
                gameEnded: false
            };
        }
    }

    checkWinner(board) {
        const winningCombinations = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6] // diagonals
        ];
        
        for (const combo of winningCombinations) {
            const [a, b, c] = combo;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }
        
        return null;
    }

    getAIMove(board) {
        // Simple AI: find first available spot
        for (let i = 0; i < board.length; i++) {
            if (board[i] === null) {
                return i;
            }
        }
        return -1;
    }

    async endGame(chatId, reason = 'ended') {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData) {
                return {
                    success: false,
                    message: '❌ No active tic-tac-toe game'
                };
            }
            
            this.games.delete(chatId);
            
            return {
                success: true,
                message: `🎮 Tic-tac-toe game ${reason}!`
            };
            
        } catch (error) {
            console.error('Error ending TicTacToe game:', error);
            return {
                success: false,
                message: '❌ Error ending game'
            };
        }
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down TicTacToe plugin...');
            
            // Save any active games
            for (const [chatId, gameData] of this.games.entries()) {
                await this.saveGameData(chatId, gameData);
            }
            
            this.isInitialized = false;
            console.log('✅ TicTacToe plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during TicTacToe plugin shutdown:', error);
        }
    }
}

module.exports = TicTacToePlugin;