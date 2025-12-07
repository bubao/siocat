#!/usr/bin/env node

const { Command } = require('commander');
const SioCatClient = require('../lib/client');
const SioCatTUI = require('../lib/tui');
const chalk = require('chalk');

// 检查终端颜色支持
const supportsColor = chalk.supportsColor;
if (!supportsColor) {
  // 如果终端不支持颜色，使用chalk的level 0
  chalk.level = 0;
}

const program = new Command();

program
  .name('siocat')
  .description('A human-friendly TUI client for Socket.IO')
  .version('1.0.0')
  .argument('<url>', 'Socket.IO server URL')
  .option('-n, --namespace <namespace>', 'Socket.IO namespace (default: "/")')
  .option('-p, --protocol <version>', 'Socket.IO protocol version')
  .option('-H, --header <header:value>', 'Set HTTP header', (val, prev = {}) => {
    const [header, value] = val.split(':');
    if (header && value) {
      prev[header.trim()] = value.trim();
    }
    return prev;
  })
  .option('-o, --origin <origin>', 'Set Origin header')
  .option('--no-tui', 'Disable TUI mode and use simple console interface')
  .action(async (url, options) => {
    try {
      // Validate URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(chalk.red('Error: URL must start with http:// or https://'));
        process.exit(1);
      }

      // Setup headers
      const headers = options.header || {};
      if (options.origin) {
        headers.Origin = options.origin;
      }

      // Create client
      const client = new SioCatClient({
        url: url,
        namespace: options.namespace || '/',
        protocolVersion: options.protocol ? parseInt(options.protocol) : undefined,
        headers: headers
      });

      let tui;
      if (options.tui) {
        // Use blessed TUI
        tui = new SioCatTUI(client);
        tui.init();
        tui.updateStatus(`Connecting to ${url}${options.namespace || '/'}...`);
      } else {
        // Use simple console interface
        console.log('=== siocat - Socket.IO Client ===');
        console.log(`Connecting to ${url}${options.namespace || '/'}...`);
      }

      // Connect to server FIRST
      await client.connect();
      
      // Setup client event handlers AFTER connection
      client.onEvent('connect', () => {
        if (options.tui) {
          tui.updateStatus(`Connected to ${url}${options.namespace || '/'}`);
          tui.addMessage('Connected to server', 'system');
        } else {
          console.log(chalk.green('Connected to server'));
        }
      });
      
      client.onEvent('disconnect', (reason) => {
        if (options.tui) {
          tui.updateStatus(`Disconnected: ${reason}`);
          tui.addMessage(`Disconnected: ${reason}`, 'system');
        } else {
          console.log(chalk.yellow(`Disconnected: ${reason}`));
        }
      });
      
      client.onEvent('connect_error', (error) => {
        if (options.tui) {
          tui.updateStatus(`Connection error: ${error.message}`);
          tui.addMessage(`Connection error: ${error.message}`, 'error');
        } else {
          console.log(chalk.red(`Connection error: ${error.message}`));
        }
      });
      
      // Listen for common events and display them
      const commonEvents = ['welcome', 'message', 'newMessage', 'joinedRoom', 'messageSent', 'customEvent'];
      commonEvents.forEach(eventType => {
        client.onEvent(eventType, (data) => {
          if (options.tui) {
            tui.addMessage(`${eventType}: ${JSON.stringify(data)}`, 'received');
          } else {
            console.log(chalk.cyan(`< ${eventType}: ${JSON.stringify(data)}`));
          }
        });
      });
      
      // If not using TUI, setup readline interface
      if (!options.tui) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        console.log('\nAvailable commands:');
        console.log('  emit <event> [data]        - Send an event with optional data');
        console.log('  on <event>                 - Listen for an event');
        console.log('  off <event>                - Stop listening for an event');
        console.log('  offAll                     - Stop listening for all events');
        console.log('  help                       - Show this help message');
        console.log('  Ctrl+C                     - Exit siocat\n');
        
        rl.setPrompt('> ');
        rl.prompt();
        
        // Store event listeners for removal
        const eventListeners = new Map();
        
        rl.on('line', (input) => {
          if (input && input.trim() !== '') {
            console.log(chalk.green(`> ${input}`));
            
            // Parse command
            const parts = input.trim().split(' ');
            const command = parts[0].toLowerCase();
            
            switch (command) {
              case 'emit':
                handleEmit(client, parts.slice(1));
                break;
              case 'on':
                handleOn(client, parts.slice(1), eventListeners);
                break;
              case 'off':
                handleOff(client, parts.slice(1), eventListeners);
                break;
              case 'offall':
                handleOffAll(client, eventListeners);
                break;
              case 'help':
                showHelp();
                break;
              default:
                console.log(chalk.red(`Unknown command: ${command}. Type 'help' for available commands.`));
            }
          }
          
          rl.prompt();
        });
        
        rl.on('close', () => {
          client.disconnect();
          console.log('\nGoodbye!');
          process.exit(0);
        });
      }
      
    } catch (error) {
      // Handle connection errors gracefully
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function to handle emit command
function handleEmit(client, args) {
  if (args.length < 1) {
    console.log(chalk.red('Usage: emit <event> [data]'));
    return;
  }

  const event = args[0];
  let data = null;
  
  try {
    if (args.length > 1) {
      // Join remaining args and parse as JSON
      const dataStr = args.slice(1).join(' ');
      data = JSON.parse(dataStr);
    }
  } catch (err) {
    // If JSON parsing fails, treat as string
    data = args.slice(1).join(' ');
  }

  try {
    // Check if client is connected before sending
    if (!client.isConnected()) {
      console.log(chalk.red('Error: Not connected to server. Please check your connection.'));
      return;
    }
    
    client.sendEvent(event, data, (response) => {
      console.log(chalk.cyan(`< ACK: ${JSON.stringify(response)}`));
    });
  } catch (err) {
    console.log(chalk.red(`Error sending event: ${err.message}`));
  }
}

// Helper function to handle on command (listen for event)
function handleOn(client, args, eventListeners) {
  if (args.length < 1) {
    console.log(chalk.red('Usage: on <event>'));
    return;
  }

  const event = args[0];
  
  // Check if already listening for this event
  if (eventListeners.has(event)) {
    console.log(chalk.yellow(`Already listening for event: ${event}`));
    return;
  }

  try {
    // Check if client is connected
    if (!client.isConnected()) {
      console.log(chalk.red('Error: Not connected to server. Please check your connection.'));
      return;
    }
    
    // Add event listener
    const handler = (data) => {
      console.log(chalk.cyan(`< ${event}: ${JSON.stringify(data)}`));
    };
    
    client.onEvent(event, handler);
    eventListeners.set(event, handler);
    console.log(chalk.green(`Now listening for event: ${event}`));
  } catch (err) {
    console.log(chalk.red(`Error adding event listener: ${err.message}`));
  }
}

// Helper function to handle off command (stop listening for event)
function handleOff(client, args, eventListeners) {
  if (args.length < 1) {
    console.log(chalk.red('Usage: off <event>'));
    return;
  }

  const event = args[0];
  
  // Check if listening for this event
  if (!eventListeners.has(event)) {
    console.log(chalk.yellow(`Not listening for event: ${event}`));
    return;
  }

  try {
    // Check if client is connected
    if (!client.isConnected()) {
      console.log(chalk.red('Error: Not connected to server. Please check your connection.'));
      return;
    }
    
    // Remove event listener
    const handler = eventListeners.get(event);
    client.offEvent(event, handler);
    eventListeners.delete(event);
    console.log(chalk.green(`Stopped listening for event: ${event}`));
  } catch (err) {
    console.log(chalk.red(`Error removing event listener: ${err.message}`));
  }
}

// Helper function to handle offAll command (stop listening for all events)
function handleOffAll(client, eventListeners) {
  try {
    // Check if client is connected
    if (!client.isConnected()) {
      console.log(chalk.red('Error: Not connected to server. Please check your connection.'));
      return;
    }
    
    // Remove all event listeners
    for (const [event, handler] of eventListeners) {
      client.offEvent(event, handler);
    }
    
    eventListeners.clear();
    console.log(chalk.green('Stopped listening for all events'));
  } catch (err) {
    console.log(chalk.red(`Error removing event listeners: ${err.message}`));
  }
}

// Helper function to show help
function showHelp() {
  console.log('\nAvailable commands:');
  console.log('  emit <event> [data]        - Send an event with optional data');
  console.log('  on <event>                 - Listen for an event');
  console.log('  off <event>                - Stop listening for an event');
  console.log('  offAll                     - Stop listening for all events');
  console.log('  help                       - Show this help message');
  console.log('  Ctrl+C                     - Exit siocat\n');
}

program.parse();