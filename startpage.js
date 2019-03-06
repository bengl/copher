const net = require('net');
const { version } = require('./package.json');

module.exports = makeServer;

function makeServer() {
  return new Promise((resolve) => {
    const server = net.createServer(sock => {
      let query = '';
      sock.on('data', d => {
        const data = d.toString();
        query += data;
        if (query.endsWith('\r\n')) {
          route(query.trim(), sock);
        }
      });
    }).listen(0, () => resolve(server.address().port));
  });
}

function route(query, sock) {
  home(sock);
}

const logo = `
                               oooo                           
                               \`888                           
 .ooooo.   .ooooo.  oo.ooooo.   888 .oo.    .ooooo.  oooo d8b 
d88' \`"Y8 d88' \`88b  888' \`88b  888P"Y88b  d88' \`88b \`888""8P 
888       888   888  888   888  888   888  888ooo888  888     
888   .o8 888   888  888   888  888   888  888    .o  888     
\`Y8bod8P' \`Y8bod8P'  888bod8P' o888o o888o \`Y8bod8P' d888b    
                     888                                      
                    o888o                                     
`.trim().split('\n').splice(1,9).map(line => {
  return `i${line}\t\terror.host\t1`;
});

function home(sock) {
  const data = [
    ...logo,
    `iv${version}\t\terror.host\t1`,
    'i\t\terror.host\t1',
    'iWelcome to Copher, a modern Gopher Client!\t\terror.host\t1',
    'i\t\terror.host\t1',
    'hGitHub has usage information, etc.\tURL:https://github.com/bengl/copher\terror.host\t1',
    'i\t\terror.host\t1',
    'iPress "g" to open a prompt for a Gopher to navigate to.\t\terror.host\t1',
    'iLeft and Right arrow keys go Back and Forward, respectively.\t\terror.host\t1',
    'iTo activate links, use the icons in the left column.\t\terror.host\t1',
    'i\t\terror.host\t1',
    'iHere are some gopher links to get you started:\t\terror.host\t1',
    '1gopher.floodgap.com\t\tgopher.floodgap.com\t70',
    '1gopher.quux.org\t\tgopher.quux.org\t70',
    '1sdf.org\t\tsdf.org\t70',
  ].join('\r\n') + '\r\n.\r\n';
  sock.write(data);
  sock.end();
}
