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
        
        // Listen for game input events
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.eventBus) {
            this.eventBus.on('game_input_received', async (data) => {
                if (data.gameType === 'tictactoe') {
                    await this.processGameInput(data);
                }
            });
        }
    }

    async processGameInput(data) {
        try {
            const { chatId, input, player } = data;
            const result = await this.handleInput(chatId, input, player);
            
            if (result.message) {
                // Send the response back through the bot client
                await this.botClient.sendMessage(chatId, result.message);
            }
            
            if (result.gameEnded) {
                // Clean up game state
                const accessController = this.botClient.getAccessController();
                accessController.endGame(chatId);
                this.eventBus.emit('game_ended', {
                    chatId,
                    gameType: 'tictactoe'
                });
            }
            
        } catch (error) {
            console.error('Error processing tic-tac-toe input:', error);
        }
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
            
            // Get the actual sender JID properly (following AccessController pattern)
            let player;
            if (message.key) {
                if (message.key.fromMe) {
                    // For outgoing messages, this would be the owner, but we shouldn't get here
                    // since the bot owner would use the access controller logic
                    player = message.key.remoteJid;
                } else {
                    // For incoming messages:
                    // - In groups: participant is the sender
                    // - In individual chats: remoteJid is the sender
                    player = message.key.participant || message.key.remoteJid;
                }
            } else {
                // Fallback for other message structures
                player = message.author || message.from;
            }
            
            // Check if game already active
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);
            
            if (activeGame) {
                await reply(`🎮 A ${activeGame.type} game is already active in this chat. Use .endgame to stop it first.`);
                return { success: false, message: 'Game already active' };
            }
            
            // Parse opponent (REQUIRED for multiplayer)
            let opponent = null;
            
            console.log('🎯 TicTacToe Debug - Player:', player, 'Chat:', chatId);
            // Only log the important parts to avoid too much output
            console.log('🎯 Message structure analysis:');
            console.log('  - Args:', args);
            console.log('  - ExtendedText mentions:', message.message?.extendedTextMessage?.contextInfo?.mentionedJid);
            console.log('  - Direct contextInfo mentions:', message.message?.contextInfo?.mentionedJid);
            console.log('  - Message level mentions:', message.mentionedJid);
            console.log('  - Conversation text:', message.message?.conversation);
            console.log('  - Extended text:', message.message?.extendedTextMessage?.text);
            
            // Determine opponent using same logic as .allow command
            if (chatId.endsWith('@g.us')) {
                // Group chat: Check if replying to someone's message
                if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                    const quotedParticipant = message.message.extendedTextMessage.contextInfo.participant;
                    if (quotedParticipant && quotedParticipant !== player) {
                        opponent = quotedParticipant;
                        console.log('🎯 Found quoted opponent in group:', opponent);
                    } else {
                        console.log('🎯 Quoted participant is same as player, skipping');
                    }
                }
                // Handle phone numbers from args in groups
                else if (args.length > 0) {
                    let userInput = args[0].replace('@', '');
                    
                    // Check if it's a phone number (digits only)
                    if (/^\d+$/.test(userInput)) {
                        opponent = userInput + '@s.whatsapp.net';
                        console.log('🎯 Found opponent from phone number in group:', opponent);
                    }
                    // Handle username - we'll need to ask for phone number instead
                    else if (userInput.length > 0) {
                        await reply(`❌ Cannot find user "${userInput}". In groups, please:\n\n• Reply to their message: .tictactoe\n• Use phone number: .tictactoe @2348012345678`);
                        return { success: false, message: 'Username not supported in groups' };
                    }
                }
                // No specific opponent in group
                else {
                    await reply('❌ In groups, please:\n\n• Reply to someone\'s message: .tictactoe\n• Tag with phone number: .tictactoe @2348012345678');
                    return { success: false, message: 'No opponent specified in group' };
                }
            } else {
                // Individual/private chat
                if (args.length > 0) {
                    // User specified someone else in private chat
                    let userInput = args[0].replace('@', '');
                    
                    if (/^\d+$/.test(userInput)) {
                        opponent = userInput + '@s.whatsapp.net';
                        console.log('🎯 Found opponent from phone number in private chat:', opponent);
                    } else if (userInput.length > 0) {
                        await reply(`❌ Cannot find user "${userInput}". Please use their phone number:\n\nExample: .tictactoe @2348012345678`);
                        return { success: false, message: 'Username not supported' };
                    }
                } else {
                    // No args in private chat - play with the chat partner
                    opponent = chatId;
                    console.log('🎯 Found private chat opponent:', opponent);
                }
            }
            
            // Opponent is REQUIRED - no AI mode
            if (!opponent) {
                await reply('❌ Please specify someone to play with. This should not happen - check the logic above.');
                return { success: false, message: 'No opponent specified' };
            }
            
            // Don't allow playing against yourself
            console.log('🎯 Checking self-play - Player:', player, 'Opponent:', opponent);
            if (opponent === player) {
                await reply('❌ You cannot play against yourself! Tag someone else.');
                return { success: false, message: 'Cannot play against self' };
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
            
            let responseMessage = `🎮 Game started! ${playerName} (X) vs ${opponentName} (O).\n\n`;
            responseMessage += board;
            responseMessage += `\n\n@${playerName}, you go first. Send a number 1-9.\n\n`;
            responseMessage += `Use numbers 1-9 to play.\nExample: "5" puts your mark in the center.`;
            
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
            return ` ${index + 1} `;
        });
        
        return `\`\`\`\n${symbols[0]}│${symbols[1]}│${symbols[2]}\n───┼───┼───\n${symbols[3]}│${symbols[4]}│${symbols[5]}\n───┼───┼───\n${symbols[6]}│${symbols[7]}│${symbols[8]}\n\`\`\``;
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
            
            console.log('🎯 HandleInput Debug - Chat:', chatId, 'Player:', player, 'Input:', input);
            
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
                const waitingPlayerName = expectedPlayer.split('@')[0];
                return {
                    message: `Hey @${player.split('@')[0]}, it's not your turn.`,
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
                const winnerName = gameData.players[winner].split('@')[0];
                responseMessage = `${winnerName} placed ${winner} at ${move}\n\n${this.renderBoard(gameData.board)}\n\n🏆 ${winnerName} wins!`;
                
                await this.saveGameData(chatId, gameData);
                this.games.delete(chatId);
                
                return {
                    message: responseMessage,
                    gameEnded: true
                };
            } else if (gameData.moves >= 9) {
                gameData.gameStatus = 'finished';
                responseMessage = `${player.split('@')[0]} placed ${currentPlayerSymbol} at ${move}\n\n${this.renderBoard(gameData.board)}\n\nIt's a tie!`;
                
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
                const nextPlayerName = nextPlayer.split('@')[0];
                
                responseMessage = `${player.split('@')[0]} placed ${currentPlayerSymbol} at ${move}\n\n${this.renderBoard(gameData.board)}\n\n@${nextPlayerName}, your turn.`;
                
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

    /**
     * Extract all possible mentions from a message
     */
    extractAllMentions(message) {
        const mentions = [];
        
        // Method 1: Check extendedTextMessage contextInfo
        const extendedMentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (extendedMentions && extendedMentions.length > 0) {
            mentions.push(...extendedMentions);
            console.log('🎯 Found mentions in extendedTextMessage:', extendedMentions);
        }
        
        // Method 2: Check direct contextInfo
        const directMentions = message.message?.contextInfo?.mentionedJid;
        if (directMentions && directMentions.length > 0) {
            mentions.push(...directMentions);
            console.log('🎯 Found mentions in contextInfo:', directMentions);
        }
        
        // Method 3: Check message level mentions
        if (message.mentionedJid && message.mentionedJid.length > 0) {
            mentions.push(...message.mentionedJid);
            console.log('🎯 Found mentions at message level:', message.mentionedJid);
        }
        
        // Method 4: Extract from WhatsApp internal message structure
        const internalMentions = message.message?.conversation?.match(/@(\d+)/g) || 
                               message.message?.extendedTextMessage?.text?.match(/@(\d+)/g);
        if (internalMentions) {
            const jids = internalMentions.map(m => m.replace('@', '') + '@s.whatsapp.net');
            mentions.push(...jids);
            console.log('🎯 Found mentions from text parsing:', jids);
        }
        
        // Remove duplicates and filter valid JIDs
        const uniqueMentions = [...new Set(mentions)].filter(jid => 
            jid && jid.includes('@') && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us'))
        );
        
        return uniqueMentions;
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