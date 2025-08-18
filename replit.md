# MATDEV Bot

## Overview
MATDEV is a WhatsApp bot designed to operate through the owner's WhatsApp number with strict access control. It features a modular architecture with a hot-reload plugin system, comprehensive message archival, and intelligent command processing. Built as a personal assistant, MATDEV primarily responds only to the bot owner while maintaining selective interaction capabilities for specific scenarios like games or explicitly allowed commands. The project's ambition is to provide a secure, efficient, and highly customizable personal bot experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture Pattern
The system follows a **personal assistant architecture** with multi-session support and hot-reload capabilities:
- **Single Owner Model**: Bot responds primarily to the owner's commands, with selective exceptions.
- **Session-Based Design**: Multiple WhatsApp sessions can be managed through a unified starter interface.
- **Plugin Architecture**: Modular plugin system with hot-reload functionality for adding features without restart.
- **Event-Driven Processing**: Message processing flows through ownership validation, game state checks, and command authorization.

### Access Control System
- **Owner-First Design**: All commands processed for bot owner by default.
- **Selective Interaction**: Non-owners can interact only during active games or with explicitly allowed commands.
- **Command Authorization**: `.allow` system enables temporary command access for specific users.
- **Game State Management**: Active games allow valid inputs from all participants.

### Message Processing Flow
1. **Ownership Validation**: Check if sender is bot owner.
2. **Game State Check**: Verify if active game allows user interaction.
3. **Command Authorization**: Validate allowed commands for non-owners.
4. **Loading Feedback**: Visual reaction system with emoji indicators.

### Plugin System Design
- **Fully Self-Contained**: Each plugin folder contains `index.js` (main class), `plugin.json` (config), and `README.md` (docs).
- **Hot-Reload Capability**: Automatic detection and reloading of plugin changes.
- **Unified Interface**: All plugins implement `executeCommand` method with a standard context.

### Data Storage Architecture
- **Message Archival**: Complete conversation and media storage.
- **Session Management**: Isolated session data in dedicated directories.
- **Configuration System**: Centralized configuration management for bot behavior.

### User Interface Design
- **CLI Startup Interface**: Interactive session selection with colored console output.
- **Visual Feedback System**: Loading reactions and status indicators in WhatsApp.
- **Multi-Session Support**: Choose from available sessions at startup.

### Implemented Layers
- **Utility Layer (`src/utils/`)**: Includes modules for constants, JID management, message processing, access utilities, and game utilities.
- **Services Layer (`src/services/`)**: Provides services for storage, access control, game session management, environment variables, allowed commands, reaction management, media management, and message querying.
- **Configuration System (`config/`)**: Contains `default.json` for general bot configuration and `plugins.json` for plugin-specific settings.

## External Dependencies
- **@whiskeysockets/baileys**: For WhatsApp Web client integration (migrated from whatsapp-web.js).
- **fs-extra**: For enhanced file system operations.
- **qrcode-terminal**: For displaying QR codes during authentication.
- **express & socket.io**: For optional web interface support.
- **readline**: For interactive CLI session management.
- **pino**: For structured logging.
- **chokidar**: For file watching in hot-reload system.

## Migration Status
**✅ COMPLETED** - Successfully migrated from Replit Agent to standard Replit environment (August 18, 2025)
**✅ UPDATED** - Fixed critical anti-delete media handling issues (August 18, 2025)  
**✅ FIXED** - Resolved media storage and retrieval issues during bulk deletions (August 18, 2025)
**✅ ENHANCED** - Improved anti-view-once detection and handling (August 18, 2025)
**✅ ENHANCED** - Separated message and media storage for channels, status, and broadcast content (August 18, 2025)

### Migration Changes Made:
- Fixed missing `getClientInfo()` method in BotClient for .info command
- Fixed message formatting issues with proper Baileys integration
- Enhanced access control system with better debugging and command permission logic
- Fixed `.allow` and `.disallow` commands to properly target chat users instead of command sender
- Added `getAccessController()` method to BotClient for plugin access
- Fixed allowed commands data loading from JSON to Map conversion
- Added detailed logging for command permission debugging
- Verified all 6 plugins are loading and working correctly
- Bot successfully connects via QR code or pairing code authentication
- Access control system properly denies non-owner access and manages allowed commands
- **CONFIRMED**: Allowed users can now successfully execute permitted commands
- **UPDATED (Latest - August 18, 2025)**: Enhanced anti-delete system with improved media handling and tagging
  - Fixed integration with MessageArchiver using proper `getMessageById()` method
  - Implemented direct media file retrieval from storage using archived media paths
  - Now forwards original deleted content (text/media) with proper contextInfo tagging structure
  - Skips placeholder messages - only sends content if original is available
  - Media messages are properly forwarded with correct sender tagging for WhatsApp quote structure
  - No fallback notifications - clean forwarding of actual deleted content only
  - Fixed media buffer retrieval errors for stickers and other media types
  - **FIXED MEDIA DEDUPLICATION ISSUE**: Removed file deduplication to ensure each message gets unique media files
  - Enhanced media storage with message ID-based filename generation for proper uniqueness
  - Added proper media path linking between archived messages and stored media files
  - Fixed "Invalid message content type" errors in anti-delete forwarding system
  - **PERFORMANCE OPTIMIZATIONS**: Implemented parallel processing for message archiving and media storage
  - Enhanced bulk deletion handling with batch processing (5 deletions at a time) to prevent lag
  - Added proper caption extraction from images/videos that forwards with deleted media
  - Optimized archive queue processing from 1 second to 500ms intervals for faster response
  - Increased batch size from 10 to 20 messages for more efficient archiving
  - Added download timeouts (10 seconds) to prevent hanging media downloads
  - Fixed directory naming inconsistency ("groups" vs "group") in message archiver
  - **MEDIA TYPE CLASSIFICATION FIXES**: Enhanced sticker vs image detection with priority-based processing
  - Fixed media category determination to properly distinguish stickers from regular images
  - Improved message content extraction with better fallback handling for incomplete messages
  - Enhanced media archiving to include stickers in hasMedia detection
  - Reduced "no extractable content" warnings with better system message handling
  - Added support for broadcast/newsletter message types to prevent archiving errors
  - **DELETION QUEUE SYSTEM**: Implemented calm processing for rapid bulk deletions to prevent media type confusion
  - Added sequential deletion processing with mandatory delays to avoid race conditions
  - Enhanced media type preservation using original archived message type instead of runtime detection
  - Reduced bulk deletion processing to 2 items per batch with 300ms intervals and 200ms delays between items
  - Fixed sticker/image confusion during fast "delete for all" operations by using preserved type information
