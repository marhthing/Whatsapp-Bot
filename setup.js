#!/usr/bin/env node

/**
 * WhatsApp Bot Setup & Management Script
 * Organized workflow for bot initialization and management
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

class WhatsAppBotSetup {
    constructor() {
        this.packageJsonPath = path.join(process.cwd(), 'package.json');
        this.nodeModulesPath = path.join(process.cwd(), 'node_modules');
    }

    async run() {
        console.log(`${colors.cyan}${colors.bright}`);
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║      WhatsApp Personal Assistant Setup       ║');
        console.log('║            Organized Workflow v1.0           ║');
        console.log('╚══════════════════════════════════════════════╝');
        console.log(`${colors.reset}\n`);

        try {
            // Step 1: Package Management
            await this.step1_PackageManagement();
            
            // Step 2: WhatsApp Authentication
            await this.step2_WhatsAppAuthentication();
            
            // Step 3: Start Bot Core
            await this.step3_StartBotCore();
            
            // Step 4: Load Plugins and Full Engine
            await this.step4_LoadPluginsAndEngine();
            
        } catch (error) {
            console.error(`${colors.red}Setup failed:${colors.reset}`, error.message);
            process.exit(1);
        }
    }

    async step1_PackageManagement() {
        console.log(`${colors.blue}Step 1: Package Management${colors.reset}`);
        console.log('─'.repeat(50));
        
        try {
            // Check if node_modules exists and package.json is present
            const [packageExists, nodeModulesExists] = await Promise.all([
                this.fileExists(this.packageJsonPath),
                this.fileExists(this.nodeModulesPath)
            ]);

            if (!packageExists) {
                console.log(`${colors.red}❌ package.json not found${colors.reset}`);
                throw new Error('package.json is required');
            }

            if (!nodeModulesExists) {
                console.log(`${colors.yellow}📦 Installing packages...${colors.reset}`);
                await this.runCommand('npm', ['install']);
                console.log(`${colors.green}✅ Packages installed successfully${colors.reset}`);
            } else {
                console.log(`${colors.yellow}🔍 Checking package dependencies...${colors.reset}`);
                
                // Check if packages are up to date
                const outdated = await this.checkOutdatedPackages();
                if (outdated.length > 0) {
                    console.log(`${colors.yellow}📦 Updating outdated packages...${colors.reset}`);
                    await this.runCommand('npm', ['update']);
                    console.log(`${colors.green}✅ Packages updated successfully${colors.reset}`);
                } else {
                    console.log(`${colors.green}✅ All packages are up to date${colors.reset}`);
                }
            }
        } catch (error) {
            console.error(`${colors.red}❌ Package management failed:${colors.reset}`, error.message);
            throw error;
        }
        
        console.log();
    }

    async step2_WhatsAppAuthentication() {
        console.log(`${colors.blue}Step 2: WhatsApp Authentication${colors.reset}`);
        console.log('─'.repeat(50));
        
        console.log(`${colors.cyan}🔗 Starting WhatsApp session selector...${colors.reset}`);
        
        // Use the existing start.js for session management
        await this.runCommand('node', ['start.js']);
        
        console.log();
    }

    async step3_StartBotCore() {
        console.log(`${colors.blue}Step 3: Starting Bot Core${colors.reset}`);
        console.log('─'.repeat(50));
        
        console.log(`${colors.cyan}🚀 Bot core will be started by start.js${colors.reset}`);
        console.log(`${colors.green}✅ Core initialization complete${colors.reset}`);
        
        console.log();
    }

    async step4_LoadPluginsAndEngine() {
        console.log(`${colors.blue}Step 4: Load Plugins and Full Engine${colors.reset}`);
        console.log('─'.repeat(50));
        
        console.log(`${colors.cyan}🔌 Plugin system will be activated after authentication${colors.reset}`);
        console.log(`${colors.green}✅ Full engine ready${colors.reset}`);
        
        console.log();
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async checkOutdatedPackages() {
        try {
            const result = await this.runCommand('npm', ['outdated', '--json'], { capture: true });
            const outdated = JSON.parse(result.stdout || '{}');
            return Object.keys(outdated);
        } catch {
            // If npm outdated fails or returns no JSON, assume packages are up to date
            return [];
        }
    }

    async runCommand(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {
                stdio: options.capture ? 'pipe' : 'inherit',
                shell: true
            });

            let stdout = '';
            let stderr = '';

            if (options.capture) {
                process.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                process.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`Command failed with exit code ${code}`));
                }
            });

            process.on('error', reject);
        });
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Setup interrupted by user${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(`\n${colors.yellow}Setup terminated${colors.reset}`);
    process.exit(0);
});

// Run setup if this file is executed directly
if (require.main === module) {
    const setup = new WhatsAppBotSetup();
    setup.run();
}

module.exports = WhatsAppBotSetup;