const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
for(const file of ['index.html','app.js','cash-shop.js','optimizer.js','optimizer.worker.js','maplestory-leaf.svg']) fs.copyFileSync(path.join(root,file),path.join(root,'dist',file));
console.log('Built 6 static assets in dist/');
