const fs = require('fs-extra');
const path = require('path');
const EnvironmentManager = require('../../core/EnvironmentManager');

class Converter {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.envManager = new EnvironmentManager();
        
        this.tempDir = null;
        this.supportedFormats = {
            image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'],
            video: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'],
            audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
            document: ['pdf', 'doc', 'docx', 'txt', 'rtf']
        };
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.envManager.initialize();
            
            this.tempDir = path.join(
                this.envManager.get('DATA_DIR', './data'),
                'media',
                'temp'
            );
            
            await fs.ensureDir(this.tempDir);
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Error initializing Media Converter:', error);
            throw error;
        }
    }

    async convert(context) {
        try {
            const { args, reply, message } = context;
            
            if (args.length < 1) {
                await reply('❌ Please specify target format\nUsage: .convert <format> [quality]\nExample: .convert png\nSupported: jpg, png, gif, webp, mp4, mp3, pdf');
                return;
            }
            
            const targetFormat = args[0].toLowerCase();
            const quality = args[1] ? parseInt(args[1]) : 80;
            
            // Check if message has media
            if (!message.hasMedia) {
                await reply('❌ Please reply to a message with media or send media with the command');
                return;
            }
            
            await reply('🔄 Converting media, please wait...');
            
            try {
                const media = await message.downloadMedia();
                
                if (!media) {
                    await reply('❌ Failed to download media');
                    return;
                }
                
                const result = await this.processConversion(media, targetFormat, quality);
                
                if (result.success) {
                    await reply(`✅ **Conversion Complete!**\n\n📝 **Original:** ${result.originalFormat}\n🔄 **Converted:** ${result.targetFormat}\n📏 **Size:** ${result.originalSize} → ${result.newSize}\n⏱️ **Time:** ${result.processingTime}ms`);
                    
                    // Send converted media
                    await this.botClient.sendMedia(message.from, result.convertedMedia, {
                        caption: `Converted to ${targetFormat.toUpperCase()}`
                    });
                } else {
                    await reply(`❌ Conversion failed: ${result.error}`);
                }
                
            } catch (error) {
                await reply(`❌ Error during conversion: ${error.message}`);
            }
            
        } catch (error) {
            console.error('Error in convert command:', error);
            await context.reply('❌ Error processing media conversion');
        }
    }

    async compress(context) {
        try {
            const { args, reply, message } = context;
            
            if (!message.hasMedia) {
                await reply('❌ Please reply to a message with media or send media with the command');
                return;
            }
            
            const compressionLevel = args[0] ? parseInt(args[0]) : 50;
            
            if (compressionLevel < 1 || compressionLevel > 99) {
                await reply('❌ Compression level must be between 1-99\nUsage: .compress [level]\nExample: .compress 50');
                return;
            }
            
            await reply('🗜️ Compressing media, please wait...');
            
            try {
                const media = await message.downloadMedia();
                
                if (!media) {
                    await reply('❌ Failed to download media');
                    return;
                }
                
                const result = await this.processCompression(media, compressionLevel);
                
                if (result.success) {
                    const reductionPercent = ((result.originalSize - result.newSize) / result.originalSize * 100).toFixed(1);
                    
                    await reply(`✅ **Compression Complete!**\n\n📏 **Original:** ${this.formatBytes(result.originalSize)}\n🗜️ **Compressed:** ${this.formatBytes(result.newSize)}\n📉 **Reduction:** ${reductionPercent}%\n⚙️ **Level:** ${compressionLevel}%\n⏱️ **Time:** ${result.processingTime}ms`);
                    
                    // Send compressed media
                    await this.botClient.sendMedia(message.from, result.compressedMedia, {
                        caption: `Compressed (${reductionPercent}% reduction)`
                    });
                } else {
                    await reply(`❌ Compression failed: ${result.error}`);
                }
                
            } catch (error) {
                await reply(`❌ Error during compression: ${error.message}`);
            }
            
        } catch (error) {
            console.error('Error in compress command:', error);
            await context.reply('❌ Error processing media compression');
        }
    }

    async extract(context) {
        try {
            const { args, reply, message } = context;
            
            if (!message.hasMedia) {
                await reply('❌ Please reply to a message with media or send media with the command');
                return;
            }
            
            const extractType = args[0]?.toLowerCase() || 'audio';
            
            if (!['audio', 'frames', 'metadata'].includes(extractType)) {
                await reply('❌ Invalid extraction type\nUsage: .extract <type>\nTypes: audio, frames, metadata\nExample: .extract audio');
                return;
            }
            
            await reply(`🔍 Extracting ${extractType}, please wait...`);
            
            try {
                const media = await message.downloadMedia();
                
                if (!media) {
                    await reply('❌ Failed to download media');
                    return;
                }
                
                const result = await this.processExtraction(media, extractType);
                
                if (result.success) {
                    await reply(`✅ **Extraction Complete!**\n\n📝 **Type:** ${extractType}\n📊 **Results:** ${result.resultCount}\n⏱️ **Time:** ${result.processingTime}ms`);
                    
                    if (result.extractedData) {
                        if (extractType === 'metadata') {
                            await reply(`📋 **Metadata:**\n${result.extractedData}`);
                        } else {
                            // Send extracted media
                            await this.botClient.sendMedia(message.from, result.extractedData, {
                                caption: `Extracted ${extractType}`
                            });
                        }
                    }
                } else {
                    await reply(`❌ Extraction failed: ${result.error}`);
                }
                
            } catch (error) {
                await reply(`❌ Error during extraction: ${error.message}`);
            }
            
        } catch (error) {
            console.error('Error in extract command:', error);
            await context.reply('❌ Error processing media extraction');
        }
    }

    async processConversion(media, targetFormat, quality) {
        const startTime = Date.now();
        
        try {
            // Determine original format
            const originalFormat = this.getFormatFromMimeType(media.mimetype);
            
            if (!originalFormat) {
                return {
                    success: false,
                    error: 'Unsupported media format'
                };
            }
            
            // Check if conversion is needed
            if (originalFormat === targetFormat) {
                return {
                    success: false,
                    error: 'Media is already in the target format'
                };
            }
            
            // Validate target format
            if (!this.isFormatSupported(targetFormat)) {
                return {
                    success: false,
                    error: `Unsupported target format: ${targetFormat}`
                };
            }
            
            const originalSize = Buffer.byteLength(media.data, 'base64');
            
            // For demonstration, we'll simulate conversion
            // In a real implementation, you'd use libraries like ffmpeg, sharp, etc.
            const convertedMedia = await this.simulateConversion(media, targetFormat, quality);
            const newSize = Buffer.byteLength(convertedMedia.data, 'base64');
            
            return {
                success: true,
                originalFormat,
                targetFormat,
                originalSize,
                newSize,
                convertedMedia,
                processingTime: Date.now() - startTime
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async processCompression(media, compressionLevel) {
        const startTime = Date.now();
        
        try {
            const originalSize = Buffer.byteLength(media.data, 'base64');
            
            // Simulate compression based on level
            const compressedMedia = await this.simulateCompression(media, compressionLevel);
            const newSize = Buffer.byteLength(compressedMedia.data, 'base64');
            
            return {
                success: true,
                originalSize,
                newSize,
                compressedMedia,
                processingTime: Date.now() - startTime
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async processExtraction(media, extractType) {
        const startTime = Date.now();
        
        try {
            let result = {};
            
            switch (extractType) {
                case 'audio':
                    result = await this.extractAudio(media);
                    break;
                case 'frames':
                    result = await this.extractFrames(media);
                    break;
                case 'metadata':
                    result = await this.extractMetadata(media);
                    break;
                default:
                    throw new Error('Unsupported extraction type');
            }
            
            return {
                success: true,
                ...result,
                processingTime: Date.now() - startTime
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async simulateConversion(media, targetFormat, quality) {
        // This is a simulation. In a real implementation, you would use:
        // - Sharp for image conversion
        // - FFmpeg for video/audio conversion
        // - Other specialized libraries
        
        const newMimeType = this.getMimeTypeFromFormat(targetFormat);
        
        return {
            mimetype: newMimeType,
            data: media.data, // In reality, this would be the converted data
            filename: `converted.${targetFormat}`
        };
    }

    async simulateCompression(media, compressionLevel) {
        // Simulate compression by reducing data size based on level
        const reductionFactor = compressionLevel / 100;
        const originalData = Buffer.from(media.data, 'base64');
        
        // Simulate compression (in reality, you'd use actual compression algorithms)
        const compressedSize = Math.floor(originalData.length * reductionFactor);
        const compressedData = originalData.slice(0, compressedSize);
        
        return {
            mimetype: media.mimetype,
            data: compressedData.toString('base64'),
            filename: media.filename
        };
    }

    async extractAudio(media) {
        if (!media.mimetype.startsWith('video/')) {
            throw new Error('Audio extraction requires video input');
        }
        
        // Simulate audio extraction
        return {
            resultCount: 1,
            extractedData: {
                mimetype: 'audio/mp3',
                data: media.data, // In reality, this would be extracted audio
                filename: 'extracted_audio.mp3'
            }
        };
    }

    async extractFrames(media) {
        if (!media.mimetype.startsWith('video/')) {
            throw new Error('Frame extraction requires video input');
        }
        
        // Simulate frame extraction
        return {
            resultCount: 5,
            extractedData: {
                mimetype: 'image/jpeg',
                data: media.data, // In reality, this would be extracted frames
                filename: 'extracted_frame.jpg'
            }
        };
    }

    async extractMetadata(media) {
        // Simulate metadata extraction
        const metadata = {
            format: this.getFormatFromMimeType(media.mimetype),
            size: this.formatBytes(Buffer.byteLength(media.data, 'base64')),
            mimetype: media.mimetype,
            filename: media.filename || 'unknown'
        };
        
        if (media.mimetype.startsWith('image/')) {
            metadata.type = 'Image';
            metadata.estimated_dimensions = '1920x1080'; // Simulated
        } else if (media.mimetype.startsWith('video/')) {
            metadata.type = 'Video';
            metadata.estimated_duration = '00:02:30'; // Simulated
            metadata.estimated_fps = '30'; // Simulated
        } else if (media.mimetype.startsWith('audio/')) {
            metadata.type = 'Audio';
            metadata.estimated_duration = '00:03:45'; // Simulated
            metadata.estimated_bitrate = '192kbps'; // Simulated
        }
        
        const metadataText = Object.entries(metadata)
            .map(([key, value]) => `• **${key}:** ${value}`)
            .join('\n');
        
        return {
            resultCount: Object.keys(metadata).length,
            extractedData: metadataText
        };
    }

    getFormatFromMimeType(mimetype) {
        const mimeMap = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/avi': 'avi',
            'video/mov': 'mov',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'audio/ogg': 'ogg'
        };
        
        return mimeMap[mimetype] || null;
    }

    getMimeTypeFromFormat(format) {
        const formatMap = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'avi': 'video/avi',
            'mov': 'video/mov',
            'mp3': 'audio/mp3',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg'
        };
        
        return formatMap[format] || 'application/octet-stream';
    }

    isFormatSupported(format) {
        return Object.values(this.supportedFormats).some(formats => 
            formats.includes(format)
        );
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async shutdown() {
        try {
            // Clean up temporary files
            if (this.tempDir && await fs.pathExists(this.tempDir)) {
                const files = await fs.readdir(this.tempDir);
                for (const file of files) {
                    await fs.remove(path.join(this.tempDir, file));
                }
            }
            
            this.isInitialized = false;
        } catch (error) {
            console.error('Error during Media Converter shutdown:', error);
        }
    }
}

module.exports = { Converter };
