const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const autoCad='C:\\Program Files\\Autodesk\\AutoCAD 2025\\accoreconsole.exe';
let busy=false;
function json(res,status,error){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error}));}
async function convert(req,res){
 if(req.headers.origin&&!['http://127.0.0.1:4190','http://localhost:4190'].includes(req.headers.origin))return json(res,403,'請從本機 LuxCheck 頁面匯入。');
 if(!/^application\/octet-stream(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,'請使用 CAD 匯入功能上傳 DWG。');
 if(busy)return json(res,409,'另一個 DWG 正在轉換，請完成後再試。');
 busy=true;let folder;
 try{
  await fs.access(autoCad);
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>30*1024*1024){json(res,413,'DWG 請小於 30 MB。');return;}chunks.push(chunk);}
  const input=Buffer.concat(chunks);if(!/^AC10\d\d/.test(input.subarray(0,6).toString('ascii')))return json(res,400,'檔案不是可辨識的 AutoCAD DWG。');
  folder=await fs.mkdtemp(path.join(os.tmpdir(),'luxcheck-cad-'));
  const source=path.join(folder,'input.dwg'),output=path.join(folder,'output.dxf'),script=path.join(folder,'convert.scr');
  await fs.writeFile(source,input);
  await fs.writeFile(script,`(setvar "FILEDIA" 0)\n(setvar "CMDECHO" 0)\n(command "_.DXFOUT" "${output.replace(/\\/g,'/')}" "16")\n(command "_.QUIT" "_N")\n`,'ascii');
  await new Promise((resolve,reject)=>execFile(autoCad,['/i',source,'/s',script,'/l','en-US'],{cwd:folder,windowsHide:true,timeout:120000,maxBuffer:12*1024*1024,encoding:'buffer'},(error,stdout,stderr)=>{
    fs.writeFile(path.join(__dirname,'deployment','last-dwg-conversion.log'),stdout.toString('utf16le')+'\n'+stderr.toString('utf16le')).catch(()=>{});
    error?reject(Error(error.killed?'DWG 轉換逾時；請先以 AutoCAD 另存 ASCII DXF。':'AutoCAD 無法完成轉換，請確認圖檔可正常開啟，或改用 ASCII DXF。')):resolve();
  }));
  const stat=await fs.stat(output);if(stat.size>100*1024*1024)throw Error('轉換後圖檔過大，請先另存辦公區域。');
  const data=await fs.readFile(output);res.writeHead(200,{'Content-Type':'application/dxf','Cache-Control':'no-store'});res.end(data);
 }catch(error){if(!res.headersSent)json(res,422,error.code==='ENOENT'?'找不到本機 AutoCAD 2025，請改用 ASCII DXF。':error.message);}
 finally{busy=false;if(folder)await fs.rm(folder,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={convert};