- **CRITICAL FIX (Latest - August 18, 2025)**: Resolved media ID mismatch and race condition issues
  - Enhanced unique media filename generation with nano-timestamp and randomness to prevent collisions
  - Implemented proper media-to-message linking using MessageVault.getMediaByMessageId() method
  - Fixed "Could not find message to update media path" errors with advanced retry mechanism and delayed updates
  - Removed redundant media path updates to prevent race conditions during archiving
  - Enhanced MediaVault with dedicated message-based media retrieval for anti-delete system
  - Anti-delete now properly retrieves and forwards the exact deleted media without confusion
  - **MEDIA VALIDATION IMPROVEMENTS**: Enhanced media key validation to handle edge cases
    - Added support for view-once messages and quoted message media
    - Improved validation to check both mediaKey and URL/directPath availability
    - Enhanced logging for debugging "no valid media key" warnings
    - Implemented progressive retry mechanism with increasing delays (250ms to 3s)
  - **ENHANCED ARCHIVE SEARCH**: Improved message archiving system with comprehensive search
    - Extended media path update search from 3 days to 7 days for better coverage
    - Added comprehensive archive search across all message files when needed
    - Implemented fallback search mechanism to locate messages in any archive file
    - Fixed remaining "Could not find message to update media path" errors
- **NEW FEATURE (Latest - August 18, 2025)**: Anti-View-Once Plugin Implementation
  - **Automatic View-Once Capture**: Detects and downloads view-once images and videos automatically
  - **Command Recovery**: Use `.vv` to retrieve the latest captured view-once message
  - **Auto-Forward Feature**: Set default JID with `.vv <jid>` to automatically forward all captures
  - **Dedicated Storage**: View-once media stored in separate `data/media/view-once/` folder for easy tracking
  - **Smart Integration**: Integrates with MediaVault system with category override for view-once content
  - **Memory Management**: Keeps last 10 view-once messages in memory for quick access
  - **Owner-Only Access**: Secure access control - only bot owner can use view-once recovery
  - **Enhanced Debugging**: Added comprehensive logging for view-once detection and forwarding
  - **ENHANCED (Latest)**: Improved detection for viewOnceV2 format and messages with viewOnce flags
  - **ENHANCED (Latest)**: Better download handling with timeout protection and fallback methods
  - **ENHANCED (Latest)**: Added detailed debugging output for troubleshooting view-once issues
- **UPDATED (Latest - August 18, 2025)**: Enhanced anti-delete system to ignore view-once messages
  - Anti-delete now skips view-once message deletions to avoid forwarding "[System Event]" messages
  - View-once messages are handled exclusively by the anti-view-once plugin
  - Reduced noise in anti-delete notifications by filtering out view-once content
- **CRITICAL SECURITY FIX (Latest - August 18, 2025)**: Fixed unauthorized access vulnerability
  - Fixed critical bug where ANY user with @lid format JID was granted owner access
  - Now properly validates phone number match for @lid format before granting access
  - Enhanced access control to prevent unauthorized command execution
- All core functionality tested and operational

### Current Working Features:
- **Core Commands**: help, info, status, settings, allow, disallow, reload, env
- **Ping Plugin**: ping, pinginfo (working for allowed users)
- **Games Plugin**: tictactoe, wordguess, endgame, gameinfo, gamestats
- **Admin Tools**: systeminfo, plugins, users, permissions, logs, cleanup, backup
- **Anti-Delete**: recover, deleted, antilog - **FULLY FUNCTIONAL**
  - Automatically captures all messages and media
  - Detects message deletions in real-time
  - Forwards deleted content to bot owner with sender info, timestamps, and content
  - Provides recovery commands to restore deleted messages
- **Anti-View-Once**: vv - **FULLY FUNCTIONAL**
  - Automatically captures view-once messages (images and videos)
  - Command `.vv` to retrieve latest captured view-once message
  - Command `.vv <jid>` to set auto-forward destination
  - Integrates with existing media storage system
  - Maintains capture history for recovery
- **Media Tools**: convert, upscale, analyze, mediainfo, compress, extract
- **Access Control**: Proper owner detection, command permissions, game participation
- **Hot Reload**: Automatic plugin reloading on file changes
- **Message Archival**: Complete conversation and media storage system