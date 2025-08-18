class TicTacToe {
    constructor(botClient, eventBus, gameStates) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.gameStates = gameStates;
        
        this.games = new Map(); // chatId -> game data
    }

    async startGame(chatId, player1, player2 = null) {
        try {
            // Create new game state
            const gameData = {
                board: Array(9).fill(null), // 0-8 positions
                players: {
                    X: player1,
                    O: player2 || 'AI' // AI opponent if no player2
                },
                currentPlayer: 'X',
                gameStatus: 'active',
                moves: 0,
                startTime: new Date().toISOString()
            };
            
            this.games.set(chatId, gameData);
            await this.gameStates.startGame(chatId, 'tictactoe', gameData);
            
            const board = this.renderBoard(gameData.board);
            let message = `🎯 **Tic-Tac-Toe Game Started!**\n\n`;
            message += board;
            message += `\n\n👤 **Players:**\n`;
            message += `❌ X: Player ${player1.split('@')[0]}\n`;
            message += `⭕ O: ${player2 ? `Player ${player2.split('@')[0]}` : 'AI'}\n\n`;
            message += `🎮 **Current Turn:** X (${player1.split('@')[0]})\n`;
            message += `📝 **Instructions:** Send a number 1-9 to place your mark, or "quit" to end the game\n\n`;
            message += `\`\`\`\n1 | 2 | 3\n---------\n4 | 5 | 6\n---------\n7 | 8 | 9\`\`\``;
            
            this.eventBus.emit('game_started', {
                chatId,
                gameType: 'tictactoe',
                players: [player1, player2].filter(Boolean)
            });
            
            return {
                success: true,
                message,
                players: [player1, player2].filter(Boolean)
            };
            
        } catch (error) {
            console.error('Error starting tic-tac-toe game:', error);
            return {
                success: false,
                message: '❌ Failed to start tic-tac-toe game'
            };
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
            
            // Validate move
            const position = parseInt(input) - 1; // Convert to 0-based index
            if (isNaN(position) || position < 0 || position > 8) {
                return {
                    message: '❌ Invalid position. Please enter a number 1-9',
                    gameEnded: false
                };
            }
            
            // Check if position is already taken
            if (gameData.board[position] !== null) {
                return {
                    message: '❌ Position already taken. Choose another position',
                    gameEnded: false
                };
            }
            
            // Determine player symbol
            let playerSymbol;
            if (player === gameData.players.X) {
                playerSymbol = 'X';
            } else if (player === gameData.players.O) {
                playerSymbol = 'O';
            } else if (gameData.players.O === 'AI' && gameData.currentPlayer === 'O') {
                // Allow any player to make AI moves
                playerSymbol = 'O';
            } else {
                return {
                    message: '❌ It\'s not your turn or you\'re not in this game',
                    gameEnded: false
                };
            }
            
            // Check if it's the player's turn
            if (playerSymbol !== gameData.currentPlayer) {
                const currentPlayerName = gameData.players[gameData.currentPlayer];
                const displayName = currentPlayerName === 'AI' ? 'AI' : currentPlayerName.split('@')[0];
                return {
                    message: `⏳ Wait for ${displayName}'s turn (${gameData.currentPlayer})`,
                    gameEnded: false
                };
            }
            
            // Make the move
            gameData.board[position] = playerSymbol;
            gameData.moves++;
            
            // Check for win
            const winner = this.checkWinner(gameData.board);
            const board = this.renderBoard(gameData.board);
            
            let message = `🎯 **Tic-Tac-Toe**\n\n${board}\n\n`;
            
            if (winner) {
                // Game won
                gameData.gameStatus = 'finished';
                gameData.winner = winner;
                
                const winnerName = gameData.players[winner];
                const displayName = winnerName === 'AI' ? 'AI' : winnerName.split('@')[0];
                
                message += `🎉 **Game Over!**\n`;
                message += `🏆 Winner: ${displayName} (${winner})\n`;
                message += `🎮 Moves: ${gameData.moves}`;
                
                this.games.delete(chatId);
                await this.gameStates.endGame(chatId, gameData);
                
                return {
                    message,
                    gameEnded: true
                };
                
            } else if (gameData.moves >= 9) {
                // Game tied
                gameData.gameStatus = 'finished';
                gameData.winner = 'tie';
                
                message += `🤝 **Game Over!**\n`;
                message += `⚖️ Result: Tie game!\n`;
                message += `🎮 Total moves: ${gameData.moves}`;
                
                this.games.delete(chatId);
                await this.gameStates.endGame(chatId, gameData);
                
                return {
                    message,
                    gameEnded: true
                };
                
            } else {
                // Continue game
                gameData.currentPlayer = gameData.currentPlayer === 'X' ? 'O' : 'X';
                
                const nextPlayerName = gameData.players[gameData.currentPlayer];
                const displayName = nextPlayerName === 'AI' ? 'AI' : nextPlayerName.split('@')[0];
                
                message += `🎮 **Next Turn:** ${displayName} (${gameData.currentPlayer})\n`;
                message += `📝 Send a number 1-9 to place your mark`;
                
                // Handle AI move
                if (gameData.currentPlayer === 'O' && gameData.players.O === 'AI') {
                    setTimeout(() => {
                        this.makeAIMove(chatId);
                    }, 2000); // 2 second delay for AI move
                }
                
                await this.gameStates.updateGame(chatId, gameData);
                
                return {
                    message,
                    gameEnded: false
                };
            }
            
        } catch (error) {
            console.error('Error handling tic-tac-toe input:', error);
            return {
                message: '❌ Error processing move',
                gameEnded: false
            };
        }
    }

    async makeAIMove(chatId) {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData || gameData.gameStatus !== 'active' || gameData.currentPlayer !== 'O') {
                return;
            }
            
            // Simple AI: find first available position
            const availablePositions = [];
            for (let i = 0; i < 9; i++) {
                if (gameData.board[i] === null) {
                    availablePositions.push(i);
                }
            }
            
            if (availablePositions.length === 0) {
                return;
            }
            
            // Choose random available position
            const randomIndex = Math.floor(Math.random() * availablePositions.length);
            const aiPosition = availablePositions[randomIndex];
            
            // Make AI move
            const result = await this.handleInput(chatId, String(aiPosition + 1), 'AI');
            
            if (result) {
                await this.botClient.sendMessage(chatId, `🤖 **AI Move:**\n\n${result.message}`);
            }
            
        } catch (error) {
            console.error('Error making AI move:', error);
        }
    }

    checkWinner(board) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];
        
        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (board[a] && board[a] === board[b] && board[b] === board[c]) {
                return board[a];
            }
        }
        
        return null;
    }

    renderBoard(board) {
        const symbols = {
            X: '❌',
            O: '⭕',
            null: '⬜'
        };
        
        let rendered = '';
        for (let i = 0; i < 9; i += 3) {
            const row = board.slice(i, i + 3)
                .map(cell => symbols[cell] || symbols.null)
                .join(' ');
            rendered += row + '\n';
        }
        
        return rendered.trim();
    }

    async endGame(chatId, reason = 'normal') {
        try {
            const gameData = this.games.get(chatId);
            
            if (!gameData) {
                return {
                    success: false,
                    message: '❌ No active tic-tac-toe game'
                };
            }
            
            let message = `🎯 **Tic-Tac-Toe Game Ended**\n\n`;
            
            if (reason === 'quit') {
                message += `⏹️ Game quit by player\n`;
            } else {
                message += `🏁 Game ended\n`;
            }
            
            message += `🎮 Total moves: ${gameData.moves}\n`;
            message += `⏱️ Duration: ${this.getGameDuration(gameData.startTime)}`;
            
            this.games.delete(chatId);
            await this.gameStates.endGame(chatId, gameData);
            
            this.eventBus.emit('game_ended', {
                chatId,
                gameType: 'tictactoe',
                reason,
                moves: gameData.moves
            });
            
            return {
                success: true,
                message,
                gameEnded: true
            };
            
        } catch (error) {
            console.error('Error ending tic-tac-toe game:', error);
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
                return '❌ No active tic-tac-toe game';
            }
            
            const board = this.renderBoard(gameData.board);
            const currentPlayerName = gameData.players[gameData.currentPlayer];
            const displayName = currentPlayerName === 'AI' ? 'AI' : currentPlayerName.split('@')[0];
            
            let info = `🎯 **Tic-Tac-Toe Game Info**\n\n`;
            info += board;
            info += `\n\n👤 **Players:**\n`;
            info += `❌ X: ${gameData.players.X.split('@')[0]}\n`;
            info += `⭕ O: ${gameData.players.O === 'AI' ? 'AI' : gameData.players.O.split('@')[0]}\n\n`;
            info += `🎮 **Current Turn:** ${displayName} (${gameData.currentPlayer})\n`;
            info += `📊 **Moves:** ${gameData.moves}/9\n`;
            info += `⏱️ **Duration:** ${this.getGameDuration(gameData.startTime)}`;
            
            return info;
            
        } catch (error) {
            console.error('Error getting tic-tac-toe game info:', error);
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

module.exports = { TicTacToe };
