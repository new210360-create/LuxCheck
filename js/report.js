/* =========================================================================
 * report.js — 檢核報告（新視窗，可直接列印 / 另存 PDF）
 * ========================================================================= */
(function (LX) {
  'use strict';

  const fmt = (v, d = 0) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function open(app) {
    const p = app.project;
    const res = LX.calc.compute(p); // 以完整精度重新計算
    const ev = LX.evaluate(res);
    const std = LX.STANDARDS.find((s) => s.id === p.standardId) || { name: '自訂' };
    const img = app.plan.renderImage(1800, 1150);
    const bom = LX.bomRows();
    const now = new Date();
    const pass = (o) => (o.ok ? '<b class="ok">合格</b>' : '<b class="bad">不合格</b>');
    const ugr = res.ugr ? res.ugr.value : null;
    const advice = LX.advise(res, ev);

    const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
<title>${esc(p.name)} - 照明照度檢核報告</title>
<style>
  body{font-family:system-ui,"Microsoft JhengHei","PingFang TC",sans-serif;color:#111;margin:0;padding:28px 36px;font-size:12.5px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;border-left:4px solid #0369a1;padding-left:8px;margin:22px 0 8px}
  .meta{color:#555;margin-bottom:10px}
  table{border-collapse:collapse;width:100%;margin:6px 0}
  th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left} th{background:#f1f5f9}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  .ok{color:#15803d}.bad{color:#b91c1c}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .summary{font-size:16px;padding:10px 14px;border-radius:8px;margin:10px 0}
  .summary.ok{background:#dcfce7}.summary.bad{background:#fee2e2}
  img{width:100%;border:1px solid #cbd5e1}
  .note{color:#555;font-size:11px;line-height:1.6}
  .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
  .sign div{border-top:1px solid #333;padding-top:4px;text-align:center;color:#555}
  .bar{position:sticky;top:0;background:#fff;padding:6px 0 10px;text-align:right}
  .bar button{font-size:14px;padding:6px 16px;cursor:pointer}
  @media print{.bar{display:none} body{padding:0} h2{break-after:avoid} table,img{break-inside:avoid}}
</style></head><body>
<div class="bar"><button onclick="window.print()">列印 / 另存 PDF</button></div>
<h1>室內照明照度檢核報告</h1>
<div class="meta">專案：<b>${esc(p.name)}</b>　｜　空間類型：${esc(std.name)}　｜　產出日期：${now.toLocaleString('zh-TW')}　｜　LuxCheck</div>
<div class="summary ${res.count && ev.Em.ok && ev.U0.ok && ev.UGR.ok && ev.Ra.ok && ev.LPD.ok ? 'ok' : 'bad'}">
  綜合判定：<b>${res.count && ev.Em.ok && ev.U0.ok && ev.UGR.ok && ev.Ra.ok && ev.LPD.ok ? '全部檢核項目合格' : '有檢核項目未通過'}</b>
</div>

<h2>1. 檢核結果</h2>
<table>
<tr><th>項目</th><th>計算值</th><th>標準要求</th><th>判定</th></tr>
<tr><td>維持平均照度 Ē<sub>m</sub></td><td class="n">${fmt(res.Eavg)} lx</td><td>≥ ${p.target.Em} lx</td><td>${pass(ev.Em)}</td></tr>
<tr><td>照度均齊度 U<sub>0</sub> = E<sub>min</sub>/Ē</td><td class="n">${fmt(res.U0, 2)}</td><td>≥ ${p.target.U0}</td><td>${pass(ev.U0)}</td></tr>
<tr><td>統一眩光值 UGR（估算）</td><td class="n">${ugr == null ? '—' : fmt(ugr, 1)}</td><td>≤ ${p.target.UGR}</td><td>${pass(ev.UGR)}</td></tr>
<tr><td>演色性 Ra（最低者）</td><td class="n">${ev.Ra.v == null ? '—' : ev.Ra.v}</td><td>≥ ${p.target.Ra}</td><td>${pass(ev.Ra)}</td></tr>
<tr><td>照明功率密度 LPD</td><td class="n">${fmt(res.lpd, 2)} W/m²</td><td>≤ ${p.lpdLimit} W/m²</td><td>${pass(ev.LPD)}</td></tr>
<tr><td>最小 / 最大照度</td><td class="n">${fmt(res.Emin)} / ${fmt(res.Emax)} lx</td><td>—</td><td>—</td></tr>
<tr><td>直接光 / 間接光（平均）</td><td class="n">${fmt(res.Edirect)} / ${fmt(res.Eind)} lx</td><td>—</td><td>—</td></tr>
<tr><td>單位照度功率密度</td><td class="n">${fmt(res.lpd100, 2)} W/m²/100 lx</td><td>—</td><td>—</td></tr>
</table>
<ul>${advice.map((a) => `<li>${esc(a.t)}</li>`).join('')}</ul>

<h2>2. 工作面照度分布（高度 ${p.room.wp} m）</h2>
<img src="${img}" alt="照度分布圖">
<p class="note">色階：${app.view.colorMode === 'target' ? `以目標照度 ${p.target.Em} lx 為中心（0 ~ ${p.target.Em * 2} lx）` : '0 ~ 最大照度'}。虛線框為計算區（排除牆邊 ${p.room.margin} m）。計算格點間距約 ${fmt(res.spacing, 2)} m，共 ${res.grid.nx}×${res.grid.ny} 點。</p>

<div class="grid">
<div>
<h2>3. 空間條件</h2>
<table>
<tr><th>樓地板面積</th><td class="n">${fmt(res.area, 2)} m²</td></tr>
<tr><th>空間尺寸（外框）</th><td class="n">${fmt(res.bounds.w, 2)} × ${fmt(res.bounds.h, 2)} m</td></tr>
<tr><th>天花高度</th><td class="n">${p.room.height} m</td></tr>
<tr><th>工作面高度</th><td class="n">${p.room.wp} m</td></tr>
<tr><th>反射率 天花/牆/地</th><td class="n">${Math.round(p.room.rhoC * 100)}% / ${Math.round(p.room.rhoW * 100)}% / ${Math.round(p.room.rhoF * 100)}%</td></tr>
<tr><th>維護係數 MF</th><td class="n">${p.room.mf}</td></tr>
</table>
</div>
<div>
<h2>4. UGR 觀察點（眼高 1.2 m）</h2>
<table><tr><th>視線方向</th><th>位置 (x, y)</th><th>UGR</th></tr>
${res.ugr ? res.ugr.views.map((v) => `<tr><td>${v.name}</td><td class="n">${fmt(v.eye[0], 1)}, ${fmt(v.eye[1], 1)}</td><td class="n">${fmt(v.ugr, 1)}</td></tr>`).join('') : '<tr><td colspan="3">—</td></tr>'}
</table>
<p class="note">背景亮度 L<sub>b</sub> ≈ ${res.ugr ? fmt(res.ugr.Lb, 1) : '—'} cd/m²（以間接照度估算）。</p>
</div>
</div>

<h2>5. 燈具清單</h2>
<table>
<tr><th>#</th><th>小樣</th><th>型號</th><th>數量</th><th>流明 (lm)</th><th>瓦數 (W)</th><th>光效 (lm/W)</th><th>光束角</th><th>色溫</th><th>Ra</th><th>安裝/開孔</th><th>高度 (m)</th><th>小計 (W)</th></tr>
${bom.map((g, i) => `<tr><td>${i + 1}</td><td style="text-align:center;background:#0f172a;padding:3px">${LX.fixtureThumbSvg ? LX.fixtureThumbSvg(g.t, 34) : ''}</td><td>${esc(g.t.name)}${g.t.series ? ` <small style="color:#0369a1">[${esc(g.t.series)}]</small>` : ''}${g.t.source ? ` <small>(${g.t.source})</small>` : ''}</td><td class="n">${g.n}</td><td class="n">${g.f.lumens}</td><td class="n">${g.f.watts}</td><td class="n">${fmt(g.f.lumens / g.f.watts)}</td><td class="n">${g.f.beam}°</td><td class="n">${g.t.cct || '—'}K</td><td class="n">${g.t.cri || '—'}</td><td>${LX.mountName(g.t.mount)}${g.t.cutout ? ` / ${esc(g.t.cutout)}` : ''}</td><td class="n">${g.f.z}</td><td class="n">${fmt(g.n * g.f.watts, 1)}</td></tr>`).join('')}
<tr><th colspan="3">合計</th><th class="n">${res.count}</th><th colspan="8"></th><th class="n">${fmt(res.totalW, 1)}</th></tr>
</table>

<h2>6. 計算方法與聲明</h2>
<p class="note">
直接光以逐點法（Point-by-Point）依各燈具配光曲線（IES LM-63 / EULUMDAT 或依光束角產生之通用配光）計算，線型燈具分段處理；
間接光以積分球分光通量法估算並均勻分布於工作面；UGR 依 CIE 117 公式與 Guth 位置指數於各牆中點觀察者位置估算。
標準值參考 CNS 12112 / EN 12464-1 辦公類別，本報告為設計階段參考，正式送審請以最新公告法規、廠商實測配光檔及專業照明計算軟體複核，並由專業技師簽證。
</p>
<div class="sign"><div>設計者</div><div>審核</div><div>日期</div></div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('瀏覽器阻擋了彈出視窗，請允許後再試。'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  LX.report = { open };
})((window.LX = window.LX || {}));
