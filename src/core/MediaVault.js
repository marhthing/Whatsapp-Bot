const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');

class MediaVault {
    constructor() {
        this.mediaPath = path.join(process.cwd(), 'data', 'media');
        this.metadataCache = new Map();
        this.isInitialized = false;
        
        // Get max file size from config or environment
        const configSize = require('../../config/default.json').media?.maxFileSize;
        const envSize = process.env.MAX_MEDIA_SIZE;
        
        if (configSize && typeof configSize === 'number') {
            this.maxFileSize = configSize;
        } else if (envSize) {
            this.maxFileSize = this.parseSize(envSize);
        } else {
            this.maxFileSize = this.parseSize('50MB');
        }
    }

    async initialize() {
        try {
            console.log('🔧 Initializing media vault...');

            // Create media directories
            const mediaTypes = ['images', 'videos', 'audio', 'documents', 'stickers'];
            
            for (const type of mediaTypes) {
                await fs.ensureDir(path.join(this.mediaPath, type));
            }

            // Load metadata cache
            await this.loadMetadataCache();

            this.isInitialized = true;
            console.log('✅ Media vault initialized');

        } catch (error) {
            console.error('❌ Failed to initialize media vault:', error);
            throw error;
        }
    }

    async loadMetadataCache() {
        const metadataPath = path.join(this.mediaPath, 'metadata.json');
        
        try {
            if (await fs.pathExists(metadataPath)) {
                const metadata = await fs.readJson(metadataPath);
                
                for (const [key, value] of Object.entries(metadata)) {
                    this.metadataCache.set(key, value);
                }
            }
        } catch (error) {
            console.error('⚠️ Failed to load media metadata, starting fresh:', error);
        }
    }

