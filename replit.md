# WhatsApp Personal Assistant Bot

## Overview

This is a WhatsApp personal assistant bot designed to operate through the owner's WhatsApp number with strict access control. The bot features a modular architecture with hot-reload plugin system, comprehensive message archival, and intelligent command processing. It's built as a personal assistant that primarily responds only to the bot owner while maintaining selective interaction capabilities for specific scenarios like games or explicitly allowed commands.

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

## External Dependencies

### WhatsApp Integration
- **WhatsApp Web Client**: Core messaging functionality through web interface
- **Session Authentication**: WhatsApp session management and QR code authentication

### Node.js Runtime Environment
- **File System Operations**: Session and data management through fs module
- **Readline Interface**: Interactive CLI session selection
- **Path Management**: Directory structure handling

### Potential Plugin Dependencies
- **Game Logic Libraries**: For interactive games like tic-tac-toe
- **Media Processing**: Image, video, and audio handling capabilities
- **External APIs**: Various third-party services accessible through plugins

### Development Tools
- **Hot-Reload System**: Dynamic plugin loading without restart
- **Console Formatting**: ANSI color codes for enhanced CLI experience
- **Error Handling**: Comprehensive error management and logging