const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if (url.pathname === '/api/cash-shop' && ['GET','POST'].includes(req.method)) {
    if(req.headers.origin && req.headers.origin !== 'http://'+req.headers.host) { res.writeHead(403); res.end(); return; }
    try {
      const target = new URL(process.env.MAPLE_MARKET_URL || 'http://127.0.0.1:3000');
      if(!['127.0.0.1','localhost'].includes(target.hostname)) throw new Error('Local Maple Market URL required');
      const upstream=await fetch(new URL('/api/cash-shop',target),{method:req.method,signal:AbortSignal.timeout(10000)});
      const text=await upstream.text();
      res.writeHead(upstream.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(text);
    } catch {res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'로컬 maple-market 서버 연결을 확인하세요.'}));}
    return;
  }
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!['index.html','app.js','cash-shop.js','optimizer.js','optimizer.worker.js','maplestory-leaf.svg'].includes(name)) {res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(path.join(root,name)).pipe(res);
}).listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173'));
