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

🚀 **MIGRATION COMPLETED** (August 18, 2025): Successfully migrated from Replit Agent to standard Replit environment. All components verified and operational.

🚀 **READY FOR USE**: The WhatsApp bot is fully implemented and ready for authentication. All components are in place for a production-ready personal assistant bot.

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