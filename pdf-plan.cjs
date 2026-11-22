const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const python=process.env.LUXCHECK_PYTHON||'C:\\Users\\AR\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
let busy=false;
const fail=(res,status,error)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error}));};
async function extract(req,res){
 if(req.headers.origin&&!['http://127.0.0.1:4190','http://localhost:4190'].includes(req.headers.origin))return fail(res,403,'請由本機 LuxCheck 匯入 PDF。');
 if(!/^application\/pdf(?:;|$)/i.test(req.headers['content-type']||''))return fail(res,415,'請選擇 PDF 圖面。');
 const page=Number(new URL(req.url,'http://localhost').searchParams.get('page')||1);
 if(!Number.isInteger(page)||page<1)return fail(res,400,'PDF 頁碼無效。');
 if(busy)return fail(res,409,'另一份 PDF 正在讀取，請稍後再試。');
 const max=30*1024*1024;
 if(Number(req.headers['content-length'])>max){req.resume();return fail(res,413,'PDF 請小於 30 MB。');}
 busy=true;let folder;
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('PDF 請小於 30 MB。');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))return fail(res,400,'檔案不是可讀取的 PDF。');
  folder=await fs.mkdtemp(path.join(os.tmpdir(),'luxcheck-pdf-'));
  const source=path.join(folder,'source.pdf'),output=path.join(folder,'extracted.json');
  await fs.writeFile(source,bytes);
  await new Promise((resolve,reject)=>execFile(python,[path.join(__dirname,'pdf-plan-extract.py'),source,String(page),output],{cwd:folder,windowsHide:true,timeout:90000,maxBuffer:1024*1024,env:{...process.env,PYTHONUTF8:'1'}},(error,stdout,stderr)=>{
   if(error)return reject(Error(error.code==='ENOENT'?'找不到 PDF 本機執行環境，請檢查 LUXCHECK_PYTHON。':error.killed?'PDF 讀取逾時，請先另存單頁或較小範圍。':String(stderr).trim().slice(-400)||'PDF 無法讀取；請確認未加密且可正常開啟。'));
   resolve();
  }));
  const stat=await fs.stat(output);if(stat.size>40*1024*1024)throw Error('PDF 圖面過大，請先另存需要的區域。');
  const data=await fs.readFile(output);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(data);
 }catch(error){if(!res.headersSent)fail(res,422,error.message);}
 finally{if(folder)await fs.rm(folder,{recursive:true,force:true}).catch(()=>{});busy=false;}
}
module.exports={extract};
