# WhatsApp Personal Assistant Bot

## Overview

This is a WhatsApp personal assistant bot designed to operate through the owner's WhatsApp number with strict access control. The bot features a modular architecture with hot-reload plugin system, comprehensive message archival, and intelligent command processing. It's built as a personal assistant that primarily responds only to the bot owner while maintaining selective interaction capabilities for specific scenarios like games or explicitly allowed commands.

## Implementation Status

✅ **MIGRATION COMPLETED** (Updated: August 18, 2025)
- **Replit Migration**: Successfully migrated from Replit Agent to standard Replit environment
- **Security Verification**: Confirmed proper client/server separation and secure architecture
- **Package Installation**: All dependencies properly installed and configured
- **Workflow Configuration**: Bot starter and main application workflows configured

✅ **COMPLETED COMPONENTS** (Updated: August 18, 2025)
- **Core Architecture**: Complete personal assistant framework with multi-session support
- **Session Management**: Interactive CLI startup with session selection and creation
- **Utility Libraries**: Full set of utility modules (constants, jidManager, messageUtils, accessUtils, gameUtils)
- **Services Layer**: Complete service implementation (storage, accessControl, gameSessionStore, reactionManager, mediaManager, messageQuery)
- **Configuration System**: Default and plugin configuration files with comprehensive settings
- **Plugin System**: Full plugin architecture with auto-discovery and hot-reload capabilities
- **Access Control**: Owner-first design with selective interaction for games and allowed commands
- **Message Processing**: Event-driven architecture with loading reactions and command authorization
- **Data Storage**: Complete message archival and media vault system

✅ **EXISTING COMPONENTS** (User-provided)
- **Core Components**: BotClient, EnvironmentManager, AccessController, LoadingReaction, SessionManager, EventBus, MessageArchiver, MediaVault, HotReloader, MessageProcessor, StateEngine, PluginDiscovery, PerformanceMonitor
- **Middleware Layer**: Complete middleware system for message capture, access filtering, loading reactions, media download, game state management
- **Plugin Implementations**: Core commands, admin tools, games (tic-tac-toe, word guess), anti-delete, media tools with full functionality

✅ **MIGRATION COMPLETED** (Updated: August 18, 2025)
- **Replit Migration**: Successfully migrated from Replit Agent to standard Replit environment
- **Security Verification**: Confirmed proper client/server separation and secure architecture
- **Package Installation**: All dependencies properly installed and configured
- **Workflow Configuration**: Bot starter and main application workflows configured

🎉 **FULLY OPERATIONAL**: The WhatsApp bot is successfully running and operational! Owner recognition works perfectly, commands are executing correctly, and all core functionality is working. The `.help` command has been tested and works as expected.

✅ **MIGRATION SUCCESS**: Migration from Replit Agent to standard Replit environment is 100% complete and verified working.

## Current Operational Status (August 18, 2025)

✅ **Bot Status**: FULLY FUNCTIONAL - Connected to WhatsApp and operating normally
✅ **Core Systems**: All critical components working (BotClient, MessageProcessor, AccessController, MessageArchiver, MediaVault)
✅ **Plugin Status**: 5/5 plugins operational (core-commands, admin-tools, games, anti-delete, media-tools all working perfectly)
✅ **Message Processing**: Working correctly - archiving messages, processing commands, access control functional
✅ **Media Download**: Enhanced with validation to prevent "empty media key" errors
✅ **Command System**: All core commands (.help, .info, .status, etc.) are working
✅ **Access Control**: Properly restricting access to bot owner only

## Latest Fixes Applied (August 18, 2025)

✅ **Plugin System Complete Fix**: Added missing `get` method to EnvironmentManager class, fixing all plugin initialization errors
✅ **All Plugins Operational**: Fixed anti-delete and media-tools plugins - all 5 plugins now working perfectly
✅ **Command Prefix Fix**: Updated command processing to recognize both COMMAND_PREFIX and PREFIX environment variables
✅ **Outgoing Command Processing**: Fixed bot to process commands from owner's outgoing messages while maintaining access control for incoming messages
✅ **JID Matching Fix**: Resolved owner recognition issue by extracting phone numbers for comparison (handles device ID suffixes like :79)
✅ **Command Execution Fix**: Fixed plugin command handlers to use proper context objects with reply functions
✅ **Storage Management**: Implemented 3-day automatic cleanup for messages and media to prevent storage bloat (runs every 24h with 10-minute startup delay)
✅ **Command System Fully Functional**: All commands (.help, .info, .status, etc.) now responding correctly
✅ **Connection Confirmation**: Bot now sends a welcome message to owner when successfully connected to WhatsApp
✅ **Message Content Saving**: Fixed message body extraction to properly save message content from WhatsApp message structure
✅ **Outgoing Message Archival**: Bot now archives both incoming and outgoing messages for complete conversation history
✅ **Anti-Delete Functionality**: Enhanced with proper controls (.delete on/off/<jid>) and automatic forwarding of deleted messages
✅ **Command Processing Fix**: Fixed access control system to properly extract sender JID from Baileys message structure
✅ **Automatic Media Download**: Implemented comprehensive media downloading for images, videos, audio, documents, stickers, and status updates  
✅ **Media Vault Integration**: All downloaded media is automatically organized and stored in the media vault with proper categorization
✅ **Plugin System Fixes**: Corrected all EnvironmentManager import issues across all plugins (admin-tools, anti-delete, media-tools, core-commands)
✅ **Module Export Fixes**: Fixed constructor and export issues in core-commands plugin components (commands, envCommands, states)
✅ **Message Content Enhancement**: Improved message archival to properly extract and save content from all message types while filtering empty messages
✅ **Media Download Function**: Fixed Baileys downloadMediaMessage implementation to properly handle media downloading and storage

