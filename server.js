const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { catalogPayload } = require('./src/data');
const { renderPage } = require('./src/view');
const { calculateScenario } = require('./src/simulation');

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('invalid_json')); }
    });
    request.on('error', reject);
  });
}

function createServer() {
  return http.createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/scenarios/accept') {
      try {
        const body = await readJson(request);
        const calculation = calculateScenario(body.decisions);
        return sendJson(response, calculation.accepted ? 200 : 400, calculation);
      } catch {
        return sendJson(response, 400, { accepted: false, errors: [{ code: 'invalid_json', message: 'Request body must be valid JSON' }] });
      }
    }
    if (request.method === 'GET' && request.url === '/client.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return response.end(fs.readFileSync(path.join(__dirname, 'public', 'client.js')));
    }
    if (request.method === 'GET' && (request.url === '/map.js' || request.url === '/map.css')) {
      response.writeHead(200, { 'Content-Type': request.url.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' });
      return response.end(fs.readFileSync(path.join(__dirname, 'public', request.url.slice(1))));
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(renderPage(catalogPayload()));
    }
    if (request.url === '/api/catalog') return sendJson(response, 200, catalogPayload());
    return sendJson(response, 404, { error: 'Not found' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`QALA запущена: http://localhost:${port}`));
}

module.exports = { createServer };
