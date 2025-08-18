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
- All core functionality tested and operational

### Current Working Features:
- **Core Commands**: help, info, status, settings, allow, disallow, reload, env
- **Ping Plugin**: ping, pinginfo (working for allowed users)
- **Games Plugin**: tictactoe, wordguess, endgame, gameinfo, gamestats
- **Admin Tools**: systeminfo, plugins, users, permissions, logs, cleanup, backup
- **Anti-Delete**: recover, deleted, antilog
- **Media Tools**: convert, upscale, analyze, mediainfo, compress, extract
- **Access Control**: Proper owner detection, command permissions, game participation
- **Hot Reload**: Automatic plugin reloading on file changes
- **Message Archival**: Complete conversation and media storage system