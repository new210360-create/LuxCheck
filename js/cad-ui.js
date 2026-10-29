(function (LX) {
  'use strict';
  const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let staged=null,all=[],manual=new Set(),excluded=new Set(),measuring=false,measure=[],projection=null,filename='',lastBuild=null,drawingBoundary=false,boundaryPoints=[];
  const selection=id=>[...$(id).querySelectorAll('input:checked')].map(c=>c.value);
  const options=()=>({
    boundary:$('cadBoundary').value,
    scale:Number($('cadScale').value),
    deskLayers:selection('cadDeskLayers'),
    deskBlocks:selection('cadDeskBlocks'),
    fixtureLayers:selection('cadFixtureLayers'),
    fixtureBlocks:selection('cadFixtureBlocks'),
    wallLayers:selection('cadWallLayers'),
    calcWalls:$('cadCalcWalls')?.checked!==false,
    autoFixtures:$('cadAutoFixtures')?.checked!==false,
    manual:[...manual],
    excluded:[...excluded]
  });
  function checklist(id,values,selected) {
    const el=$(id);if(!el)return;
    el.innerHTML=values.length?values.map(v=>`<label><input type="checkbox" value="${esc(v)}" ${selected.includes(v)?'checked':''}>${esc(v)}</label>`).join(''):'<span class="hint">沒有可選項目</span>';
  }
  function show(model,name,previous) {
    staged=model;filename=name;all=LX.cad.contours(model.paths);manual=new Set(previous?.roles?.manual||[]);excluded=new Set(previous?.roles?.excluded||[]);measure=[];measuring=false;drawingBoundary=false;boundaryPoints=[];
    $('cadFileName').textContent=name+' · '+model.paths.length.toLocaleString()+' 個幾何物件';
    const layers=[...new Set(model.paths.map(p=>p.layer))].sort(),blocks=[...new Set(model.paths.map(p=>p.block).filter(Boolean))].sort();
    checklist('cadDeskLayers',layers,previous?.roles?.deskLayers||layers.filter(v=>/desk|table|桌|工作站|workstation/i.test(v)&&!/chair|椅|ceiling|天花/i.test(v)));
    checklist('cadDeskBlocks',blocks,previous?.roles?.deskBlocks||blocks.filter(v=>/desk|table|桌|工作站|workstation/i.test(v)&&!/chair|椅/i.test(v)));
    checklist('cadFixtureLayers',layers,previous?.roles?.fixtureLayers||layers.filter(v=>/燈|light|lamp|luminaire|fixture|led/i.test(v)));
    checklist('cadFixtureBlocks',blocks,previous?.roles?.fixtureBlocks||blocks.filter(v=>/燈|light|lamp|luminaire|downlight|panel|spot/i.test(v)));
    checklist('cadWallLayers',layers,previous?.roles?.wallLayers||layers.filter(v=>/牆|wall|隔間|柱|partition/i.test(v)));
    $('cadBoundary').innerHTML='<option value="">請選擇空間封閉輪廓</option>'+all.map((p,i)=>`<option value="${p.id}">${i+1}. ${esc(p.layer)}${p.block?' / '+esc(p.block):''} · ${p.area.toFixed(2)} CAD²</option>`).join('');
    const likely=all.find(p=>/room|boundary|space|空間|範圍|外框/i.test(p.layer)&&!/sheet|圖框/i.test(p.layer));
    $('cadBoundary').value=previous?.roles?.boundary||(likely?.id||'');
    const scale=previous?.scale||model.unitScale;
    $('cadUnit').value=[...$('cadUnit').options].some(o=>o.value===String(scale))?String(scale):scale?'custom':'';
    $('cadScale').value=scale||'';$('cadKnown').value='';
    $('cadMeasureInfo').textContent=model.unitScale?'已讀取 CAD 單位。請以圖上尺寸核對，必要時用已知距離校正。':'圖面單位未定義，請指定單位或用已知距離校正。';
    $('cadClearFixtures').checked=!previous;
    $('cadFinishBoundary').disabled=true;$('cadDlg').showModal();draw();
  }
  function draw() {
    if(!staged)return;lastBuild=null;
    const cv=$('cadPreview'),ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
    const boundary=all.find(p=>p.id===$('cadBoundary').value),b=boundary&&!drawingBoundary?LX.cad.bounds([boundary]):staged.bounds;
    const k=Math.min((W-90)/(b.w||1),(H-90)/(b.h||1));
    projection={k,b,ox:(W-b.w*k)/2-b.minX*k,oy:(H-b.h*k)/2+b.maxY*k};
    const screen=p=>[p[0]*k+projection.ox,-p[1]*k+projection.oy];
    function trace(p){ctx.beginPath();p.points.forEach((pt,i)=>{const s=screen(pt);i?ctx.lineTo(...s):ctx.moveTo(...s);});if(p.closed)ctx.closePath();}
    ctx.fillStyle='#0b1420';ctx.fillRect(0,0,W,H);ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
    ctx.strokeStyle='#50647c';ctx.lineWidth=0.8;
    for(const p of staged.paths){trace(p);ctx.stroke();}
    let message='請先指定圖面單位與空間邊界。';
    try {
      lastBuild=LX.cad.build(staged,options());
      const ids=new Set(lastBuild.desks.map(d=>d.sourceId));
      for(const p of all.filter(p=>ids.has(p.id))){trace(p);ctx.fillStyle='rgba(56,189,248,.28)';ctx.fill();ctx.strokeStyle='#38bdf8';ctx.lineWidth=2.4;ctx.stroke();}
      if(lastBuild.fixtures&&lastBuild.fixtures.length){
        for(const f of lastBuild.fixtures){
          const rawX=b.minX+f.x/lastBuild.scale,rawY=b.maxY-f.y/lastBuild.scale;
          const [sx,sy]=screen([rawX,rawY]);
          if(f.typeId.includes('panel')){
            ctx.fillStyle='#fef08a';ctx.strokeStyle='#eab308';ctx.lineWidth=1.5;
            ctx.fillRect(sx-6,sy-6,12,12);ctx.strokeRect(sx-6,sy-6,12,12);
          }else{
            ctx.fillStyle='#38bdf8';ctx.strokeStyle='#ffffff';ctx.lineWidth=1.2;
            ctx.beginPath();ctx.arc(sx,sy,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();
          }
        }
      }
      message=`${lastBuild.width.toFixed(2)} × ${lastBuild.length.toFixed(2)} m · ${lastBuild.area.toFixed(2)} m² · ${lastBuild.desks.length} 個桌面 · ${(lastBuild.fixtures?.length||0)} 盞燈具（自動辨識）`;
      if(lastBuild.rejected)message+=` · ${lastBuild.rejected} 個輪廓在範圍外或無效，未匯入`;
      $('cadApply').disabled=false;
    }catch(e){message=e.message;$('cadApply').disabled=true;}
    if(boundary){trace(boundary);ctx.strokeStyle='#4ade80';ctx.lineWidth=3;ctx.stroke();}
    for(const p of measure){const [x,y]=screen(p);ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle='#fb923c';ctx.fill();}
    if(boundaryPoints.length){trace({points:boundaryPoints,closed:false});ctx.strokeStyle='#fb923c';ctx.lineWidth=3;ctx.stroke();for(const p of boundaryPoints){ctx.beginPath();ctx.arc(...screen(p),5,0,Math.PI*2);ctx.fillStyle='#fb923c';ctx.fill();}}
    ctx.restore();$('cadPreviewInfo').textContent=drawingBoundary?`圈選空間：已選 ${boundaryPoints.length} 個點，至少 3 點後按「完成圈選」。`:message;
    const unsupported=Object.entries(staged.ignored).filter(([type])=>!['TEXT','MTEXT','DIMENSION','POINT','ATTDEF','ATTRIB','VIEWPORT'].includes(type));
    const notes=[...staged.warnings];if(unsupported.length)notes.push('未作為計算幾何的物件：'+unsupported.map(([t,n])=>`${t} × ${n}`).join('、'));
    if(!lastBuild?.desks.length)notes.push('目前沒有桌面；套用後全部以地面 0 m 計算，可先核對桌面圖層／圖塊或點選封閉輪廓。');
    $('cadWarning').textContent=notes.join('。');
    if(drawingBoundary)$('cadApply').disabled=true;
  }
  async function readFile(file) {
    if(!file)return;if(file.size>30*1024*1024)throw Error('圖檔請小於 30 MB，較大圖面請先另存辦公區域。');
    let data;
    if(/\.dwg$/i.test(file.name)) {
      $('busy').textContent='DWG 本機轉換中，請稍候…';$('busy').classList.remove('hidden');
      try {
        const response=await fetch('/api/cad/convert',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
        if(!response.ok){const error=await response.json();throw Error(error.error||'DWG 轉換失敗');}
        data=await response.arrayBuffer();
      }finally{$('busy').classList.add('hidden');$('busy').textContent='計算中…';}
    }else if(/\.dxf$/i.test(file.name))data=await file.arrayBuffer();
    else throw Error('請選擇 DWG 或 ASCII DXF 圖檔。');
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{const head=new TextDecoder('ascii').decode(data.slice(0,10000));text=new TextDecoder(/ANSI_950|BIG5/i.test(head)?'big5':'windows-1252').decode(data);}
    text=text.replace(/\\U\+([0-9A-F]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    const model=LX.cad.parse(text);
    model.sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
    show(model,file.name,null);
  }
  function syncProject() {
    const app=LX.app,p=app.project,cad=p.cad;
    const allDesks=LX.cad.allDesks?LX.cad.allDesks(p):(cad?.desks||[]);
    const zoneMode=LX.cad.hasZoneMode?LX.cad.hasZoneMode(p):!!cad;
    $('cadSummary').classList.toggle('hidden',!cad);
    for(const id of ['roomShape','roomL','roomW','cutL','cutW','polyText','btnApplyPoly'])$(id).disabled=!!cad;
    $('roomWp').disabled=!!zoneMode;
    $('roomWp').title=zoneMode?'桌面模式固定桌面 0.75 m，其他地面 0 m':'';
    $('polyFields').classList.toggle('hidden',!!cad||p.room.shape!=='custom');
    $('roomShape').closest('.row').classList.toggle('hidden',!!cad);
    if(cad){$('cadInfo').textContent=`${cad.filename} · ${p.room.L.toFixed(2)} × ${p.room.W.toFixed(2)} m · ${allDesks.length} 個桌面`;$('floorTarget').value=p.floorTarget||100;}
    const section=$('surfaceSection');
    section.classList.toggle('hidden',!app.result);
    if(zoneMode&&app.result?.surfaceStats){
      const r=app.result,rows=[];
      if(r.surfaceStats.desk.n)rows.push(['全部桌面',r.surfaceStats.desk,p.target.Em,p.target.U0,'']);
      if(r.surfaceStats.floor.n)rows.push(['地面',r.surfaceStats.floor,p.floorTarget||100,0.4,'']);
      for(const d of r.deskStats||[])rows.push([d.name,d,p.target.Em,p.target.U0,d.id]);
      
      let html = '';
      if (r.zones && r.zones.length > 1) {
        html += `<div style="margin-bottom:12px;padding:8px;background:rgba(2,132,199,0.12);border:1px solid rgba(56,189,248,0.3);border-radius:7px">
          <div style="font-weight:bold;color:#38bdf8;font-size:12px;display:flex;justify-content:space-between">
            <span>🏛️ 多房間隔間獨立漫射（分區 RCR 反射）</span>
            <span style="color:#a5f3fc">${r.zones.length} 個獨立隔間</span>
          </div>
          <p class="hint" style="margin:4px 0 6px">系統依實體隔間牆自動切分獨立封閉房間，依各室長寬周長與淨高獨立計算室指數 (RCR)，各空間漫射光不穿牆外溢。</p>
          <table class="surface-table">
            <tr><th>隔間分區</th><th>面積 m²</th><th>室指數 RCR</th><th>燈數</th><th>漫射 Eind</th><th>平均 lx</th></tr>
            ${r.zones.map(z => `<tr><td>${esc(z.name)}</td><td>${z.area}</td><td>${z.rcr}</td><td>${z.fixturesCount}</td><td style="color:#facc15">${z.Eind} lx</td><td><b>${z.EdirAvg + z.Eind}</b></td></tr>`).join('')}
          </table>
        </div>`;
      }

      html += '<p class="hint">桌面 (0.75m) 與地面 (0m) 連動檢核：同時評估桌面平均照度、均齊度 U₀ 與達標覆蓋率（≥80%）。</p><table class="surface-table"><tr><th>區域</th><th>平均 lx</th><th>最小 lx</th><th>U₀</th><th>覆蓋率</th></tr>'+rows.map(([name,s,target,u0,did])=>{const cov=s.coverage??100;const ok=s.n&&s.Eavg>=target&&s.U0>=u0&&(did===''&&name==='地面'?true:cov>=80);return `<tr class="${ok?'surface-ok':'surface-bad'}" ${did?`data-desk-id="${esc(did)}" style="cursor:pointer" title="點擊選取此辦公桌"`:''}><td>${esc(name)}${!s.n?'（無格點）':''}</td><td>${s.n?s.Eavg.toFixed(0):'—'}</td><td>${s.n?s.Emin.toFixed(0):'—'}</td><td>${s.n?s.U0.toFixed(2):'—'}</td><td>${s.n?Math.round(cov)+'%':'—'}</td></tr>`;}).join('')+'</table>';
      $('surfaceResults').innerHTML = html;
      $('surfaceResults').querySelectorAll('tr[data-desk-id]').forEach(tr=>{
        tr.onclick=()=>{app.selectedDeskId=tr.dataset.deskId;app.selection.clear();app.onSelectionChanged();};
      });
    } else if (app.result) {
      const r=app.result;
      let html = '';
      if (r.zones && r.zones.length > 1) {
        html += `<div style="margin-bottom:12px;padding:8px;background:rgba(2,132,199,0.12);border:1px solid rgba(56,189,248,0.3);border-radius:7px">
          <div style="font-weight:bold;color:#38bdf8;font-size:12px;display:flex;justify-content:space-between">
            <span>🏛️ 多房間隔間獨立漫射（分區 RCR 反射）</span>
            <span style="color:#a5f3fc">${r.zones.length} 個獨立隔間</span>
          </div>
          <table class="surface-table">
            <tr><th>隔間分區</th><th>面積 m²</th><th>室指數 RCR</th><th>燈數</th><th>漫射 Eind</th><th>平均 lx</th></tr>
            ${r.zones.map(z => `<tr><td>${esc(z.name)}</td><td>${z.area}</td><td>${z.rcr}</td><td>${z.fixturesCount}</td><td style="color:#facc15">${z.Eind} lx</td><td><b>${z.EdirAvg + z.Eind}</b></td></tr>`).join('')}
          </table>
        </div>`;
      }
      html += `<p class="hint">目前為整室均勻工作面（高度 ${p.room.wp} m）：達標覆蓋率 <b>${Math.round(r.coverage??100)}%</b>（有效光束覆蓋 ${Math.round(r.beamCoverage??100)}%）。<br>👉 可於左側「辦公桌面配置與套用」點選 <b>➕ 點擊增設辦公桌</b> 或 <b>批次排入辦公桌</b>，立即啟用桌面 0.75m 與地面 0m 分區連動評估。</p>`;
      $('surfaceResults').innerHTML = html;
    }
  }
  function install() {
    const app=LX.app;
    for(const method of ['refreshAll','runCompute']){const original=app[method];app[method]=function(...args){const result=original.apply(this,args);syncProject();return result;};}
    $('btnCad').onclick=()=>$('fileCad').click();
    $('fileCad').onchange=async e=>{try{await readFile(e.target.files[0]);}catch(error){alert('CAD 匯入未完成：'+error.message);}finally{e.target.value='';}};
    $('cadCancel').onclick=()=>$('cadDlg').close();
    $('cadUnit').onchange=()=>{if($('cadUnit').value&&$('cadUnit').value!=='custom')$('cadScale').value=$('cadUnit').value;draw();};
    for(const id of ['cadBoundary','cadDeskLayers','cadDeskBlocks'])$(id).addEventListener('change',draw);
    $('cadScale').oninput=()=>{$('cadUnit').value='custom';draw();};
    $('cadMeasure').onclick=()=>{drawingBoundary=false;measuring=true;measure=[];$('cadMeasureInfo').textContent='請在預覽點兩個端點，再填入實際距離（公尺）。';draw();};
    $('cadDrawBoundary').onclick=()=>{drawingBoundary=true;measuring=false;boundaryPoints=[];$('cadFinishBoundary').disabled=true;draw();};
    $('cadFinishBoundary').onclick=()=>{
      if(!LX.cad.validPolygon(boundaryPoints)){$('cadWarning').textContent='圈選邊界無效或自交，請重新圈選。';return;}
      const id='manual-boundary-'+Date.now();staged.paths.push({id,layer:'手動圈選空間',block:'',group:'',points:boundaryPoints.slice(),closed:true});all=LX.cad.contours(staged.paths);
      $('cadBoundary').add(new Option('手動圈選空間',id));$('cadBoundary').value=id;drawingBoundary=false;boundaryPoints=[];$('cadFinishBoundary').disabled=true;draw();
    };
    function calibrate(){if(measure.length!==2)return;const raw=Math.hypot(measure[0][0]-measure[1][0],measure[0][1]-measure[1][1]),known=+$('cadKnown').value;
      $('cadMeasureInfo').textContent=`CAD 距離 ${raw.toFixed(4)} 單位；輸入兩點實際距離（公尺）完成校正。`;
      if(raw>0&&known>0){$('cadScale').value=(known/raw).toPrecision(12);$('cadUnit').value='custom';$('cadMeasureInfo').textContent=`已校正：兩點距離 ${known} m。請再核對另一組尺寸。`;draw();}}
    $('cadKnown').oninput=calibrate;
    $('cadPreview').onclick=e=>{
      if(!projection)return;const rect=e.target.getBoundingClientRect(),sx=(e.clientX-rect.left)*e.target.width/rect.width,sy=(e.clientY-rect.top)*e.target.height/rect.height;
      let p=[(sx-projection.ox)/projection.k,(projection.oy-sy)/projection.k];
      if(measuring||drawingBoundary){let best=12/projection.k;const raw=p;for(const path of staged.paths)for(const v of path.points){const d=Math.hypot(v[0]-raw[0],v[1]-raw[1]);if(d<best){best=d;p=v;}}
        if(drawingBoundary){boundaryPoints.push(p);$('cadFinishBoundary').disabled=boundaryPoints.length<3;draw();return;}
        measure.push(p);if(measure.length===2){measuring=false;calibrate();}draw();return;}
      const hits=all.filter(c=>c.id!==$('cadBoundary').value&&LX.calc.pointInPoly(p[0],p[1],c.points)).sort((a,b)=>a.area-b.area);
      const hit=hits[0];if(!hit)return;
      const selected=lastBuild?.desks.some(d=>d.sourceId===hit.id);
      if(selected){excluded.add(hit.id);manual.delete(hit.id);}else{manual.add(hit.id);excluded.delete(hit.id);}draw();
    };
    function applyBuiltCad(built,opts){
      const p=app.project,previousCad=p.cad;app.commit();
      p.cad={filename,sourceHash:staged.sourceHash,desks:built.desks,walls:built.walls||[],background:built.background,sourcePaths:staged.paths,sourceWarnings:staged.warnings,ignored:staged.ignored,unit:staged.unit,scale:built.scale,origin:built.origin,roles:opts||options()};
      p.walls=built.walls||[];
      p.calcWalls=opts?.calcWalls!==false;
      p.floorTarget=p.floorTarget||100;p.room.polygon=built.polygon;p.room.shape='custom';p.room.L=built.width;p.room.W=built.length;p.room.wp=0;p.room.grid=0;
      p.room.height=p.room.H=Math.max(3.0,p.room.height||p.room.H||3.0,...(built.fixtures||[]).map(f=>f.z));
      if(!p.name||/^未命名專案$|^開放式辦公室（範例）$/.test(p.name))p.name=filename.replace(/\.(dwg|dxf)$/i,'');
      if(built.fixtures&&built.fixtures.length>0&&$('cadAutoFixtures')?.checked!==false){
        p.fixtures=built.fixtures;
      }else if($('cadClearFixtures').checked){
        p.fixtures=[];
      }else if(previousCad?.scale&&previousCad.origin&&previousCad.sourceHash===staged.sourceHash){
        for(const f of p.fixtures){
          const rawX=f.x/previousCad.scale+previousCad.origin[0],rawY=previousCad.origin[1]-f.y/previousCad.scale;
          f.x=(rawX-built.origin[0])*built.scale;f.y=(built.origin[1]-rawY)*built.scale;
        }
        p.fixtures=p.fixtures.filter(f=>LX.calc.pointInPoly(f.x,f.y,built.polygon));
      }
      app.selection.clear();app.commit();app.refreshAll();app.plan.fit();$('cadDlg').close();
    }
    $('cadApply').onclick=()=>{
      try{
        const built=LX.cad.build(staged,options());
        applyBuiltCad(built,options());
      }catch(error){$('cadWarning').textContent=error.message;}
    };
    const autoBtn=$('cadAutoAll');
    if(autoBtn)autoBtn.onclick=()=>{
      try{
        const scale=staged.unitScale||0.001;
        $('cadScale').value=scale;
        let bCand=all.find(p=>/room|boundary|space|空間|範圍|外框/i.test(p.layer)&&!/sheet|圖框/i.test(p.layer));
        if(!bCand){
          const rooms=all.filter(p=>{const a=p.area*scale*scale;return a>=12&&a<=2500;}).sort((a,b)=>b.area-a.area);
          if(rooms.length)bCand=rooms[0];
        }
        if(bCand)$('cadBoundary').value=bCand.id;
        const dLayers=[...new Set(staged.paths.map(p=>p.layer))].filter(v=>/desk|table|桌|家具|工作站/i.test(v)&&!/chair|椅|天花/i.test(v));
        const fLayers=[...new Set(staged.paths.map(p=>p.layer))].filter(v=>/燈|light|lamp|luminaire|fixture|led/i.test(v));
        const wLayers=[...new Set(staged.paths.map(p=>p.layer))].filter(v=>/牆|wall|隔間|柱|partition/i.test(v));
        const opts={
          boundary:$('cadBoundary').value||(all[0]?all[0].id:''),
          scale,
          deskLayers:dLayers,
          deskBlocks:[],
          fixtureLayers:fLayers,
          fixtureBlocks:[],
          wallLayers:wLayers,
          calcWalls:true,
          autoFixtures:true,
          manual:[],
          excluded:[]
        };
        const built=LX.cad.build(staged,opts);
        applyBuiltCad(built,opts);
      }catch(error){$('cadWarning').textContent='一鍵智慧帶入提示：'+error.message;}
    };
    $('btnCadEdit').onclick=()=>{const cad=app.project.cad;if(cad)show({sourceHash:cad.sourceHash,paths:cad.sourcePaths,unit:cad.unit,unitScale:cad.scale,warnings:cad.sourceWarnings||[],ignored:cad.ignored||{},bounds:LX.cad.bounds(cad.sourcePaths)},cad.filename,cad);};
    $('btnCadRemove').onclick=()=>{app.project.cad=null;app.project.room.wp=0.75;app.commit();app.refreshAll();};
    $('floorTarget').onchange=e=>{app.project.floorTarget=Math.max(1,Math.min(2000,+e.target.value||100));app.commit();app.requestCompute(false);};
    $('vCad').onchange=e=>{app.view.cad=e.target.checked;app.plan.draw();};
    syncProject();
  }
  window.addEventListener('luxcheck-ready',install);
  LX.cadUI={readFile,show,syncProject};
})(window.LX=window.LX||{});
