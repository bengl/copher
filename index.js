const carlo = require('carlo');
const fileType = require('file-type');
const open = require('opener');
const urlTemplate = require('url-template');
const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const { parse: urlParse } = require('url');
const { argv } = require('yargs');
const { version: copherVersion } = require('./package.json');
const iconv = require('iconv-lite');

let userJs = argv.userjs ? fs.readFileSync(argv.userjs, 'utf8') : '';
let selectedEncoding = argv.encoding ? argv.encoding : 'utf8';
let timeout = argv.timeout ? Number(argv.timeout) : 5000;
let goh;
if (argv.goh) {
  const template = urlTemplate.parse(argv.goh);
  const h = argv.goh.startsWith('https') ? https : http;
  goh = url => new Promise((resolve, reject) => {
    const options = urlParse(template.expand({ url }));
    options.headers = { accept: "application/gopher" };
    h.get(options, resolve).on('error', reject)
  });
}

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
  if (startUrl) {
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
  url.selector = url.pathname;
  if (url.selector && url.selector.length >= 2) {
    type = url.selector.charAt(1);
    url.selector = url.selector.substr(2);
    if (!url.selector) {
      url.selector = '/';
    }
  }
  return [url, type];
}

function makeGopherLink(type, host, port, type, selector, extra) {
  const typeName = typeFrom(type);
  if (type === 'i') {
    return '';
  }
  if (type === '3') {
    return '<span class="error"><span>';
  }
  const abbr = `<abbr title="${typeName}"></abbr>`;
  if (type === 'h') {
    const href = selector.replace(/^URL:/, '');
    return `<a class="_${typeName}" href="${href}">${abbr}</a>`;
  }
  if ('8T'.includes(type)) {
    return `<a class="_${typeName}" href="telnet://${host}:${port}">${abbr}</a>`;
  }
  const realPort = port % 100000;
  const auth = Math.floor(port / 100000) ? 'secure@' : '';
  const url = `gopher://${auth}${host}:${realPort}/${type}${selector || '/'}`;
  const onclick = type === '7' ? ` onclick="window.search('${url}')"` : '';
  const href = type === '7' ? '#' : url;
  const dl = ('4569dP'.includes(type) || typeName === 'unknown') ?
    ` download="${path.basename(selector)}"` :
    '';
  return `<a class="_${typeName}" href="${href}"${onclick}${dl}>${abbr}</a>`;
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
    case 'P': return 'pdf';
    case 'd': return 'download';
    case '.': return 'end';
    default: return 'unknown';
  }
}

const blankRow = '<tr><td>&nbsp;</td></tr>';

function renderText(data, url) {
  const rows = (data ? data.toString() : '').trimEnd().split(/\r?\n/);
  if (rows[rows.length - 1] === '.') {
    rows[rows.length - 1] = '';
  }
  return `${makeHead(url)}
  <table>
    ${blankRow}
    ${rows.map(row => {
      const cleanedRow = row
      .replace(/</g, '&lt;') // html escaping
      .replace(/>/g, '&gt;') // html escaping
      .replace(/^\.\./, '.'); // leading double-`.` are escaped single-`.`
      return `<tr><td></td><td>${cleanedRow}</td></tr>`
    }).join('\n')}
  </table>
  ${foot}`;
}

function renderGopher(data, url, isText = false) {
  const lines = iconv.decode(data, selectedEncoding).split(/\r?\n/)
  .map(line => {
    if (line === '.') return null;
    if (line.length === 0) return null;
    return line;
  })
  .filter(line => line !== null)
  .map(line => [line.charAt(0), ...line.substr(1).split('\t')]);

  const rows = lines.map((line, i) => {
    let [type, display, selector, host, port] = line;
    if (display) {
      display = display.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
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
  let { mime } = fileType(buf) || { mime: def };
  if (mime === 'audio/vnd.wave' || mime === 'audio/x-wav') {
    // Chromium seems to have issues with certain audio MIME types, so just
    // normalize this to 'audio/wav'.
    mime = 'audio/wav';
  }
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
      resolve(sock)).once('error', reject);
    sock.setTimeout(timeout, () => {
      sock.end();
      reject(new Error('Request timed out.'));
    });
  });
}

function tlsConnect(port, host) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(port || 105, host, () =>
      resolve(sock)).once('error', reject);
    sock.setTimeout(timeout, () => {
      sock.end();
      reject(new Error('Request timed out.'));
    });
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

async function getViaCoh(url) {
  const res = await goh(url);
  const bufs = [];
  for await (const d of res) {
    bufs.push(d);
  }
  return Buffer.concat(bufs);
}

async function getGopher(url) {
  const origUrlStr = url.toString();
  const [parsed, type] = parseGopherUrl(url);
  let data;
  if (goh) {
    data = await getViaCoh(origUrlStr);
  } else {
    const sock = await connect(parsed);
    sock.write(decodeURIComponent(url.selector + url.search) + '\r\n');
    const bufs = [];
    for await (const d of sock) bufs.push(d);
    data = Buffer.concat(bufs);
  }
  url.pathname = `/${type}${url.selector}`;
  let body = '';
  let contentType;
  switch(type) {
    case '0':
      body = renderText(data, url);
      contentType = 'text/html; charset=utf8';
      break;
    case '1':
    case '7':
      body = renderGopher(data, url);
      contentType = 'text/html; charset=utf8';
      break;
    case 'g':
    case 'I':
    case 'p':
      body = renderImage(data, url);
      break;
    case 's':
      body = renderSound(data, url);
      break;
    default:
      body = 'Error: unknown format';
  }
  const result = { body: Buffer.from(body) };
  if (contentType) {
    result.headers = {
      'content-type': contentType
    };
  }
  return result;
}

function cleanStartUrl(urlString) {
  if (!urlString.includes('://')) {
    urlString = 'gopher://' + urlString;
  }
  if (urlString.startsWith('gophers://')) {
    urlString = urlString.replace(/^gophers:\/\//, 'gopher://secure@');
  } else {
    // Twitter (and other things) automatically convert domain names to HTTP.
    urlString = urlString.replace(/^https?:/, 'gopher:');
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
    let response;
    try {
      const url = new URL(request.url());
      if (url.protocol !== 'gopher:') {
        open(request.url());
        return;
      }
      response = await getGopher(url);
    } catch (e) {
      response = { body: Buffer.from(renderText(e.stack, new URL(request.url()))) };
    }
    request.fulfill(response);
  });

  if (!startUrl) {
    startUrl = 'gopher://spaghetti.host/1/copherstart'
  }

  await app.load(startUrl);
})().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
