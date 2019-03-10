const carlo = require('carlo');
const fileType = require('file-type');
const open = require('opener');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const os = require('os');
const makeServer = require('./startpage.js');
const { argv } = require('yargs');
const { version: copherVersion } = require('./package.json');

let userJs = argv.userjs ? fs.readFileSync(argv.userjs, 'utf8') : '';

const templateFile = path.join(__dirname, 'template.html');
const template = fs.readFileSync(templateFile, 'utf8')
  .replace('USER_JS', userJs).replace('COPHER_VERSION', copherVersion);
const [head, foot] = template.split('REPLACE_ME');

function makeHead(url) {
  url = url.toString();
  if (url.startsWith('gopher://secure@')) {
    url = url.replace('gopher://secure@', 'gophers://') + ' &#x1F512;';
  }
  return head.replace('TITLE', url);
}

let startUrl;
try {
  startUrl = argv._ ? argv._[0] : undefined;
  if (
    startUrl && (
      startUrl.startsWith('gopher://') ||
      startUrl.startsWith('gophers://')
    )
  ) {
    startUrl = cleanStartUrl(argv._[0]);
  }
} catch (e) {
  console.error(e.stack);
}

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
  const typeName = typeFrom(type);
  if (type === 'i') {
    return '';
  }
  const abbr = `<abbr title="${typeName}"></abbr>`;
  if ('0145679gIps'.includes(type)) {
    const realPort = port % 100000;
    const auth = Math.floor(port / 100000) ? 'secure@' : '';
    const url = `gopher://${auth}${host}:${realPort}/${type}${selector || '/'}`;
    const onclick = type === '7' ? ` onclick="window.search('${url}')"` : '';
    const href = type === '7' ? '#' : url;
    const dl = '4569'.includes(type) ?
      ` download="${path.basename(selector)}"` :
      '';
    return `<a class="_${typeName}" href="${href}"${onclick}${dl}>${abbr}</a>`;
  }
  if (type === 'h') {
    const href = selector.replace(/^URL:/, '');
    return `<a class="_${typeName}" href="${href}">${abbr}</a>`;
  }
  if ('8T'.includes(type)) {
    return `<a class="_${typeName}" href="telnet://${host}:${port}">${abbr}</a>`;
  }
  return typeName;
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

const blankRow = '<tr><td>&nbsp;</td></tr>';

function renderText(data, url) {
  const row = `<tr><td></td><td>${data}</td></tr>`;
  return `${makeHead(url)}<table>${blankRow}${row}</table>${foot}`
}

function renderGopher(data, url, isText = false) {
  const lines = data.toString('ascii').split(/\r?\n/)
  .map(line => {
    if (line === '.') return null;
    if (line.length === 0) return null;
    return line;
  })
  .filter(line => line !== null)
  .map(line => [line.charAt(0), ...line.substr(1).split('\t')]);

  const rows = lines.map((line, i) => {
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
      display
    ].map(x => `<td>${x}</td>`).join('');
    return `<tr data-src="${line}">\n${result}\n</tr>`;
  }).join('\n');

  return `${makeHead(url)}<table>${blankRow}${rows}</table>${foot}`;
}

function dataUrl(buf, def) {
  const { mime } = fileType(buf) || { mime: def };
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function renderImage(buf, url) {
  return `${makeHead(url)}
    <img src="${dataUrl(buf, 'image/png')}"/>
  ${foot}`;
}

function renderSound(buf, url) {
  return `${makeHead(url)}
    <audio controls src="${dataUrl(buf, 'audio/wav')}"></audio>
  ${foot}`;
}

function tcpConnect(port, host) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port || 70, host, () =>
      resolve(sock)).on('error', reject);
  });
}

function tlsConnect(port, host) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(port || 105, host, () =>
      resolve(sock)).on('error', reject);
  });
}

function connect(url) {
  const { port, hostname, protocol, username } = url;
  if (username && username === 'secure') {
    return tlsConnect(port, hostname);
  } else {
    return tcpConnect(port, hostname);
  }
}

async function getGopher(url) {
  const [parsed, type] = parseGopherUrl(url);
  const sock = await connect(parsed);
  sock.write(decodeURIComponent(url.pathname + url.search) + '\r\n');
  const bufs = [];
  for await (const d of sock) bufs.push(d);
  const data = Buffer.concat(bufs);
  url.pathname = `/${type}${url.pathname}`;
  switch(type) {
    case '0':
      return renderText(data, url);
    case '1':
    case '7':
      return renderGopher(data, url);
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

function cleanStartUrl(urlString) {
  if (!urlString.includes('://')) {
    urlString = 'gopher://';
  }
  if (urlString.startsWith('gophers://')) {
    urlString = urlString.replace(/^gophers:\/\//, 'gopher://secure@');
  }
  let [url0, url1, hostAndPort, ...rest] = urlString.split('/');
  let [host, port] = hostAndPort.split(':');
  if (port) {
    port = Number(port);
    if (port / 100000 >= 1) {
      port = port % 100000;
      if (!host.startsWith('secure@')) {
        host = 'secure@' + host;
      }
    }
  }
  hostAndPort = port ? `${host}:${port}` : host;
  urlString = [url0, url1, hostAndPort, ...rest].join('/');
  return urlString;
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
      body = renderGopher(e.stack, url)
    }
    request.fulfill({body: Buffer.from(body)});
  });

  if (!startUrl) {
    const startPort = await makeServer();
    startUrl = `gopher://localhost:${startPort}/`;
  }

  await app.load(startUrl);
})().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
