(function(LX){
 'use strict';
 const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const colors={panel:'#eab308',downlight:'#0891b2',track:'#a855f7',desk:'#0284c7',wall:'#ef4444',unknown:'#64748b',ignore:'#cbd5e1'};
 let model=null,objects=[],boundary=null,selected=null,tool='select',picks=[],projection={k:1,x:0,y:0},sourceFile=null,sourceFileHash='',filename='',preview=null,pan=null,serial=0,lastBuilt=null,busy=false,recognizedScale=0;
 let backgroundImage=null,backgroundSource='';
 const selectedObject=()=>objects.find(o=>o.id===selected);
 const objectName=o=>'物件 '+(objects.indexOf(o)+1)+(o.source==='manual'?'（手動）':'');
 function config(){return{scale:Number($('pdfPlanScale').value),boundary,ceiling:Number($('pdfPlanCeiling').value),mount:Number($('pdfPlanMount').value),wallHeight:Number($('pdfPlanWallHeight').value),types:{panel:$('pdfPlanPanelType').value,downlight:$('pdfPlanDownlightType').value,track:$('pdfPlanTrackType').value}};}
 function invalidate(){ $('pdfPlanReviewed').checked=false; }
 function fit(){const cv=$('pdfPlanPreview');projection.k=Math.min((cv.width-70)/model.width,(cv.height-70)/model.height);projection.x=(cv.width-model.width*projection.k)/2;projection.y=(cv.height-model.height*projection.k)/2;draw();}
 const screen=p=>[p[0]*projection.k+projection.x,p[1]*projection.k+projection.y];
 function point(e){const cv=$('pdfPlanPreview'),r=cv.getBoundingClientRect();return[((e.clientX-r.left)*cv.width/r.width-projection.x)/projection.k,((e.clientY-r.top)*cv.height/r.height-projection.y)/projection.k];}
 function setTool(next){tool=next;picks=[];document.querySelectorAll('[data-pdf-tool]').forEach(b=>b.classList.toggle('on',b.dataset.pdfTool===next));
  const instructions={select:'點圖形或清單選取後，可修改分類；滾輪縮放、右鍵拖移。',calibrate:'請點選兩個已知距離的端點，再填入實際距離（公尺）。',boundary:'依序點選空間邊界頂點，至少三點後按「完成圈選」。',desk:'點桌面外框的兩個對角點。',wall:'點牆線的起點與終點，可連續新增。',panel:'點擊平板燈位置。',downlight:'點擊崁燈位置。',track:'點擊軌道燈位置。'};
  $('pdfPlanHelp').textContent=instructions[next]||instructions.select;draw();}
 function trace(ctx,points,closed){ctx.beginPath();points.forEach((p,i)=>{const s=screen(p);i?ctx.lineTo(...s):ctx.moveTo(...s);});if(closed)ctx.closePath();}
 function draw(){if(!model)return;const cv=$('pdfPlanPreview'),ctx=cv.getContext('2d');ctx.fillStyle='#162230';ctx.fillRect(0,0,cv.width,cv.height);
  if(preview?.complete){ctx.drawImage(preview,projection.x,projection.y,model.width*projection.k,model.height*projection.k);}
  const filter=$('pdfPlanFilter').value;
  for(const object of objects){if(object.kind==='ignore'&&object.id!==selected||filter&&object.kind!==filter&&object.id!==selected)continue;
   const isSelected=object.id===selected;trace(ctx,object.points,object.closed);ctx.strokeStyle=isSelected?'#fb923c':colors[object.kind];ctx.lineWidth=isSelected?4:object.kind==='unknown'?1:2.5;
   if(object.kind!=='unknown'&&object.closed){ctx.globalAlpha=.13;ctx.fillStyle=colors[object.kind];ctx.fill();ctx.globalAlpha=1;}ctx.stroke();
  }
  if(boundary){trace(ctx,boundary,true);ctx.strokeStyle='#16a34a';ctx.lineWidth=4;ctx.setLineDash([10,4]);ctx.stroke();ctx.setLineDash([]);}
  if(picks.length){trace(ctx,picks,false);ctx.strokeStyle='#ea580c';ctx.lineWidth=3;ctx.stroke();for(const p of picks){ctx.beginPath();ctx.arc(...screen(p),6,0,Math.PI*2);ctx.fillStyle='#ea580c';ctx.fill();}}
 }
 function update(){if(!model)return;
  const counts={};for(const o of objects)counts[o.kind]=(counts[o.kind]||0)+1;
  $('pdfPlanCounts').textContent=Object.entries(LX.pdfPlan.kinds).filter(([k])=>counts[k]).map(([k,v])=>`${v} ${counts[k]}`).join(' ｜ ');
  const filter=$('pdfPlanFilter').value,listed=objects.filter(o=>!filter||o.kind===filter).slice(0,250);
  $('pdfPlanObjects').innerHTML=listed.map(o=>`<button type="button" data-pdf-id="${o.id}" class="${o.id===selected?'on':''}">${objectName(o)} · ${LX.pdfPlan.kinds[o.kind]}${o.reviewed?' ✓':''}</button>`).join('')+(objects.filter(o=>!filter||o.kind===filter).length>250?'<p class="hint">僅列出前 250 項；可篩選分類，或在圖上選取。</p>':'');
  $('pdfPlanSelected').classList.toggle('hidden',!selectedObject());
  const object=selectedObject();if(object){$('pdfPlanKind').value=object.kind;$('pdfPlanTypeOverride').value=object.typeId||'';const b=LX.pdfPlan.bounds(object.points),s=+$('pdfPlanScale').value;
   $('pdfPlanSelectedInfo').textContent=`${objectName(object)} · ${object.reason||'人工標記'}${s>0?' · '+(b.w*s).toFixed(2)+' × '+(b.h*s).toFixed(2)+' m':''}`;}
  lastBuilt=null;let message='請先核對尺度，選取或圈選計算範圍。';
  try{lastBuilt=LX.pdfPlan.build(model,objects,config(),LX.app.project);message=`${lastBuilt.width.toFixed(2)} × ${lastBuilt.length.toFixed(2)} m · ${lastBuilt.area.toFixed(2)} m² · ${lastBuilt.fixtures.length} 盞燈 · ${lastBuilt.desks.length} 張桌面 · ${lastBuilt.walls.length} 段牆線${lastBuilt.skipped.length?' · '+lastBuilt.skipped.length+' 個範圍外／無效物件未帶入':''}`;}catch(error){message=error.message;}
  $('pdfPlanPreviewInfo').textContent=message;
  const notes=[...(model.warnings||[])];if(!lastBuilt?.fixtures.length)notes.push('目前沒有燈具，可修正分類或手動補燈。');
  if(!lastBuilt?.desks.length)notes.push('目前沒有桌面，套用後以地面 0 m 計算。');
  $('pdfPlanWarning').textContent=notes.join(' ');
  $('pdfPlanApply').disabled=!lastBuilt||!$('pdfPlanScaleConfirmed').checked||!$('pdfPlanReviewed').checked||tool==='boundary';draw();
 }
 function recognize(){recognizedScale=+$('pdfPlanScale').value;objects=LX.pdfPlan.recognize(model,recognizedScale,objects);invalidate();update();}
 function libraryOptions(){const html=LX.app.project.library.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  for(const id of ['pdfPlanPanelType','pdfPlanDownlightType','pdfPlanTrackType'])$(id).innerHTML=html;
  $('pdfPlanTypeOverride').innerHTML='<option value="">依上方分類對應型號</option>'+html;
  const lib=LX.app.project.library;
  $('pdfPlanPanelType').value=(lib.find(t=>t.id==='panel-6060-ugr19')||lib.find(t=>/panel/.test(t.id))||lib[0]).id;
  $('pdfPlanDownlightType').value=(lib.find(t=>t.id==='downlight-15-60')||lib.find(t=>t.mount==='recessed'&&t.shape==='round')||lib[0]).id;
  $('pdfPlanTrackType').value=(lib.find(t=>t.id==='track-20-24')||lib.find(t=>t.mount==='track')||lib[0]).id;
 }
 async function show(data,name,saved){model=data;filename=name;objects=saved?.objects?structuredClone(saved.objects):LX.pdfPlan.recognize(data,0);boundary=saved?.settings?.boundary?structuredClone(saved.settings.boundary):null;selected=null;
  libraryOptions();const settings=saved?.settings;recognizedScale=settings?.scale||0;
  $('pdfPlanFileName').textContent=`${name} · 第 ${data.page}／${data.pages} 頁 · ${data.mode==='vector'?'向量圖面':'掃描／圖片圖面'} · ${data.paths.length} 個幾何物件`;
  $('pdfPlanPage').value=data.page;$('pdfPlanPage').max=data.pages;$('pdfPlanPageLoad').disabled=!(sourceFile&&sourceFileHash===data.sourceHash);
  $('pdfPlanScale').value=settings?.scale||'';$('pdfPlanRatio').value=settings?'custom':'';$('pdfPlanScaleConfirmed').checked=!!settings;
  $('pdfPlanCeiling').value=settings?.ceiling||LX.app.project.room.height||3;$('pdfPlanMount').value=settings?.mount||Math.min(2.8,+$('pdfPlanCeiling').value);$('pdfPlanWallHeight').value=settings?.wallHeight||Math.min(2.8,+$('pdfPlanCeiling').value);
  for(const [kind,id]of [['panel','pdfPlanPanelType'],['downlight','pdfPlanDownlightType'],['track','pdfPlanTrackType']])if(settings?.types?.[kind])$(id).value=settings.types[kind];
  $('pdfPlanReviewed').checked=false;$('pdfPlanFilter').value='';$('pdfPlanKnown').value='';
  preview=new Image();preview.src=data.preview;await preview.decode();
  if(!$('pdfPlanDlg').open)$('pdfPlanDlg').showModal();setTool('select');fit();update();
 }
 async function readFile(file,page=1){if(busy)throw Error('PDF 正在讀取，請稍候。');if(!file||!/\.pdf$/i.test(file.name))throw Error('請選擇 PDF 圖面。');if(file.size>30*1024*1024)throw Error('PDF 請小於 30 MB。');
  busy=true;const token=++serial;$('busy').textContent=`讀取 PDF 第 ${page} 頁與辨識圖形中…`;$('busy').classList.remove('hidden');
  try{const response=await fetch('/api/plan/pdf?page='+page,{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});const result=await response.json();if(!response.ok)throw Error(result.error||'PDF 讀取失敗');
   result.sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
   if(token!==serial)return;sourceFile=file;sourceFileHash=result.sourceHash;await show(result,file.name,null);
  }finally{busy=false;$('busy').classList.add('hidden');$('busy').textContent='計算中…';}
 }
 function calibrate(){if(picks.length!==2)return;const distance=Math.hypot(picks[1][0]-picks[0][0],picks[1][1]-picks[0][1]),known=+$('pdfPlanKnown').value;
  if(distance>.01&&known>0){$('pdfPlanScale').value=(known/distance).toPrecision(12);$('pdfPlanRatio').value='custom';$('pdfPlanScaleConfirmed').checked=true;recognize();$('pdfPlanHelp').textContent=`已以 ${known} m 校正。請再用第二組尺寸核對。`;}
 }
 function snap(p){let best=8/projection.k,out=p;for(const path of model.paths)for(const v of path.points){const d=Math.hypot(p[0]-v[0],p[1]-v[1]);if(d<best){best=d;out=v;}}return out.slice();}
 function click(e){if(!model)return;let p=point(e);if(p[0]<0||p[1]<0||p[0]>model.width||p[1]>model.height)return;
  if(tool==='select'){
   const threshold=7/projection.k,filter=$('pdfPlanFilter').value;
   const hits=objects.filter(o=>o.kind!=='ignore'&&(!filter||filter===o.kind)&&((o.closed&&LX.calc.pointInPoly(p[0],p[1],o.points))||LX.calc.distToPoly(p[0],p[1],o.points)<threshold));
   hits.sort((a,b)=>{const x=LX.pdfPlan.bounds(a.points),y=LX.pdfPlan.bounds(b.points);return x.w*x.h-y.w*y.h;});selected=hits[0]?.id||null;update();return;
  }
  p=snap(p);
  if(tool==='calibrate'){if(picks.length===2)picks=[];picks.push(p);draw();calibrate();return;}
  if(tool==='boundary'){picks.push(p);draw();return;}
  let points,closed=true,shape='rect';
  if(tool==='desk'||tool==='wall'){
   picks.push(p);if(picks.length<2){draw();return;}
   const [a,b]=picks;picks=[];
   if(Math.hypot(a[0]-b[0],a[1]-b[1])<.1)return;
   if(tool==='wall'){points=[a,b];closed=false;shape='line';}
   else points=[[Math.min(a[0],b[0]),Math.min(a[1],b[1])],[Math.max(a[0],b[0]),Math.min(a[1],b[1])],[Math.max(a[0],b[0]),Math.max(a[1],b[1])],[Math.min(a[0],b[0]),Math.max(a[1],b[1])]];
  }else{const s=+$('pdfPlanScale').value,r=s>0?(tool==='panel'?.3:.075)/s:5;
   points=tool==='panel'?[[p[0]-r,p[1]-r],[p[0]+r,p[1]-r],[p[0]+r,p[1]+r],[p[0]-r,p[1]+r]]:Array.from({length:24},(_,i)=>[p[0]+r*Math.cos(i*Math.PI/12),p[1]+r*Math.sin(i*Math.PI/12)]);shape=tool==='panel'?'rect':'circle';}
  const object={id:'manual-pdf-'+Date.now()+'-'+objects.length,points,closed,shape,kind:tool,source:'manual',reviewed:true,reason:'人工標記',strokeWidth:1};objects.push(object);model.paths.push({...object});selected=object.id;invalidate();update();
 }
 function syncProject(){const p=LX.app.project,plan=p.pdfPlan;$('pdfPlanSummary').classList.toggle('hidden',!plan);
  if(plan){$('pdfPlanInfo').textContent=`${plan.filename} · 第 ${plan.model.page} 頁 · ${p.room.L.toFixed(2)} × ${p.room.W.toFixed(2)} m · ${p.fixtures.length} 盞燈／${LX.cad.allDesks(p).length} 張桌面／${LX.cad.allWalls(p).length} 段牆`;
   $('pdfPlanFloorTarget').value=p.floorTarget||100;
   if(backgroundSource!==plan.model.preview){backgroundSource=plan.model.preview;backgroundImage=new Image();backgroundImage.onload=()=>LX.app.plan.draw();backgroundImage.src=backgroundSource;}
  }else{backgroundImage=null;backgroundSource='';}
 }
 function drawBackground(ctx,view,roomPath){const plan=LX.app.project.pdfPlan;if(!plan||LX.app.view.pdf===false||!backgroundImage?.complete)return;
  const scale=plan.settings.scale,[ox,oy]=plan.origin;ctx.save();ctx.clip(roomPath);ctx.globalAlpha=LX.app.view.heatmap?.18:.8;
  const [x,y]=view.toScreen(-ox*scale,-oy*scale);ctx.drawImage(backgroundImage,x,y,plan.model.width*scale*view.scale,plan.model.height*scale*view.scale);ctx.restore();
 }
 function install(){const app=LX.app;
  for(const method of ['refreshAll','runCompute']){const original=app[method];app[method]=function(...args){const r=original.apply(this,args);syncProject();return r;};}
  $('pdfPlanFilter').innerHTML='<option value="">全部分類</option>'+Object.entries(LX.pdfPlan.kinds).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');$('pdfPlanKind').innerHTML=Object.entries(LX.pdfPlan.kinds).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('btnPdfPlan').onclick=()=>$('filePdfPlan').click();$('filePdfPlan').onchange=async e=>{try{await readFile(e.target.files[0]);}catch(error){alert('PDF 圖面匯入未完成：'+error.message);}finally{e.target.value='';}};
  $('pdfPlanCancel').onclick=()=>$('pdfPlanDlg').close();
  $('pdfPlanPageLoad').onclick=async()=>{try{if(!sourceFile||sourceFileHash!==model.sourceHash)throw Error('請重新上傳原 PDF 以切換頁面。');await readFile(sourceFile,+$('pdfPlanPage').value);}catch(error){$('pdfPlanWarning').textContent=error.message;}};
  $('pdfPlanRatio').onchange=()=>{if($('pdfPlanRatio').value!=='custom'&&$('pdfPlanRatio').value)$('pdfPlanScale').value=(+$('pdfPlanRatio').value*.0254/72).toPrecision(12);$('pdfPlanScaleConfirmed').checked=false;recognize();};
  $('pdfPlanScale').onchange=()=>{if(+$('pdfPlanScale').value===recognizedScale)return;$('pdfPlanRatio').value='custom';$('pdfPlanScaleConfirmed').checked=false;recognize();};
  $('pdfPlanScaleConfirmed').onchange=update;$('pdfPlanReviewed').onchange=update;$('pdfPlanKnown').oninput=calibrate;
  $('pdfPlanRecognize').onclick=recognize;$('pdfPlanCalibrate').onclick=()=>setTool('calibrate');$('pdfPlanFilter').onchange=()=>{update();};
  $('pdfPlanObjects').onclick=e=>{const button=e.target.closest('[data-pdf-id]');if(button){selected=button.dataset.pdfId;update();}};
  $('pdfPlanKind').onchange=e=>{const object=selectedObject();if(!object)return;object.kind=e.target.value;object.reason='人工修正分類';object.reviewed=true;invalidate();update();};
  $('pdfPlanTypeOverride').onchange=e=>{const object=selectedObject();if(!object)return;object.typeId=e.target.value;object.reviewed=true;invalidate();update();};
  $('pdfPlanSame').onclick=()=>{const object=selectedObject();if(!object)return;for(const other of objects)if(LX.pdfPlan.sameSymbol(object,other)){other.kind=object.kind;other.typeId=object.typeId;other.reviewed=true;other.reason='依相同圖形人工套用';}invalidate();update();};
  $('pdfPlanSetBoundary').onclick=()=>{const o=selectedObject();if(o?.closed&&LX.cad.validPolygon(o.points)){boundary=structuredClone(o.points);o.kind='ignore';o.reviewed=true;invalidate();update();}else $('pdfPlanWarning').textContent='請選擇有效封閉輪廓，或使用圈選範圍工具。';};
  document.querySelectorAll('[data-pdf-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.pdfTool));
  $('pdfPlanFinish').onclick=()=>{if(tool!=='boundary'||!LX.cad.validPolygon(picks)){$('pdfPlanWarning').textContent='請圈選至少三點且不自交的邊界。';return;}boundary=picks.slice();setTool('select');invalidate();update();};
  for(const id of ['pdfPlanCeiling','pdfPlanMount','pdfPlanWallHeight','pdfPlanPanelType','pdfPlanDownlightType','pdfPlanTrackType'])$(id).onchange=()=>{invalidate();update();};
  $('pdfPlanFit').onclick=fit;$('pdfPlanZoomIn').onclick=()=>{projection.k*=1.3;draw();};$('pdfPlanZoomOut').onclick=()=>{projection.k/=1.3;draw();};
  const cv=$('pdfPlanPreview');cv.onclick=e=>{if(e.button===0)click(e);};cv.oncontextmenu=e=>e.preventDefault();
  cv.onpointerdown=e=>{if(e.button===2){pan={x:e.clientX,y:e.clientY,ox:projection.x,oy:projection.y};cv.setPointerCapture(e.pointerId);}};
  cv.onpointermove=e=>{if(!pan)return;const r=cv.getBoundingClientRect();projection.x=pan.ox+(e.clientX-pan.x)*cv.width/r.width;projection.y=pan.oy+(e.clientY-pan.y)*cv.height/r.height;draw();};cv.onpointerup=()=>{pan=null;};cv.onpointercancel=()=>{pan=null;};
  cv.addEventListener('wheel',e=>{e.preventDefault();if(!model)return;const p=point(e),at=screen(p),factor=Math.exp(-e.deltaY*.001);projection.k=Math.min(150,Math.max(.05,projection.k*factor));projection.x=at[0]-p[0]*projection.k;projection.y=at[1]-p[1]*projection.k;draw();},{passive:false});
  $('pdfPlanApply').onclick=()=>{
   try{if(!$('pdfPlanScaleConfirmed').checked||!$('pdfPlanReviewed').checked)throw Error('請先完成尺度與分類核對。');const settings=config(),built=LX.pdfPlan.build(model,objects,settings,app.project),p=app.project;app.commit();
    p.cad=null;p.pdfPlan={filename,model:structuredClone(model),objects:structuredClone(objects),settings:structuredClone(settings),origin:built.origin,sourceHash:model.sourceHash,reviewConfirmed:true};
    for(const f of built.fixtures)f.recognitionReviewed=true;
    p.name=filename.replace(/\.pdf$/i,'')+'（第 '+model.page+' 頁）';p.desks=built.desks;p.walls=built.walls;p.calcWalls=true;p.fixtures=built.fixtures;p.dims=[];
    Object.assign(p.room,{polygon:built.polygon,shape:'custom',L:built.width,W:built.length,height:settings.ceiling,wp:0,grid:0});p.floorTarget=p.floorTarget||100;
    app.selection.clear();app.selectedDeskId=null;app.commit();app.refreshAll();app.plan.fit();$('pdfPlanDlg').close();
   }catch(error){$('pdfPlanWarning').textContent=error.message;}
  };
  $('btnPdfPlanEdit').onclick=()=>{const plan=app.project.pdfPlan;if(plan)show(structuredClone(plan.model),plan.filename,plan).catch(e=>alert(e.message));};
  $('vPdfPlan').onchange=e=>{app.view.pdf=e.target.checked;app.plan.draw();};syncProject();
  $('pdfPlanFloorTarget').onchange=e=>{app.project.floorTarget=Math.max(1,Math.min(2000,+e.target.value||100));app.commit();app.requestCompute(false);};
 }
 window.addEventListener('luxcheck-ready',install);
 LX.pdfPlanUI={readFile,show,drawBackground,syncProject};
})(window.LX=window.LX||{});