    async saveMetadataCache() {
        const metadataPath = path.join(this.mediaPath, 'metadata.json');
        
        try {
            const metadata = Object.fromEntries(this.metadataCache);
            await fs.writeJson(metadataPath, metadata, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save media metadata:', error);
        }
    }

    async storeMedia(mediaData, message) {
        if (!this.isInitialized) {
            throw new Error('Media vault not initialized');
        }

        try {
            // Check file size
            if (mediaData.data.length > this.maxFileSize) {
                throw new Error(`File too large: ${this.formatSize(mediaData.data.length)} > ${process.env.MAX_MEDIA_SIZE}`);
            }

            // Generate file hash for deduplication
            const hash = crypto.createHash('sha256').update(mediaData.data).digest('hex');
            
            // Check if file already exists
            const existingFile = this.findExistingFile(hash);
            if (existingFile) {
                console.log('📁 Media file already exists, updating metadata only');
                await this.updateFileMetadata(existingFile.id, message);
                return existingFile;
            }

            // Determine file category and extension
            const category = this.getMediaCategory(mediaData.mimetype);
            const extension = this.getFileExtension(mediaData.mimetype, mediaData.filename);
            
            // Generate unique filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${timestamp}_${hash.substring(0, 8)}.${extension}`;
            const filePath = path.join(this.mediaPath, category, filename);

            // Save file
            await fs.writeFile(filePath, mediaData.data);

            // Create metadata
            const fileMetadata = {
                id: hash,
                filename: filename,
                originalName: mediaData.filename || `file.${extension}`,
                category: category,
                mimetype: mediaData.mimetype,
                size: mediaData.data.length,
                hash: hash,
                path: filePath,
                relativePath: path.join(category, filename),
                createdAt: new Date().toISOString(),
                messages: [this.extractMessageInfo(message)]
            };

            // Store metadata
            this.metadataCache.set(hash, fileMetadata);
            await this.saveMetadataCache();

            console.log(`💾 Stored ${category} file: ${filename} (${this.formatSize(mediaData.data.length)})`);
            
            return fileMetadata;

        } catch (error) {
            console.error('❌ Failed to store media:', error);
            throw error;
        }
    }

    findExistingFile(hash) {
        return this.metadataCache.get(hash) || null;
    }

    async updateFileMetadata(fileId, message) {
        const fileMetadata = this.metadataCache.get(fileId);
        if (fileMetadata) {
            fileMetadata.messages.push(this.extractMessageInfo(message));
            await this.saveMetadataCache();
        }
    }

    extractMessageInfo(message) {
        return {
            messageId: message.key?.id || 'unknown',
            chatId: message.key?.remoteJid || 'unknown',
            author: message.key?.participant || message.key?.remoteJid || 'unknown',
            timestamp: message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now(),
            caption: message.message?.imageMessage?.caption || 
                    message.message?.videoMessage?.caption || 
                    message.message?.documentMessage?.caption || null
        };
    }

    getMediaCategory(mimetype) {
        if (!mimetype) return 'documents';

        if (mimetype.startsWith('image/')) {
            return mimetype === 'image/webp' ? 'stickers' : 'images';
        }
        if (mimetype.startsWith('video/')) return 'videos';
        if (mimetype.startsWith('audio/')) return 'audio';
        
        return 'documents';
    }

    getFileExtension(mimetype, filename) {
        // Try to get extension from filename first
        if (filename) {
            const extFromFilename = path.extname(filename).substring(1);
            if (extFromFilename) return extFromFilename;
        }

        // Get extension from mimetype
        const extFromMime = mime.extension(mimetype);
        return extFromMime || 'bin';
    }

    async getMediaFile(fileId) {
        const metadata = this.metadataCache.get(fileId);
        if (!metadata) {
            return null;
        }

        try {
            const data = await fs.readFile(metadata.path);
            return {
                data: data,
                metadata: metadata
            };
        } catch (error) {
            console.error(`❌ Failed to read media file ${fileId}:`, error);
            return null;
        }
    }

    async deleteMediaFile(fileId) {
        const metadata = this.metadataCache.get(fileId);
        if (!metadata) {
            return false;
        }

        try {
            await fs.unlink(metadata.path);
            this.metadataCache.delete(fileId);
            await this.saveMetadataCache();
            
            console.log(`🗑️ Deleted media file: ${metadata.filename}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to delete media file ${fileId}:`, error);
            return false;
        }
    }

    searchMedia(criteria) {
        const {
            category,
            mimetype,
            chatId,
            author,
            dateFrom,
            dateTo,
            minSize,
            maxSize,
            limit = 50
        } = criteria || {};

        const results = [];
        const startTime = dateFrom ? new Date(dateFrom).getTime() : 0;
        const endTime = dateTo ? new Date(dateTo).getTime() : Date.now();

        for (const metadata of this.metadataCache.values()) {
            // Apply filters
            if (category && metadata.category !== category) continue;
            if (mimetype && metadata.mimetype !== mimetype) continue;
            if (minSize && metadata.size < minSize) continue;
            if (maxSize && metadata.size > maxSize) continue;

            // Check message-specific criteria
            const hasMatchingMessage = metadata.messages.some(msg => {
                if (chatId && msg.chatId !== chatId) return false;
                if (author && msg.author !== author) return false;
                if (msg.timestamp < startTime || msg.timestamp > endTime) return false;
                return true;
            });

            if ((chatId || author || dateFrom || dateTo) && !hasMatchingMessage) {
                continue;
            }

            results.push(metadata);

            if (results.length >= limit) {
                break;
            }
        }

        return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async getVaultStats() {
        const stats = {
            totalFiles: this.metadataCache.size,
            totalSize: 0,
            byCategory: {},
            byMimetype: {},
            oldestFile: null,
            newestFile: null
        };

        for (const metadata of this.metadataCache.values()) {
            stats.totalSize += metadata.size;
            
            // Count by category
            stats.byCategory[metadata.category] = 
                (stats.byCategory[metadata.category] || 0) + 1;

            // Count by mimetype
            stats.byMimetype[metadata.mimetype] = 
                (stats.byMimetype[metadata.mimetype] || 0) + 1;

            // Track oldest/newest
            const createdAt = new Date(metadata.createdAt);
            if (!stats.oldestFile || createdAt < new Date(stats.oldestFile)) {
                stats.oldestFile = metadata.createdAt;
            }
            if (!stats.newestFile || createdAt > new Date(stats.newestFile)) {
                stats.newestFile = metadata.createdAt;
            }
        }

        return stats;
    }

    async cleanupOrphanedFiles() {
        console.log('🧹 Cleaning up orphaned media files...');
        
        const categories = ['images', 'videos', 'audio', 'documents', 'stickers'];
        let cleanedCount = 0;

        for (const category of categories) {
            const categoryPath = path.join(this.mediaPath, category);
            
            if (await fs.pathExists(categoryPath)) {
                const files = await fs.readdir(categoryPath);
                
                for (const filename of files) {
                    const filePath = path.join(categoryPath, filename);
                    
                    // Check if file is in metadata cache
                    const isTracked = Array.from(this.metadataCache.values())
                        .some(metadata => metadata.filename === filename);

                    if (!isTracked) {
                        await fs.unlink(filePath);
                        cleanedCount++;
                        console.log(`🗑️ Removed orphaned file: ${filename}`);
                    }
                }
            }
        }

        console.log(`✅ Cleaned up ${cleanedCount} orphaned files`);
        return cleanedCount;
    }

    parseSize(sizeStr) {
        // Handle numeric values (already in bytes)
        if (typeof sizeStr === 'number') {
            return sizeStr;
        }
        
        // Handle string representations
        if (typeof sizeStr === 'string') {
            // Check if it's a plain number string
            const numericValue = parseInt(sizeStr);
            if (!isNaN(numericValue) && sizeStr === numericValue.toString()) {
                return numericValue;
            }
            
            // Parse formatted size strings like "50MB"
            const units = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
            const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
            
            if (!match) {
                throw new Error(`Invalid size format: ${sizeStr}`);
            }

            const value = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            
            return value * units[unit];
        }
        
        throw new Error(`Invalid size format: ${sizeStr}`);
    }

    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    getMetadataByPath(relativePath) {
        for (const metadata of this.metadataCache.values()) {
            if (metadata.relativePath === relativePath) {
                return metadata;
            }
        }
        return null;
    }

    async exportMetadata(outputPath) {
        const exportData = {
            exportedAt: new Date().toISOString(),
            totalFiles: this.metadataCache.size,
            files: Array.from(this.metadataCache.values())
        };

        await fs.writeJson(outputPath, exportData, { spaces: 2 });
        console.log(`📤 Exported media metadata to: ${outputPath}`);
    }
}

module.exports = MediaVault;
