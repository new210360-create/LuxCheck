const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = 4190;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ies':'text/plain; charset=utf-8','.ldt':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server = http.createServer((req,res) => {
  let url;
  try {url = decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400); return res.end();}
  if(req.method==='POST'&&url==='/api/cad/convert')return require('./cad-convert.cjs').convert(req,res);
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); return res.end();}
  if(url === '/health') {res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({app:'LuxCheck',port,pid:process.pid}));}
  const relative = url === '/' ? 'index.html' : url.slice(1);
  if (relative !== 'index.html' && !/^(css|js|vendor|samples)\/[a-zA-Z0-9_.-]+$/.test(relative)) {res.writeHead(404); return res.end();}
  const type = types[path.extname(relative).toLowerCase()];
  if(!type){res.writeHead(404); return res.end();}
  fs.readFile(path.join(__dirname,relative),(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error',err=>{console.error(err.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`LuxCheck http://127.0.0.1:${port}/ PID ${process.pid}`));
