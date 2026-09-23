const http = require('node:http');
const { catalogPayload } = require('./src/data');
const { renderPage } = require('./src/view');

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function createServer() {
  return http.createServer((request, response) => {
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
