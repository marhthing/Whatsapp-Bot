const fs = require('fs-extra');
const path = require('path');

class GameStates {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        
        this.activeGames = new Map(); // chatId -> game data
        this.gameHistory = []; // completed games
        this.playerStats = new Map(); // playerId -> stats
        
        this.dataPath = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            this.dataPath = path.join(
                process.cwd(),
                'data',
                'plugins',
                'games'
            );
            
            await fs.ensureDir(this.dataPath);
            
            // Load existing game data
            await this.loadGameData();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Error initializing GameStates:', error);
        }
    }

    async loadGameData() {
        try {
            const activeGamesPath = path.join(this.dataPath, 'active_games.json');
            const historyPath = path.join(this.dataPath, 'game_history.json');
            const statsPath = path.join(this.dataPath, 'player_stats.json');
            
            if (await fs.pathExists(activeGamesPath)) {
                const activeData = await fs.readJson(activeGamesPath);
                for (const [chatId, gameData] of Object.entries(activeData)) {
                    this.activeGames.set(chatId, gameData);
                }
            }
            
            if (await fs.pathExists(historyPath)) {
                this.gameHistory = await fs.readJson(historyPath);
            }
            
            if (await fs.pathExists(statsPath)) {
                const statsData = await fs.readJson(statsPath);
                for (const [playerId, stats] of Object.entries(statsData)) {
                    this.playerStats.set(playerId, stats);
                }
            }
            
        } catch (error) {
            console.error('Error loading game data:', error);
        }
    }

    async saveGameData() {
        try {
            const activeGamesPath = path.join(this.dataPath, 'active_games.json');
            const historyPath = path.join(this.dataPath, 'game_history.json');
            const statsPath = path.join(this.dataPath, 'player_stats.json');
            
            await fs.writeJson(activeGamesPath, Object.fromEntries(this.activeGames.entries()));
            await fs.writeJson(historyPath, this.gameHistory);
            await fs.writeJson(statsPath, Object.fromEntries(this.playerStats.entries()));
            
        } catch (error) {
            console.error('Error saving game data:', error);
        }
    }

    async startGame(chatId, gameType, gameData) {
        try {
            const game = {
                chatId,
                gameType,
                ...gameData,
                startedAt: new Date().toISOString()
            };
            
            this.activeGames.set(chatId, game);
            await this.saveGameData();
            
            // Update player stats
            const players = gameData.players || [];
            if (typeof players === 'string') {
                this.updatePlayerStats(players, 'gamesStarted');
            } else if (Array.isArray(players)) {
                players.forEach(player => {
                    if (player && player !== 'AI') {
                        this.updatePlayerStats(player, 'gamesStarted');
                    }
                });
            }
            
            this.eventBus.emit('game_state_changed', {
                chatId,
                gameType,
                action: 'started',
                gameData: game
            });
            
        } catch (error) {
            console.error('Error starting game:', error);
        }
    }

    async updateGame(chatId, gameData) {
        try {
            if (this.activeGames.has(chatId)) {
                const existingGame = this.activeGames.get(chatId);
                const updatedGame = {
                    ...existingGame,
                    ...gameData,
                    updatedAt: new Date().toISOString()
                };
                
                this.activeGames.set(chatId, updatedGame);
                await this.saveGameData();
                
                this.eventBus.emit('game_state_changed', {
                    chatId,
                    gameType: updatedGame.gameType,
                    action: 'updated',
                    gameData: updatedGame
                });
            }
            
        } catch (error) {
            console.error('Error updating game:', error);
        }
    }

    async endGame(chatId, gameData = null) {
        try {
            const game = this.activeGames.get(chatId);
            
            if (game) {
                // Merge final game data
                const finalGame = {
                    ...game,
                    ...gameData,
                    endedAt: new Date().toISOString(),
                    duration: Date.now() - new Date(game.startedAt).getTime()
                };
                
                // Move to history
                this.gameHistory.push(finalGame);
                
                // Keep only last 1000 games in history
                if (this.gameHistory.length > 1000) {
                    this.gameHistory = this.gameHistory.slice(-1000);
                }
                
                // Remove from active games
                this.activeGames.delete(chatId);
                
                // Update player stats
                this.updateGameEndStats(finalGame);
                
                await this.saveGameData();
                
                this.eventBus.emit('game_state_changed', {
                    chatId,
                    gameType: finalGame.gameType,
                    action: 'ended',
                    gameData: finalGame
                });
            }
            
        } catch (error) {
            console.error('Error ending game:', error);
        }
    }

    updateGameEndStats(game) {
        try {
            const players = [];
            
            // Extract players based on game type
            if (game.gameType === 'tictactoe') {
                if (game.players && game.players.X) players.push(game.players.X);
                if (game.players && game.players.O && game.players.O !== 'AI') players.push(game.players.O);
            } else if (game.gameType === 'wordguess') {
                if (game.player) players.push(game.player);
            }
            
            // Update stats for each player
            players.forEach(player => {
                this.updatePlayerStats(player, 'gamesCompleted');
                
                if (game.winner === player || 
                    (game.gameType === 'wordguess' && game.gameStatus === 'won')) {
                    this.updatePlayerStats(player, 'gamesWon');
                } else if (game.winner && game.winner !== 'tie') {
                    this.updatePlayerStats(player, 'gamesLost');
                } else if (game.winner === 'tie') {
                    this.updatePlayerStats(player, 'gamesTied');
                }
                
                // Game type specific stats
                this.updatePlayerStats(player, `${game.gameType}Games`);
            });
            
        } catch (error) {
            console.error('Error updating game end stats:', error);
        }
    }

    updatePlayerStats(playerId, statKey, increment = 1) {
        try {
            if (!playerId || playerId === 'AI') return;
            
            if (!this.playerStats.has(playerId)) {
                this.playerStats.set(playerId, {
                    playerId,
                    gamesStarted: 0,
                    gamesCompleted: 0,
                    gamesWon: 0,
                    gamesLost: 0,
                    gamesTied: 0,
                    tictactoeGames: 0,
                    wordguessGames: 0,
                    firstGame: new Date().toISOString(),
                    lastGame: new Date().toISOString()
                });
            }
            
            const stats = this.playerStats.get(playerId);
            stats[statKey] = (stats[statKey] || 0) + increment;
            stats.lastGame = new Date().toISOString();
            
        } catch (error) {
            console.error('Error updating player stats:', error);
        }
    }

    getActiveGame(chatId) {
        return this.activeGames.get(chatId) || null;
    }

    getAllActiveGames() {
        return Array.from(this.activeGames.entries()).map(([chatId, game]) => ({
            chatId,
            ...game
        }));
    }

    getPlayerStats(playerId) {
        return this.playerStats.get(playerId) || null;
    }

    getGlobalStats() {
        try {
            const totalGames = this.gameHistory.length;
            const activeGames = this.activeGames.size;
            
            // Count by game type
            const gameTypeCount = {};
            this.gameHistory.forEach(game => {
                gameTypeCount[game.gameType] = (gameTypeCount[game.gameType] || 0) + 1;
            });
            
            // Get top players
            const playerStatsList = Array.from(this.playerStats.values())
                .sort((a, b) => b.gamesCompleted - a.gamesCompleted)
                .slice(0, 10);
            
            // Recent activity (last 7 days)
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const recentGames = this.gameHistory.filter(game => 
                new Date(game.endedAt) > weekAgo
            ).length;
            
            return {
                totalGames,
                activeGames,
                recentGames,
                ...gameTypeCount,
                topPlayers: playerStatsList.map(stats => ({
                    id: stats.playerId,
                    games: stats.gamesCompleted,
                    wins: stats.gamesWon,
                    winRate: stats.gamesCompleted > 0 ? 
                        ((stats.gamesWon / stats.gamesCompleted) * 100).toFixed(1) + '%' : '0%'
                }))
            };
            
        } catch (error) {
            console.error('Error getting global stats:', error);
            return {
                totalGames: 0,
                activeGames: 0,
                recentGames: 0,
                topPlayers: []
            };
        }
    }

    getGameHistory(limit = 50) {
        return this.gameHistory
            .slice(-limit)
            .reverse(); // Most recent first
    }

    async endAllGames() {
        try {
            const activeGameIds = Array.from(this.activeGames.keys());
            
            for (const chatId of activeGameIds) {
                await this.endGame(chatId, { gameStatus: 'aborted', reason: 'system_shutdown' });
            }
            
            console.log(`🎮 Ended ${activeGameIds.length} active games due to shutdown`);
            
        } catch (error) {
            console.error('Error ending all games:', error);
        }
    }

    // Cleanup old game history
    async cleanupOldGames(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
        try {
            const cutoffDate = new Date(Date.now() - maxAge);
            const originalCount = this.gameHistory.length;
            
            this.gameHistory = this.gameHistory.filter(game => 
                new Date(game.endedAt) > cutoffDate
            );
            
            const removedCount = originalCount - this.gameHistory.length;
            
            if (removedCount > 0) {
                await this.saveGameData();
                console.log(`🧹 Cleaned up ${removedCount} old game records`);
            }
            
            return removedCount;
            
        } catch (error) {
            console.error('Error cleaning up old games:', error);
            return 0;
        }
    }
}

module.exports = { GameStates };
