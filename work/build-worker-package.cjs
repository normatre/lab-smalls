const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const outDir = process.argv[3];
const projectId = process.argv[4];
if (!root || !outDir || !projectId) throw new Error('usage: node build-worker-package.cjs <out> <package> <projectId>');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, '.openai'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'dist', '.openai'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'dist', 'server'), { recursive: true });

const hosting = { project_id: projectId };
fs.writeFileSync(path.join(outDir, '.openai', 'hosting.json'), JSON.stringify(hosting, null, 2));
fs.writeFileSync(path.join(outDir, 'dist', '.openai', 'hosting.json'), JSON.stringify(hosting, null, 2));

const assets = {};
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else {
      const rel = '/' + path.relative(root, file).replace(/\\/g, '/');
      if (rel === '/_worker.js') continue;
      const body = fs.readFileSync(file).toString('base64');
      assets[rel] = { body, type: contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream' };
    }
  }
}
walk(root);

const worker = `const assets = ${JSON.stringify(assets)};\n\nconst visionPrompt = ${JSON.stringify('Read this lab chemical container label. Extract the exact real chemical/product name, not grade/quality text such as ACS reagent, ReagentPlus, reagent grade, powder, 99+%, certified, for analysis, lot, expiry, or hazard text. Preserve full numbered names and salts exactly, for example Sodium 1-dodecanesulfonate must not be simplified to Sodium hydroxide or Sodium chloride. Return only compact JSON with keys: chemicalName, quantity, containerSize, unit, physicalState, manufacturer, catalogNumber, casNumber, unNumber, grade, confidence. unit must be one of g, kg, mL, L. physicalState must be Solid, Liquid, Gas, or Unknown.')};\n\nexport default {\n  async fetch(request, env) {\n    const url = new URL(request.url);\n    if (url.pathname === '/api/openai-vision') return handleVisionRequest(request, env);\n    return serveAsset(url.pathname);\n  },\n};\n\nasync function handleVisionRequest(request, env) {\n  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);\n  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not configured' }, 503);\n  try {\n    const body = await request.json();\n    if (!body.image || typeof body.image !== 'string' || !body.image.startsWith('data:image/')) return json({ error: 'A base64 image data URL is required' }, 400);\n    const response = await fetch('https://api.openai.com/v1/responses', {\n      method: 'POST',\n      headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ model: 'gpt-4.1-mini', input: [{ role: 'user', content: [{ type: 'input_text', text: visionPrompt }, { type: 'input_image', image_url: body.image }] }] }),\n    });\n    return json(await response.json(), response.status);\n  } catch {\n    return json({ error: 'Vision OCR proxy failed' }, 500);\n  }\n}\n\nfunction serveAsset(pathname) {\n  const names = candidatePaths(pathname);\n  for (const name of names) {\n    const asset = assets[name];\n    if (asset) return new Response(decode(asset.body), { headers: { 'Content-Type': asset.type, 'Cache-Control': cacheFor(name) } });\n  }\n  const fallback = assets['/404.html'] || assets['/index.html'];\n  return new Response(decode(fallback.body), { status: 404, headers: { 'Content-Type': fallback.type, 'Cache-Control': 'no-store' } });\n}\n\nfunction candidatePaths(pathname) {\n  const clean = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);\n  const paths = [clean];\n  if (clean.endsWith('/')) paths.push(clean + 'index.html');\n  else if (!clean.includes('.')) paths.push(clean + '/index.html', clean + '.html');\n  return paths;\n}\n\nfunction decode(base64) {\n  const binary = atob(base64);\n  const bytes = new Uint8Array(binary.length);\n  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);\n  return bytes;\n}\n\nfunction cacheFor(name) {\n  return name.includes('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-store';\n}\n\nfunction json(data, status = 200) {\n  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });\n}\n`;
fs.writeFileSync(path.join(outDir, 'dist', 'server', 'index.js'), worker);
