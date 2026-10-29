'use strict';

const blessed = require('blessed');
const LineEditor = require('../lib/line-editor');

describe('LineEditor Widget', () => {
  let screen;
  let editor;

  beforeEach(() => {
    screen = blessed.screen({ smartCSR: true });
    editor = new LineEditor({
      parent: screen,
      prompt: '> '
    });
    editor.focus();
  });

  afterEach(() => {
    screen.destroy();
  });

  test('inserts text at cursor and updates cursor position', () => {
    editor._handleKey('a', null);
    editor._handleKey('b', null);
    editor._handleKey('c', null);
    expect(editor.getValue()).toBe('abc');
    expect(editor.cursor).toBe(3);
  });

  test('moves cursor left and right', () => {
    editor.setValue('hello');
    expect(editor.cursor).toBe(5);

    editor._handleKey(null, { name: 'left' });
    expect(editor.cursor).toBe(4);

    editor._handleKey(null, { name: 'left' });
    expect(editor.cursor).toBe(3);

    editor._handleKey(null, { name: 'right' });
    expect(editor.cursor).toBe(4);
  });

  test('moves cursor to home and end', () => {
    editor.setValue('testing');
    editor._handleKey(null, { name: 'home' });
    expect(editor.cursor).toBe(0);

    editor._handleKey(null, { name: 'end' });
    expect(editor.cursor).toBe(7);
  });

  test('backspace deletes character before cursor', () => {
    editor.setValue('hello');
    editor._handleKey(null, { name: 'left' }); // cursor at 4 (between 'l' and 'o')
    editor._handleKey(null, { name: 'backspace' });
    expect(editor.getValue()).toBe('helo');
    expect(editor.cursor).toBe(3);
  });

  test('delete deletes character at cursor', () => {
    editor.setValue('hello');
    editor._handleKey(null, { name: 'home' }); // cursor at 0
    editor._handleKey(null, { name: 'delete' });
    expect(editor.getValue()).toBe('ello');
    expect(editor.cursor).toBe(0);
  });

  test('inserts character in the middle of text', () => {
    editor.setValue('ac');
    editor._handleKey(null, { name: 'left' }); // cursor at 1
    editor._handleKey('b', null);
    expect(editor.getValue()).toBe('abc');
    expect(editor.cursor).toBe(2);
  });

  test('submits on enter key', (done) => {
    editor.setValue('emit test');
    editor.on('submit', (val) => {
      expect(val).toBe('emit test');
      expect(editor.history).toContain('emit test');
      done();
    });
    editor._handleKey(null, { name: 'enter' });
  });

  test('navigates history with up and down keys', () => {
    editor.history = ['cmd1', 'cmd2', 'cmd3'];
    editor._handleKey(null, { name: 'up' });
    expect(editor.getValue()).toBe('cmd3');

    editor._handleKey(null, { name: 'up' });
    expect(editor.getValue()).toBe('cmd2');

    editor._handleKey(null, { name: 'down' });
    expect(editor.getValue()).toBe('cmd3');

    editor._handleKey(null, { name: 'down' });
    expect(editor.getValue()).toBe('');
  });

  test('tab key does not modify input text (reserved for focus navigation)', () => {
    editor.setValue('emit test');
    editor._handleKey(null, { name: 'tab' });
    expect(editor.getValue()).toBe('emit test');
  });

  test('renders with syntax highlighting enabled', () => {
    editor.setValue('emit chat { id: 1 }');
    expect(editor.content).toContain('{bold}{cyan-fg}emit{/}');
    expect(editor.content).toContain('{bold}{yellow-fg}chat{/}');
  });

  test('emits cancel on escape key', (done) => {
    editor.on('cancel', () => {
      done();
    });
    editor._handleKey(null, { name: 'escape' });
  });
});
