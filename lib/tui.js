const blessed = require('blessed');

class SioCatTUI {
  constructor(client) {
    this.client = client;
    this.screen = null;
    this.messageBox = null;
    this.inputBox = null;
    this.statusBar = null;
    this.eventListeners = new Map(); // Track event listeners for removal
  }

  init() {
    // Create the screen with maximum compatibility
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'siocat - Socket.IO Client',
      useBCE: false,         // Disable BCE to avoid compatibility issues
      dockBorders: false,    // Disable border docking
      fullUnicode: false,
      warnings: false,
      terminal: 'ansi'       // Use basic ANSI terminal type
    });

    // Create status bar
    this.statusBar = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });

    // Create message box
    this.messageBox = blessed.box({
      top: 1,
      left: 0,
      width: '100%',
      height: '100%-3',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: false,      // Disable scrollbar
      border: false,         // Disable border
      style: {
        fg: 'white'
      },
      keys: true,
      vi: false,             // Disable vi key bindings
      mouse: false           // Disable mouse support
    });

    // Create input box
    this.inputBox = blessed.textbox({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      inputOnFocus: true,
      style: {
        fg: 'white',
        bg: 'black'
      },
      border: false,         // Disable border
      keys: true
    });

    // Append elements to screen
    this.screen.append(this.statusBar);
    this.screen.append(this.messageBox);
    this.screen.append(this.inputBox);

    // Focus input box
    this.inputBox.focus();

    // Handle Ctrl+C to exit
    this.screen.key(['C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    // Handle Enter key in input box
    this.inputBox.on('submit', (data) => {
      this.handleInput(data);
      this.inputBox.clearValue();
      this.inputBox.focus();
    });

    // Render the screen
    this.screen.render();
  }

  updateStatus(status) {
    if (this.statusBar) {
      this.statusBar.setContent(status);
      this.screen.render();
    }
  }

  addMessage(message, type = 'info') {
    if (this.messageBox) {
      let formattedMessage = message;
      
      // Use simplest format to avoid terminal issues
      switch (type) {
        case 'sent':
          formattedMessage = '> ' + message;
          break;
        case 'received':
          formattedMessage = '< ' + message;
          break;
        case 'system':
          formattedMessage = '! ' + message;
          break;
        case 'error':
          formattedMessage = '! ' + message;
          break;
      }
      
      this.messageBox.pushLine(formattedMessage);
      this.messageBox.setScrollPerc(100);
      this.screen.render();
    }
  }

  handleInput(data) {
    if (!data || data.trim() === '') {
      return;
    }

    this.addMessage(data, 'sent');
    
    // Parse command
    const parts = data.trim().split(' ');
    const command = parts[0].toLowerCase();
    
    switch (command) {
      case 'emit':
        this.handleEmit(parts.slice(1));
        break;
      case 'on':
        this.handleOn(parts.slice(1));
        break;
      case 'off':
        this.handleOff(parts.slice(1));
        break;
      case 'offall':
        this.handleOffAll();
        break;
      case 'help':
        this.showHelp();
        break;
      default:
        this.addMessage(`Unknown command: ${command}. Type 'help' for available commands.`, 'error');
    }
  }

  handleEmit(args) {
    if (args.length < 1) {
      this.addMessage('Usage: emit <event> [data]', 'error');
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
      if (!this.client.isConnected()) {
        this.addMessage('Error: Not connected to server. Please check your connection.', 'error');
        return;
      }
      
      this.client.sendEvent(event, data, (response) => {
        this.addMessage(`ACK: ${JSON.stringify(response)}`, 'received');
      });
    } catch (err) {
      this.addMessage(`Error sending event: ${err.message}`, 'error');
    }
  }

  handleOn(args) {
    if (args.length < 1) {
      this.addMessage('Usage: on <event>', 'error');
      return;
    }

    const event = args[0];
    
    // Check if already listening for this event
    if (this.eventListeners.has(event)) {
      this.addMessage(`Already listening for event: ${event}`, 'error');
      return;
    }

    try {
      // Check if client is connected
      if (!this.client.isConnected()) {
        this.addMessage('Error: Not connected to server. Please check your connection.', 'error');
        return;
      }
      
      // Add event listener
      const handler = (data) => {
        this.addMessage(`${event}: ${JSON.stringify(data)}`, 'received');
      };
      
      this.client.onEvent(event, handler);
      this.eventListeners.set(event, handler);
      this.addMessage(`Now listening for event: ${event}`, 'system');
    } catch (err) {
      this.addMessage(`Error adding event listener: ${err.message}`, 'error');
    }
  }

  handleOff(args) {
    if (args.length < 1) {
      this.addMessage('Usage: off <event>', 'error');
      return;
    }

    const event = args[0];
    
    // Check if listening for this event
    if (!this.eventListeners.has(event)) {
      this.addMessage(`Not listening for event: ${event}`, 'error');
      return;
    }

    try {
      // Check if client is connected
      if (!this.client.isConnected()) {
        this.addMessage('Error: Not connected to server. Please check your connection.', 'error');
        return;
      }
      
      // Remove event listener
      const handler = this.eventListeners.get(event);
      this.client.offEvent(event, handler);
      this.eventListeners.delete(event);
      this.addMessage(`Stopped listening for event: ${event}`, 'system');
    } catch (err) {
      this.addMessage(`Error removing event listener: ${err.message}`, 'error');
    }
  }

  handleOffAll() {
    try {
      // Check if client is connected
      if (!this.client.isConnected()) {
        this.addMessage('Error: Not connected to server. Please check your connection.', 'error');
        return;
      }
      
      // Remove all event listeners
      for (const [event, handler] of this.eventListeners) {
        this.client.offEvent(event, handler);
      }
      
      this.eventListeners.clear();
      this.addMessage('Stopped listening for all events', 'system');
    } catch (err) {
      this.addMessage(`Error removing event listeners: ${err.message}`, 'error');
    }
  }

  showHelp() {
    this.addMessage('Available commands:', 'system');
    this.addMessage('  emit <event> [data]        - Send an event with optional data', 'system');
    this.addMessage('  on <event>                 - Listen for an event', 'system');
    this.addMessage('  off <event>                - Stop listening for an event', 'system');
    this.addMessage('  offAll                     - Stop listening for all events', 'system');
    this.addMessage('  help                       - Show this help message', 'system');
    this.addMessage('  Ctrl+C                     - Exit siocat', 'system');
  }

  destroy() {
    if (this.screen) {
      this.screen.destroy();
    }
  }
}

module.exports = SioCatTUI;