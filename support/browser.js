const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

async function waitFor(read, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const value = await read();
      if (value) return value;
    } catch { /* Browser is starting. */ }
    await delay(50);
  }
  throw new Error('Timed out waiting for browser');
}

async function openBrowser(url) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qala-map-chrome-'));
  const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank',
  ], { stdio: 'ignore' });
  try {
    const port = await waitFor(() => fs.readFileSync(path.join(directory, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    const pages = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return (await response.json()).find((page) => page.type === 'page');
    });
    const socket = new WebSocket(pages.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!pending.has(message.id)) return;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    });
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    }
    await send('Page.navigate', { url });
    await waitFor(() => evaluate('document.readyState === "complete" && !!window.QalaMap'));
    return {
      evaluate,
      send,
      waitFor: (read) => waitFor(read),
      close: async () => { socket.close(); chrome.kill(); await delay(100); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); },
    };
  } catch (error) {
    chrome.kill();
    await delay(100);
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw error;
  }
}

module.exports = { openBrowser };
