#!/usr/bin/env node

/**
 * Test WhatsApp Authentication
 * Quick test to verify QR code and pairing code functionality
 */

// Set up environment for testing
process.env.WHATSAPP_SESSION_ID = 'test';
process.env.SESSION_DIR = './sessions/test';
process.env.AUTH_METHOD = '1'; // QR Code
process.env.PHONE_NUMBER = '';

const fs = require('fs').promises;
const path = require('path');

async function setupTestSession() {
    const sessionDir = './sessions/test';
    
    // Create session directory
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'auth'), { recursive: true });
    
    // Create basic session config
    const sessionConfig = {
        id: 'test',
        phoneNumber: null,
        ownerJid: null,
        authMethod: '1',
        authStatus: 'pending',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };
    
    await fs.writeFile(
        path.join(sessionDir, 'config.json'),
        JSON.stringify(sessionConfig, null, 2)
    );
    
    console.log('✅ Test session created');
}

async function testAuthentication() {
    try {
        console.log('🧪 Testing WhatsApp Authentication');
        console.log('📱 QR Code method selected');
        
        // Set up test session
        await setupTestSession();
        
        console.log('🔧 Starting bot authentication...');
        
        // Import and start the bot
        const WhatsAppBot = require('./src/index.js');
        
    } catch (error) {
        console.error('❌ Authentication test failed:', error.message);
        console.log('\n🔍 Error details:', error);
    }
}

// Run the test
testAuthentication();