## Recent Updates (August 18, 2025)

✅ **4-Step Organized Workflow**: Implemented structured initialization process:
- Step 1: Package Management (install/update packages if needed)
- Step 2: WhatsApp Authentication (session selection and QR code pairing)
- Step 3: Start Bot Core (initialize all bot components)
- Step 4: Load Plugins and Full Engine (activate plugin system)

✅ **Enhanced Message Archival**: Improved message saving capabilities:
- Archives both incoming and outgoing messages with detailed metadata
- Organizes messages by date in structured folders (individual/groups/status)
- Includes offline message recovery system to catch missed messages during downtime
- Batch processing for efficient archival performance

✅ **Fixed Plugin System**: Corrected plugin manifest validation:
- Updated all plugin manifests to use proper command format (objects with name/description)
- Fixed command validation in PluginDiscovery for proper plugin loading
- Re-enabled plugin auto-discovery with working validation system

✅ **Message Processing Fix**: Resolved message body parsing errors:
- Added null/undefined checks for message.body to prevent crashes
- Improved error handling for status messages and broadcast content
- Enhanced command extraction with proper text validation

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture Pattern
The system follows a **personal assistant architecture** with multi-session support and hot-reload capabilities:

- **Single Owner Model**: Bot responds primarily to the owner's commands, with selective exceptions
- **Session-Based Design**: Multiple WhatsApp sessions can be managed through a unified starter interface
- **Plugin Architecture**: Modular plugin system with hot-reload functionality for adding features without restart
- **Event-Driven Processing**: Message processing flows through ownership validation, game state checks, and command authorization

### Access Control System
- **Owner-First Design**: All commands processed for bot owner by default
- **Selective Interaction**: Non-owners can interact only during active games or with explicitly allowed commands
- **Command Authorization**: `.allow` system enables temporary command access for specific users
- **Game State Management**: Active games allow valid inputs from all participants

### Message Processing Flow
1. **Ownership Validation**: Check if sender is bot owner
2. **Game State Check**: Verify if active game allows user interaction
3. **Command Authorization**: Validate allowed commands for non-owners
4. **Loading Feedback**: Visual reaction system with emoji indicators

### Plugin System Design
- **Hot-Reload Capability**: Add/modify plugins without bot restart
- **Modular Structure**: Independent plugin files for different functionalities
- **Event-Based Integration**: Plugins hook into message processing pipeline

### Data Storage Architecture
- **Message Archival**: Complete conversation and media storage
- **Session Management**: Isolated session data in dedicated directories
- **Configuration System**: Centralized config management for bot behavior

### User Interface Design
- **CLI Startup Interface**: Interactive session selection with colored console output
- **Visual Feedback System**: Loading reactions and status indicators in WhatsApp
- **Multi-Session Support**: Choose from available sessions at startup

## Complete Architecture Implementation

### Completed Utility Layer (`src/utils/`)
- **constants.js**: Comprehensive configuration constants, error codes, patterns, and system limits
- **jidManager.js**: WhatsApp JID validation, normalization, and owner detection with caching
- **messageUtils.js**: Message parsing, formatting, command processing, and content sanitization
- **accessUtils.js**: Permission checking, access level management, and command authorization
- **gameUtils.js**: Game session management, state tracking, and player statistics

### Completed Services Layer (`src/services/`)
- **storage.js**: Data persistence with caching and namespace management (EXISTING)
- **accessControl.js**: Owner/Game/Allow permission system (EXISTING)
- **gameSessionStore.js**: Active game session management and player stats (EXISTING)
- **environmentService.js**: Dual .env system management (EXISTING)
- **allowedCommands.js**: Per-user command permission store (EXISTING)
- **reactionManager.js**: Loading emoji system with auto-removal and reaction management
- **mediaManager.js**: Complete media download, storage, processing with file organization
- **messageQuery.js**: Advanced message search and retrieval with indexing and caching

### Configuration System (`config/`)
- **default.json**: Comprehensive bot configuration with feature flags, limits, and system settings
- **plugins.json**: Plugin system configuration with security, performance, and command definitions

### External Dependencies (INSTALLED)
- **whatsapp-web.js**: WhatsApp Web client integration
- **fs-extra**: Enhanced file system operations
- **qrcode-terminal**: QR code display for authentication
- **express & socket.io**: Web interface support (optional)
- **readline**: Interactive CLI session management

### Development Status
- **All Core Systems**: Fully implemented and functional
- **Session Management**: Interactive startup with multi-session support
- **Plugin Architecture**: Hot-reload capable with auto-discovery
- **Access Control**: Owner-first with selective interaction modes
- **Data Persistence**: Complete message and media archival
- **Error Handling**: Comprehensive error management throughout