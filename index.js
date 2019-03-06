const carlo = require('carlo');
const fileType = require('file-type');
const open = require('opener');
const net = require('net');
const fs = require('fs');
const path = require('path');

const [head, foot] = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8').split('REPLACE_ME');

const makeHead = title => head.replace('TITLE', title);

let startUrl = 'gopher://gopher.floodgap.com';
try {
  const parsed = new URL(process.argv[2]);
  if (parsed.protocol === 'gopher:') {
    startUrl = process.argv[2];
  }
} catch (e) {}

function parseGopherUrl(url) {
  if (
    url.protocol === null &&
    url.host === null &&
    typeof url.pathname === 'string'
  ) {
    url = new URL(`gopher://${url}`);
  }
  let type = '1';
  if (url.pathname && url.pathname.match(/^\/.\/.*/)) {
    type = url.pathname.charAt(1);
    url.pathname = url.pathname.substr(2);
    if (!url.pathname) {
      url.pathname = '/';
    }
  }
  return [url, type];
}

function makeGopherLink(type, host, port, type, selector, extra) {
  if (type === 'i') {
    return '';
  }
  if ('0145679gIp'.includes(type)) {
    const url = `gopher://${host}:${port}/${type}${selector || '/'}`;
    const onclick = type === '7' ? ` onclick="window.search('${url}')"` : '';
    const href = type === '7' ? '#' : url;
    const dl = '4569'.includes(type) ? ` download="${path.basename(selector)}"` : '';
    return `<a href="${href}"${onclick}${dl}>[${typeFrom(type)}]</a>`;
  }
  if (type === 'h') {
    return `<a href="${selector.replace(/^URL:/, '')}">[web]</a>`;
  }
  if ('8T'.includes(type)) {
    return `<a href="telnet://${host}:${port}">[${typeFrom(type)}]</a>`;
  }
  return `[${typeFrom(type)}]`;
}

function typeFrom(lead) {
  switch (lead) {
    case '0': return 'text';
    case '1': return 'menu';
    case '2': return 'cso'; // XXX not going to support
    case '3': return 'error';
    case '4': return 'mac-file';
    case '5': return 'dos-file';
    case '6': return 'uu-file';
    case '7': return 'search';
    case '8': return 'telnet';
    case '9': return 'bin';
    case '+': return 'mirror';
    case 'g': return 'gif';
    case 'I': return 'image';
    case 'T': return '3270';
    case 'h': return 'html'; // (html-over-gopher not yet supported)
    case 'i': return 'info';
    case 's': return 'sound';
    case 'p': return 'png';
    case '.': return 'end';
    default: return 'unknown';
  }
}

function renderGopher(data, url, isText = false) {
  const lines = data.toString('ascii').split(/\r?\n/)
  .map(line => {
    if (line === '.') return '';
    if (isText) return `i${line}\t\t\t`;
    if (line.length === 0) return '';
    return line;
  })
  .filter(line => line.length)
  .map(line => [line.charAt(0), ...line.substr(1).split('\t')]);

  const tableContents = lines.map((line, i) => {
    let [type, display, selector, host, port] = line;
    if (type === '+') {
      if (i === '0') {
        throw new Error('badly formed gopher menu');
      }
      type = lines[i - 1][0];
      line[0] = type;
    }
    selector = selector || '/';
    let result = [
      makeGopherLink(type, host, port, type, selector),
      `<pre>${display}</pre>`
    ].map(x => `<td>${x}</td>`).join('');
    return `        <tr data-src="${line}">\n          ${result}\n        </tr>`;
  }).join('\n');

  return `${makeHead(url)}<table><tr><td>&nbsp;</td></tr>\n${tableContents}\n      </table>${foot}`;
}

function dataUrl(buf) {
  return `data:image/${fileType(buf).mime};base64,${buf.toString('base64')}`;
}

function renderImage(buf, url) {
  return `${makeHead(url)}<img src="${dataUrl(buf)}"/>${foot}`;
}

function renderSound(buf, url) {
  return `${makeHead(url)}<audio controls src="${dataUrl(buf)}"></audio>${foot}`;
}

function tcpConnect(port, host) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port || 70, host, () =>
      resolve(sock)).on('error', reject);
  });
}

async function getGopher(url) {
  const [parsed, type] = parseGopherUrl(url);
  const sock = await tcpConnect(url.port, url.host);
  sock.write(decodeURIComponent(url.pathname + url.search) + '\r\n');
  const bufs = [];
  for await (const d of sock) bufs.push(d);
  const data = Buffer.concat(bufs);
  switch(type) {
    case '0':
    case '1':
    case '7':
      return renderGopher(data, url, type === '0');
    case 'g':
    case 'I':
    case 'p':
      return renderImage(data, url);
    case 's':
      return renderSound(data, url);
    default:
      return 'Error: unknown format';
  }
}

(async () => {
  const app = await carlo.launch({
    channel: ['canary', 'stable'],
    title: 'copher'
  });

  app.on('exit', () => process.exit());

  app.serveHandler(async request => {
    let body;
    try {
      const url = new URL(request.url());
      if (url.protocol !== 'gopher:') {
        open(request.url());
        return;
      }
      body = await getGopher(url);
    } catch (e) {
      body = renderGopher(e.stack)
    }
    request.fulfill({body: Buffer.from(body)});
  });

  await app.load(startUrl || 'gopher://gopher.floodgap.com');
})().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
