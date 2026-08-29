/*
 * STL to 木取り図作成「きどりん」 for CNC by Mura-lab
 * Copyright (c) 2026 Hiroyuki Muramatsu / Mura-lab
 * https://gijyutu.com/main/
 * Released under the MIT License
 */

function toHalfWidth(str){
  if (str == null) return '';
  return String(str)
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[．]/g, '.')
    .replace(/[－]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/[，]/g, ',')
    .replace(/[　\s]/g, '');
}

function sanitizeNumericString(str){
  const s = toHalfWidth(str);
  let t = s.replace(/[^0-9.+-]/g, '');
  t = t.replace(/[+-]/g, (m, offset)=> (offset===0 ? m : ''));
  const firstDot = t.indexOf('.');
  if (firstDot !== -1){
    t = t.slice(0, firstDot+1) + t.slice(firstDot+1).replace(/\./g,'');
  }
  return t;
}

function normalizeNumericInput(el){
  if (!el) return;
  const before = el.value ?? '';
  const after = sanitizeNumericString(before);
  if (before !== after) el.value = after;
}

const PART_COLORS = ['#dbeafe','#fde68a','#fecdd3','#d1fae5','#e9d5ff','#fed7aa','#bfdbfe','#fbcfe8','#fde2e4','#ddd6fe','#c7f9cc','#faedcd'];
const partColorMap = new Map();

function formatMm(value){
  return String(Math.round((Number(value) || 0) * 10) / 10);
}
function toPartKey(w, h){
  const a = Math.round(Math.max(w, h));
  const b = Math.round(Math.min(w, h));
  return `${a}x${b}`;
}

function toShapeKey(w, h, projection, bounds){
  const dimKey = toPartKey(w, h);
  const Q = 4; 
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  const vset = new Set();
  projection.forEach(tri => {
    [tri.p1, tri.p2, tri.p3].forEach(p => {
      const nx = Math.round((p.x - bounds.minX) / rangeX * 100 / Q) * Q;
      const ny = Math.round((p.y - bounds.minY) / rangeY * 100 / Q) * Q;
      vset.add(`${nx},${ny}`);
    });
  });
  const shapeHash = Array.from(vset).sort().join('|');
  return `${dimKey}__${shapeHash}`;
}

function getColorForPartKey(key){
  if (!partColorMap.has(key)) partColorMap.set(key, PART_COLORS[partColorMap.size % PART_COLORS.length]);
  return partColorMap.get(key);
}

function rotatedBBoxRel(w,h,angleDeg){
  const rad = angleDeg * Math.PI/180;
  const cx = w/2, cy = h/2;
  const pts = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}].map(p=>{
    const dx=p.x-cx, dy=p.y-cy;
    return {x: dx*Math.cos(rad) - dy*Math.sin(rad) + cx, y: dx*Math.sin(rad) + dy*Math.cos(rad) + cy};
  });
  const minX=Math.min(...pts.map(p=>p.x));
  const maxX=Math.max(...pts.map(p=>p.x));
  const minY=Math.min(...pts.map(p=>p.y));
  const maxY=Math.max(...pts.map(p=>p.y));
  return {minX, minY, maxX, maxY, width:maxX-minX, height:maxY-minY};
}

function getBoardsSpecSafe(){
  return (window.sheets && Array.isArray(window.sheets)) ? window.sheets : getBoardsSpec();
}

function findBoardForPart(partEl, specs){
  specs = specs || getBoardsSpecSafe();
  const w = parseFloat(partEl.dataset.partW || '0') || 0;
  const h = parseFloat(partEl.dataset.partH || '0') || 0;
  const x = parseFloat(partEl.dataset.x || '0') || 0;
  const angle = parseFloat(partEl.dataset.angle || '0') || 0;
  const bb = rotatedBBoxRel(w,h,angle);
  const centerX = x + (bb.minX + bb.maxX) / 2;
  let best = null;
  let bestDist = Infinity;
  specs.forEach((s, idx)=>{
    const d = Math.abs(centerX - (s.xOffset + s.length/2));
    if (d < bestDist){ bestDist = d; best = {index: idx, spec: s}; }
  });
  return best;
}

function isPartAcrossGrain(partEl){
  const w = parseFloat(partEl.dataset.partW || '0') || 0;
  const h = parseFloat(partEl.dataset.partH || '0') || 0;
  const angle = ((parseFloat(partEl.dataset.angle || '0') || 0) % 360 + 360) % 360;
  if (w <= 0 || h <= 0) return false;
  const longAxisOriginal = (w >= h) ? 'x' : 'y';
  const longAxisNow = (angle % 180 === 90) ? (longAxisOriginal === 'x' ? 'y' : 'x') : longAxisOriginal;
  return longAxisNow !== 'x';
}

function updatePartBadgePosition(partEl){
  const badge = partEl.querySelector('.part-no-badge');
  const grainTag = partEl.querySelector('.part-grain-tag');
  if (!badge) return;
  const w = parseFloat(partEl.dataset.partW || '0') || 0;
  const h = parseFloat(partEl.dataset.partH || '0') || 0;
  const angle = parseFloat(partEl.dataset.angle || '0') || 0;
  const bb = rotatedBBoxRel(w,h,angle);
  badge.setAttribute('transform', `translate(${bb.minX + 14} ${bb.minY + 14})`);
  if (grainTag){
    grainTag.setAttribute('x', String(Math.max(bb.minX + 32, 6)));
    grainTag.setAttribute('y', String(Math.max(bb.minY + 14, 10)));
  }
}

function refreshPartVisualState(partEl){
  if (!partEl) return;
  const warning = isPartAcrossGrain(partEl);
  partEl.classList.toggle('grain-warning', warning);
  const grainTag = partEl.querySelector('.part-grain-tag');
  if (grainTag){
    grainTag.style.display = warning ? 'block' : 'none';
    grainTag.style.fill = '#b42318';
    grainTag.style.fontWeight = '700';
  }
  const outline = partEl.querySelector('.part-outline');
  if (outline){
    outline.setAttribute('stroke', warning ? '#b42318' : 'black');
    outline.setAttribute('stroke-width', warning ? '0.9' : '0.5');
  }
  const dimText = partEl.querySelector('.part-dim-text');
  if (dimText){
    dimText.setAttribute('fill', warning ? '#b42318' : '#111');
    dimText.style.fontWeight = warning ? '700' : '400';
  }
  const badgeCircle = partEl.querySelector('.part-no-circle');
  if (badgeCircle){
    badgeCircle.setAttribute('stroke', warning ? '#b42318' : '#333');
    badgeCircle.setAttribute('stroke-width', warning ? '1.2' : '0.8');
  }
  updatePartBadgePosition(partEl);
}

function collectYieldData(){
  const svg = document.querySelector('#svg-container svg');
  if (!svg) return null;
  const specs = getBoardsSpecSafe();
  const rows = [];
  let totalBoardArea = 0;
  let totalUsedArea = 0;
  specs.forEach((s, i)=>{
    const boardArea = Math.max(0, s.length * s.width);
    let usedArea = 0;
    Array.from(svg.querySelectorAll('g[data-x][id^="part-"]')).forEach(p=>{
      const board = findBoardForPart(p, specs);
      if (!board || board.index !== i) return;
      usedArea += (parseFloat(p.dataset.partW || '0') || 0) * (parseFloat(p.dataset.partH || '0') || 0);
    });
    totalBoardArea += boardArea;
    totalUsedArea += usedArea;
    rows.push({label:`板${i + 1}`, boardArea, usedArea, rate: boardArea > 0 ? (usedArea / boardArea * 100) : 0});
  });
  return {rows, totalBoardArea, totalUsedArea, overall: totalBoardArea > 0 ? (totalUsedArea / totalBoardArea * 100) : 0};
}

function getYieldHtml(){
  const data = collectYieldData();
  if (!data) return 'STLを読み込むと材料利用率が表示されます。';
  const rowsHtml = data.rows.map(r=>`<div class="yield-row"><span>${r.label}</span><span><span class="yield-rate">${r.rate.toFixed(1)}%</span> <span class="sub">(${formatMm(r.usedArea)} / ${formatMm(r.boardArea)} mm²)</span></span></div>`).join('');
  return `${rowsHtml}<div class="yield-row"><span><strong>全体</strong></span><span><strong class="yield-rate">${data.overall.toFixed(1)}%</strong> <span class="sub">(${formatMm(data.totalUsedArea)} / ${formatMm(data.totalBoardArea)} mm²)</span></span></div>`;
}

function renderYieldInfo(){
  const el = document.getElementById('yieldInfo');
  if (el) el.innerHTML = getYieldHtml();
}

function getGrainWarningsHtml(){
  const svg = document.querySelector('#svg-container svg');
  if (!svg) return '部品の長い辺が木目方向と一致しないときに注意が表示されます。';
  const warnings = Array.from(svg.querySelectorAll('g[data-x][id^="part-"]')).filter(p=>isPartAcrossGrain(p));
  if (!warnings.length){
    return '<div class="ok-text">木目方向の警告はありません。</div><div class="sub">木目は板の長手方向です。部品の長い辺が木目（板の長手方向）とそろっていない場合に注意を表示します。</div>';
  }
  const items = warnings.map(p=>`<li>${p.dataset.partLabel || p.id} の長い辺が木目方向と一致していません。</li>`).join('');
  return `<div class="warning-text">${warnings.length}個の部品で木目方向の注意があります。</div><ul>${items}</ul><div class="sub">木目方向 = 強度の学習用警告です。必要に応じて向きを再確認してください。</div>`;
}

function renderGrainWarnings(){
  const el = document.getElementById('grainWarnings');
  if (el) el.innerHTML = getGrainWarningsHtml();
}

function collectBomItems(){
  const svg = document.querySelector('#svg-container svg');
  if (!svg) return null;
  const groups = new Map();
  Array.from(svg.querySelectorAll('g[data-x][id^="part-"]')).forEach(p=>{
    const w = parseFloat(p.dataset.partW || '0') || 0;
    const h = parseFloat(p.dataset.partH || '0') || 0;
    const color = p.dataset.partColor || getColorForPartKey(toPartKey(w, h));
    if (!groups.has(color)) groups.set(color, {w:Math.max(w,h), h:Math.min(w,h), count:0, color});
    groups.get(color).count += 1;
  });
  return Array.from(groups.values()).sort((a,b)=> (b.w*b.h) - (a.w*a.h));
}

function getBomHtml(options = {}){
  const items = collectBomItems();
  if (!items) return 'STLを読み込むと部品リストが表示されます。';
  if (!items.length) return '部品はありません。';
  if (options.asTable){
    return `<table class="bom-table"><thead><tr><th class="chip-cell"></th><th>部品寸法</th><th class="count-cell">個数</th></tr></thead><tbody>${items.map(g=>`<tr><td class="chip-cell"><span class="color-chip" style="background:${g.color}"></span></td><td>${Math.round(g.w)} × ${Math.round(g.h)} mm</td><td class="count-cell">${g.count}</td></tr>`).join('')}</tbody></table>`;
  }
  return '<div class="bom-list">' + items.map(g=>`<div class="bom-item"><span class="color-chip" style="background:${g.color}"></span><div class="bom-meta"><div class="bom-name">${Math.round(g.w)} × ${Math.round(g.h)} mm</div><div class="bom-count">${g.count} 個</div></div></div>`).join('') + '</div>';
}

function renderBomList(){
  const el = document.getElementById('bomList');
  if (el) el.innerHTML = getBomHtml();
}

function updateLearningPanels(){ renderYieldInfo(); renderGrainWarnings(); renderBomList(); }

function openHelpWindow(){
      const w = window.open('about:blank', 'helpWindow_' + Date.now(), 'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes');
      if (!w) { alert('ポップアップがブロックされました'); return; }
      const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>ヘルプ</title>
        <style>
          html,body{margin:0;padding:0;background:#fff;}
          body{font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;}
          .bar{padding:10px 12px; border-bottom:1px solid #ddd; display:flex; gap:8px; align-items:center;}
          .bar button{padding:6px 10px; cursor:pointer;}
          .help-wrap{padding:16px 18px;}
          .h-title{margin:6px 0 12px 0; font-size:20px; font-weight:800;}
          .h-head{margin:16px 0 8px 0; font-size:16px; font-weight:800; color:#0b57d0;}
          ul{margin:6px 0 0 22px;}
          li{margin:6px 0; line-height:1.55;}
        </style></head><body>
    <div style="position:fixed;right:16px;bottom:16px;z-index:1000;">
      <button onclick="window.close()" style="padding:8px 14px;font-size:14px;cursor:pointer;">閉じる</button>
    </div>
          <div class="help-wrap">
  <h2 class="h-title">「きどりんfor CNC」の使い方</h2>

  <h3 class="h-head">■ STEP 1　STLファイルを読み込む</h3>
  <ul>
    <li>CAD（Fusion 360・FreeCAD 等）で作成した <strong>STLファイル</strong> を読み込みます。ファイル選択ボタンからか，画面内にドロップしてください。</li>
    <li>読み込むと部品が自動的に板の上に並びます。部品ごとに色分けされます。</li>
    <li>右上の「<strong>3D表示</strong>」ボタンで元の3D形状を確認できます。</li>
  </ul>

  <h3 class="h-head">■ STEP 2　板のサイズ・枚数を設定する</h3>
  <ul>
    <li>「<strong>板1の長さ</strong>」「<strong>板1の幅</strong>」に実際の材料サイズ（mm）を入力します。</li>
    <li>材料が複数枚必要な場合は「<strong>板を追加</strong>」で増やせます。追加後は「<strong>レイアウト初期化</strong>」を押してください。</li>
    <li>「<strong>部品の間隔</strong>」で部品どうしの最小隙間（mm）を設定します。</li>
  </ul>

  <h3 class="h-head">■ STEP 3　部品を配置する</h3>
  <ul>
    <li>部品はマウスで<strong>ドラッグして移動</strong>できます。</li>
    <li><strong>右クリック</strong>（タッチはダブルタップ）で90度回転します。</li>
    <li>部品の長い方向が木目方向（板の長手方向）に合うように配置してください。合っていない部品は<strong>赤色の警告</strong>が表示されます。</li>
    <li>「<strong>Zoom+／Zoom−</strong>」で画面を拡大・縮小できます。</li>
  </ul>

  <h3 class="h-head">■ STEP 4　ジョイントとTボーンを生成する（CNC加工用）</h3>
  <ul>
    <li>複数の部品を組み合わせて使う場合は「<strong>ジョイント生成</strong>」で，部品の接続部分に凹凸（組み手）を自動追加します。</li>
    <li>CNCで直角の内コーナーを加工するには，「<strong>Tボーン作成</strong>」で角に円形の逃げ加工（Tボーン）を自動挿入します。</li>
    <li>「<strong>ジョイント＆Tボーン一括生成</strong>」で両方をまとめて処理できます。</li>
    <li>「<strong>ミル径</strong>」は使用するエンドミルの直径（6mm または 12mm）を選んでください。Tボーンの径とタブサイズに影響します。</li>
    <li>「<strong>クリアランス</strong>」はジョイントのはめ合い隙間（mm）です。材料の厚みや加工精度に応じて調整してください（初期値 0.2mm）。</li>
    <li>3D表示の「<strong>交差部編集</strong>」を押すと、交差部のハイライトと一覧が表示されます。編集中に交差部をクリックすると、その交差だけ奇数・偶数の切削担当を反転し、元のSTL形状から再計算します。</li>
    <li>交差部編集モード中は「<strong>表示：不透過／表示：透過</strong>」で部材のマテリアルを切り替えられます。編集終了時は通常の不透過表示へ戻ります。</li>
    <li>「<strong>STL初期状態に戻す</strong>」でジョイント・Tボーン等の変更をすべてリセットできます。</li>
  </ul>

  <h3 class="h-head">■ STEP 5　タブを設定する（切り抜き時の部品固定）</h3>
  <ul>
    <li>CNCで部品を切り抜く際，最終パスで部品が飛ばないようにするため「<strong>タブ</strong>」を設定します。</li>
    <li>「<strong>タブ設定</strong>」ボタンを押すとタブモードになります（ボタンが赤く点滅）。</li>
    <li>タブモード中は部品の<strong>輪郭線の上をクリック</strong>すると，赤い□マークのタブが追加されます。1回のクリックで1個，何個でも追加できます。</li>
    <li>タブをクリックすると削除できます。</li>
    <li>タブは部品と一緒に移動します。</li>
    <li>「<strong>タブ設定中（完了）</strong>」ボタンをもう一度押すとモードが終了します。設定したタブは保持されます。</li>
    <li>タブのサイズは以下の通りです（残し高さ：6mm）：<br>
      　6mm エンドミル → 長さ <strong>16mm</strong>　／　12mm エンドミル → 長さ <strong>20mm</strong></li>
  </ul>

  <h3 class="h-head">■ STEP 6　Gコードを生成する</h3>
  <ul>
    <li>「<strong>Mach2/3用Gコード生成</strong>」ボタンで，CNCコントローラ（Mach2/3）用の Gコードファイル（.txt）をダウンロードできます。</li>
    <li>タブが設定されている場合，タブ位置でZ軸を自動的に持ち上げ，材料を6mm残して切り残します。</li>
    <li>Gコードには2段切削（荒削り→仕上げ）が含まれます。切削深さは材料の厚みに合わせて自動設定されます。</li>
  </ul>

  <h3 class="h-head">■ STEP 7　木取り図を保存・印刷する</h3>
  <ul>
    <li>「<strong>PDF表示</strong>」で木取り図をPDFとして印刷・保存できます。タブマークはPDFには出力されません。</li>
    <li>「<strong>SVG保存</strong>」でベクター形式のSVGファイルを保存できます（タブマーク除外）。</li>
  </ul>
</div>
        </body></html>`;
      try {
        w.document.open();
        w.document.write(htmlDoc);
        w.document.close();
      } catch (e) {
        try { w.document.documentElement.innerHTML = htmlDoc; } catch (e2) {}
      }
    }

function makeGeometryExportData(geometries) {
  return (geometries || []).map(geo => {
    const posRaw = geo.attributes.position.array;
    const pos = new Array(posRaw.length);
    for (let i=0; i<posRaw.length; i++) pos[i] = Math.round(posRaw[i]*1000)/1000;
    let norm = null;
    if (geo.attributes.normal) {
      const normRaw = geo.attributes.normal.array;
      norm = new Array(normRaw.length);
      for (let i=0; i<normRaw.length; i++) norm[i] = Math.round(normRaw[i]*1000)/1000;
    }
    return {pos,norm};
  });
}

function getJointViewerData() {
  return jointCandidates.map(j => ({
    id:j.id,label:j.label,partAIndex:j.partAIndex,partBIndex:j.partBIndex,
    splitAxis:j.splitAxis,splitLength:j.splitLength,divisions:j.divisions,
    defaultMortiseIndex:j.defaultMortiseIndex,
    selectedMortiseIndex:jointAssignments.get(j.id) ?? j.defaultMortiseIndex,
    center:{...j.center},size:{...j.size},min:{...j.min},max:{...j.max}
  }));
}

function syncJointViewer() {
  if (!jointViewerWindow || jointViewerWindow.closed) return;
  try {
    if (typeof jointViewerWindow.__kidorinUpdateModel === 'function') {
      jointViewerWindow.__kidorinUpdateModel(makeGeometryExportData(geometriesCache),getJointViewerData());
    }
  } catch (e) {
    console.warn('3Dビューの同期に失敗しました:',e);
  }
}

    function open3dWindow() {
  if (!geometriesCache || geometriesCache.length === 0) {
    alert('先にSTLファイルを読み込んでください。');
    return;
  }
  
  const winW = Math.floor(window.innerWidth * 0.9);
  const winH = Math.floor(window.innerHeight * 0.9);
  const w = window.open('about:blank', '3dViewer_' + Date.now(), `popup=yes,width=${winW},height=${winH},resizable=yes,scrollbars=no`);
  
  if (!w) { alert('ポップアップがブロックされました。'); return; }
  jointViewerWindow = w;
  if (!jointCandidates.length && originalGeometriesCache.length > 1) {
    jointCandidates = detectJointCandidates(originalGeometriesCache);
  }

  const svg = document.querySelector('#svg-container svg');
  const colorsBySvg = [];
  if (svg) {
    Array.from(svg.querySelectorAll('g[id^="part-"]')).forEach(el => {
      const idx = parseInt((el.id || '').replace('part-', ''), 10);
      if (!isNaN(idx)) colorsBySvg[idx] = el.dataset.partColor || null;
    });
  }
  const fallbackColors = ['#dbeafe','#fde68a','#fecdd3','#d1fae5','#e9d5ff','#fed7aa','#bfdbfe','#fbcfe8','#fde2e4','#ddd6fe','#c7f9cc','#faedcd'];
  const colors = Array.from({length: geometriesCache.length}, (_, i) => colorsBySvg[i] || fallbackColors[i % fallbackColors.length]);

  const exportData = makeGeometryExportData(geometriesCache);
  
  const geometriesJson = JSON.stringify(exportData);
  const jointsJson = JSON.stringify(getJointViewerData());

  const htmlDoc = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>STL 3Dビューア - きどりん</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:100%;height:100%;background:#111111;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;}
  #canvas-wrap{position:absolute;inset:0;}
  canvas{display:block;width:100%!important;height:100%!important;}
  
  #toolbar{
    position:absolute;top:10px;left:14px;
    display:flex;gap:8px;align-items:center;
    background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);
    border-radius:6px;padding:5px 12px;color:#fff;
    font-size:11px;
    pointer-events:none;
    white-space:nowrap;
    border:1px solid rgba(255,255,255,0.1);
    z-index: 10;
  }

  /* ウィンドウ幅が狭い（例: 650px以下）場合は操作説明を隠す */
  @media (max-width: 400px) {
    #toolbar { display: none; }
  }

  #close-btn, #reset-btn, #dim-btn, #stl-export-btn, #glb-export-btn, #machined-glb-export-btn, #view-mode-btn, #joint-edit-btn {
    position:absolute;top:10px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.1);
    color:#fff;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;transition:background 0.2s;
    z-index: 20;
  }
  #close-btn{right:14px;} #reset-btn{right:78px;}
  #close-btn:hover, #reset-btn:hover, #dim-btn:hover, #stl-export-btn:hover, #glb-export-btn:hover, #machined-glb-export-btn:hover, #view-mode-btn:hover, #joint-edit-btn:hover {background:rgba(255,255,255,0.3);}
  #dim-btn{right:152px;} #dim-btn.active{background:rgba(255,255,255,0.35);font-weight:700;}
  #stl-export-btn{right:240px;background:rgba(40,167,69,0.5);border-color:rgba(40,167,69,0.3);}
  #glb-export-btn{right:350px;background:rgba(111,66,193,0.5);border-color:rgba(111,66,193,0.3);}
  #machined-glb-export-btn{right:460px;background:rgba(0,123,167,.62);border-color:rgba(90,205,235,.45);}
  #machined-glb-export-btn:disabled{cursor:wait;opacity:.8;background:rgba(230,126,34,.72);}
  #joint-edit-btn{right:14px;top:44px;background:rgba(40,167,69,.62);border-color:rgba(100,220,130,.45);min-width:116px;}
  #joint-edit-btn.active{background:rgba(220,53,69,.72);border-color:rgba(255,120,130,.6);}
  #view-mode-btn{right:14px;top:78px;background:rgba(0,123,255,.55);border-color:rgba(80,170,255,.45);min-width:116px;display:none;}
  #view-mode-btn.transparent-mode{background:rgba(230,126,34,.65);border-color:rgba(255,190,110,.55);}
  
  #info{
    position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
    color:rgba(255,255,255,0.5);font-size:10px;pointer-events:none;font-weight:bold;
  }
  #joint-panel{
    position:absolute;left:14px;bottom:34px;z-index:30;width:310px;max-height:42vh;overflow:auto;
    color:#fff;background:rgba(8,12,20,.82);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:10px;
    font-size:11px;backdrop-filter:blur(8px);display:none;
  }
  #joint-panel h2{font-size:13px;margin:0 0 6px;color:#ffd166;}
  #joint-panel .hint{color:#b9c2d0;line-height:1.45;margin-bottom:7px;}
  .joint-row{display:flex;align-items:center;gap:7px;padding:6px;border-top:1px solid rgba(255,255,255,.1);cursor:pointer;}
  .joint-row:hover{background:rgba(255,255,255,.09);}
  .joint-chip{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:0 0 8px currentColor;}
  .joint-main{flex:1;min-width:0;}.joint-title{font-weight:700}.joint-meta{color:#9da9b8;font-size:10px;}
  .joint-pattern{font-weight:700;color:#7ee787;white-space:nowrap;}
  #joint-status{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;display:none;
    color:#fff;background:rgba(0,0,0,.82);border:1px solid rgba(255,255,255,.25);padding:12px 18px;border-radius:8px;font-size:13px;}
</style>
</head>
<body>
<div id="canvas-wrap"><canvas id="c"></canvas></div>
<div id="toolbar"><span id="toolbar-text">左ドラッグ：回転　/　右：移動　/　ホイール：ズーム</span></div>
<button id="reset-btn" onclick="resetCamera()">リセット</button>
<button id="dim-btn" onclick="toggleDimensions()">寸法表示</button>
<button id="stl-export-btn" onclick="exportSTL()">STLエクスポート</button>
<button id="glb-export-btn" onclick="exportGLB()">GLBエクスポート</button>
<button id="machined-glb-export-btn" onclick="exportMachinedGLB()">加工後GLB</button>
<button id="joint-edit-btn" onclick="toggleJointEditMode()">交差部編集</button>
<button id="view-mode-btn" onclick="toggleMaterialViewMode()">表示：不透過</button>
<button id="close-btn" onclick="window.close()">閉じる</button>
<div id="info"></div>
<div id="joint-panel"></div>
<div id="joint-status">ジョイントを再計算しています…</div>

<script src="https://unpkg.com/three@0.128.0/build/three.min.js"><\/script>
<script>
const COLORS = ${JSON.stringify(colors)};
let parentGeosData = ${geometriesJson};
let parentJointData = ${jointsJson};
let pendingMachinedDownload=null;
let machinedButtonResetTimer=null;

async function exportMachinedGLB(){
  const btn=document.getElementById('machined-glb-export-btn');
  if(!window.opener || window.opener.closed || typeof window.opener.kidorinExportMachinedGLB!=='function'){
    alert('親画面で加工後GLBを生成できません。');return;
  }
  if(pendingMachinedDownload){
    const saved=window.opener.kidorinRetryMachinedGLBDownload?.(pendingMachinedDownload);
    if(saved){
      btn.textContent='保存を再実行しました';
      clearTimeout(machinedButtonResetTimer);
      machinedButtonResetTimer=setTimeout(()=>{pendingMachinedDownload=null;btn.textContent='加工後GLB';},2500);
    }
    return;
  }
  btn.disabled=true;btn.textContent='加工後GLB 処理中…';
  // ボタンの状態を先に描画してから、親画面側の重いバイナリ生成を開始する。
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
    const result=await window.opener.kidorinExportMachinedGLB();
    if(result?.ok){
      pendingMachinedDownload=result.downloadId;
      btn.textContent='完了 ('+result.sizeMB+' MB)・未保存なら再クリック';
      btn.disabled=false;
      clearTimeout(machinedButtonResetTimer);
      machinedButtonResetTimer=setTimeout(()=>{pendingMachinedDownload=null;btn.textContent='加工後GLB';},60000);
    }else{
      btn.textContent='加工後GLB';btn.disabled=false;
    }
  }catch(e){
    console.error(e);alert('加工後GLBの生成に失敗しました: '+(e.message || e));
    btn.textContent='加工後GLB';btn.disabled=false;
  }
}

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
renderer.setPixelRatio(Math.max(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);

const ambient = new THREE.AmbientLight(0xffffff, 0.35); 
scene.add(ambient);
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3); 
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.3); 
dirLight.position.set(1, 2, 1.5); 
dirLight.castShadow = true; 
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const group = new THREE.Group();
let minX=Infinity, minY=Infinity, minZ=Infinity;
let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
let modelMeshes = [];
let jointMarkerGroup = new THREE.Group();
let clickableJointMarkers = [];
let materialViewMode = 'opaque';
let jointEditMode = false;

function disposeObject3D(obj){
  if(obj.geometry) obj.geometry.dispose();
  if(obj.material){
    if(Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose());
    else obj.material.dispose();
  }
}

function loadModelData(dataList, resetBounds){
  modelMeshes.forEach(mesh=>{ group.remove(mesh); disposeObject3D(mesh); });
  modelMeshes = [];
  if(resetBounds){minX=Infinity;minY=Infinity;minZ=Infinity;maxX=-Infinity;maxY=-Infinity;maxZ=-Infinity;}
  if (dataList && dataList.length > 0) dataList.forEach((data, ci) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.pos), 3));
        if(data.norm) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.norm), 3));
        else geo.computeVertexNormals();
        geo.computeBoundingBox();
        if(resetBounds){
          minX = Math.min(minX, geo.boundingBox.min.x); minY = Math.min(minY, geo.boundingBox.min.y); minZ = Math.min(minZ, geo.boundingBox.min.z);
          maxX = Math.max(maxX, geo.boundingBox.max.x); maxY = Math.max(maxY, geo.boundingBox.max.y); maxZ = Math.max(maxZ, geo.boundingBox.max.z);
        }

        const hex = parseInt(COLORS[ci % COLORS.length].replace('#',''), 16);
        const mat = new THREE.MeshStandardMaterial({
            color: hex, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
            transparent: materialViewMode === 'transparent',
            opacity: materialViewMode === 'transparent' ? 0.32 : 1.0,
            depthWrite: materialViewMode !== 'transparent'
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.partIndex = ci;
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        modelMeshes.push(mesh);
    });
}
loadModelData(parentGeosData,true);

const maxDim = isFinite(maxX) ? Math.max(maxX-minX, maxY-minY, maxZ-minZ) : 100;
const centerX = isFinite(maxX) ? (minX+maxX)/2 : 0;
const centerY = isFinite(maxY) ? (minY+maxY)/2 : 0;
const centerZ = isFinite(maxZ) ? (minZ+maxZ)/2 : 0;

group.rotation.x = -Math.PI / 2;
group.position.sub(new THREE.Vector3(centerX, centerZ, -centerY));
scene.add(group);

function setJointStatus(show,text){
  const el=document.getElementById('joint-status');
  if(!el)return;
  if(text)el.textContent=text;
  el.style.display=show?'block':'none';
}

function applyMaterialViewMode(){
  const transparent=jointEditMode&&materialViewMode==='transparent';
  modelMeshes.forEach(function(mesh){
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    materials.forEach(function(mat){
      mat.transparent=transparent;
      mat.opacity=transparent?0.32:1.0;
      mat.depthWrite=!transparent;
      mat.needsUpdate=true;
    });
  });
  clickableJointMarkers.forEach(function(marker){
    if(marker.material){marker.material.opacity=transparent?0.52:0.16;marker.material.needsUpdate=true;}
  });
  const btn=document.getElementById('view-mode-btn');
  if(btn){
    btn.textContent=transparent?'表示：透過':'表示：不透過';
    btn.classList.toggle('transparent-mode',transparent);
    btn.title=transparent?'クリックすると不透過表示に戻します':'クリックすると部材を透過表示します';
    btn.style.display=jointEditMode?'block':'none';
  }
  jointMarkerGroup.visible=jointEditMode;
  const panel=document.getElementById('joint-panel');
  if(panel)panel.style.display=jointEditMode?'block':'none';
  update3dViewerLabels();
}

function toggleMaterialViewMode(){
  if(!jointEditMode)return;
  materialViewMode=materialViewMode==='opaque'?'transparent':'opaque';
  applyMaterialViewMode();
}

function update3dViewerLabels(){
  const editBtn=document.getElementById('joint-edit-btn');
  if(editBtn){
    editBtn.textContent=jointEditMode?'交差部編集を終了':'交差部編集';
    editBtn.classList.toggle('active',jointEditMode);
  }
  const toolbarText=document.getElementById('toolbar-text');
  if(toolbarText)toolbarText.textContent=jointEditMode
    ?'交差部クリック：奇数/偶数反転　/　透過切替可　/　左ドラッグ：回転　/　右：移動'
    :'左ドラッグ：回転　/　右：移動　/　ホイール：ズーム';
  const info=document.getElementById('info');
  if(info)info.textContent=jointEditMode
    ?'交差部編集モード　交差部: '+parentJointData.length+'　色付き領域をクリックして反転'
    :'部品数: '+parentGeosData.length+'　サイズ: '+Math.round(maxX-minX)+' × '+Math.round(maxY-minY)+' × '+Math.round(maxZ-minZ)+' mm';
}

function toggleJointEditMode(){
  jointEditMode=!jointEditMode;
  if(!jointEditMode)materialViewMode='opaque';
  applyMaterialViewMode();
}

function requestJointToggle(jointId){
  if(!jointEditMode)return;
  if(!window.opener || window.opener.closed || typeof window.opener.kidorinToggleJointPattern!=='function'){
    setJointStatus(true,'元の画面との接続が切れています。');
    return;
  }
  setJointStatus(true,'ジョイントを再計算しています…');
  setTimeout(function(){
    try{
      const result=window.opener.kidorinToggleJointPattern(jointId);
      if(!result)setJointStatus(true,'交差部を更新できませんでした。');
      else if(result.errorCount)setJointStatus(true,result.errorCount+' 箇所でCSG演算エラーが発生しました。');
    }catch(err){
      console.error(err);setJointStatus(true,'ジョイント再計算でエラーが発生しました。');
    }
  },0);
}

function rebuildJointMarkers(){
  group.remove(jointMarkerGroup);
  jointMarkerGroup.traverse(disposeObject3D);
  jointMarkerGroup=new THREE.Group();
  clickableJointMarkers=[];
  const panel=document.getElementById('joint-panel');
  panel.innerHTML='';
  const title=document.createElement('h2');title.textContent='交差部の歯パターン';panel.appendChild(title);
  const hint=document.createElement('div');hint.className='hint';
  hint.textContent=parentJointData.length?'3D上の色付き交差部、または一覧をクリックすると、奇数・偶数の切削担当が反転します。':'交差部は検出されませんでした。';
  panel.appendChild(hint);
  parentJointData.forEach(function(j){
    const colorText=COLORS[j.selectedMortiseIndex%COLORS.length]||'#ffd166';
    const color=parseInt(colorText.replace('#',''),16);
    const sx=Math.max(j.size.x*1.02,1.5),sy=Math.max(j.size.y*1.02,1.5),sz=Math.max(j.size.z*1.02,1.5);
    const geo=new THREE.BoxGeometry(sx,sy,sz);
    const mat=new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:materialViewMode==='transparent'?.52:.16,depthTest:false,depthWrite:false});
    const marker=new THREE.Mesh(geo,mat);
    marker.position.set(j.center.x,j.center.y,j.center.z);
    marker.renderOrder=1200;marker.userData.isJointMarker=true;marker.userData.jointId=j.id;
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthTest:false}));
    edge.userData.isJointMarker=true;marker.add(edge);
    jointMarkerGroup.add(marker);clickableJointMarkers.push(marker);

    const row=document.createElement('div');row.className='joint-row';row.dataset.jointId=j.id;
    const chip=document.createElement('span');chip.className='joint-chip';chip.style.color=colorText;chip.style.background=colorText;
    const main=document.createElement('div');main.className='joint-main';
    const jt=document.createElement('div');jt.className='joint-title';jt.textContent=j.label+'　部品'+(j.partAIndex+1)+' × 部品'+(j.partBIndex+1);
    const meta=document.createElement('div');meta.className='joint-meta';meta.textContent=j.splitAxis.toUpperCase()+'軸 / '+Math.round(j.splitLength*10)/10+'mm / '+j.divisions+'分割';
    main.appendChild(jt);main.appendChild(meta);
    const pat=document.createElement('div');pat.className='joint-pattern';pat.textContent='奇数: 部品'+(j.selectedMortiseIndex+1);
    row.appendChild(chip);row.appendChild(main);row.appendChild(pat);
    row.addEventListener('click',function(){requestJointToggle(j.id);});
    panel.appendChild(row);
  });
  group.add(jointMarkerGroup);
  jointMarkerGroup.visible=jointEditMode;
  applyMaterialViewMode();
}
rebuildJointMarkers();

window.__kidorinUpdateModel=function(newGeometries,newJoints){
  parentGeosData=newGeometries||[];
  parentJointData=newJoints||[];
  loadModelData(parentGeosData,false);
  rebuildJointMarkers();
  setJointStatus(false);
  update3dViewerLabels();
};

let camDist = maxDim * 1.7; 
let camTheta = Math.PI / 2 - Math.PI / 8; 
let camPhi = 0;
let panOffset = new THREE.Vector3(0, -maxDim * 0.05, 0);

function setCameraFromSpherical(){
  camera.position.set(
    camDist * Math.sin(camTheta) * Math.sin(camPhi) + panOffset.x,
    camDist * Math.cos(camTheta)                    + panOffset.y,
    camDist * Math.sin(camTheta) * Math.cos(camPhi) + panOffset.z
  );
  camera.lookAt(panOffset);
}
setCameraFromSpherical();

function resetCamera(){
  camDist = maxDim * 1.7; camTheta = Math.PI / 2 - Math.PI / 8; camPhi = 0;
  panOffset.set(0, -maxDim * 0.05, 0); setCameraFromSpherical();
}

const infoEl = document.getElementById('info');
update3dViewerLabels();

function resize(){
  const W=window.innerWidth, H=window.innerHeight;
  renderer.setSize(W,H); camera.aspect=W/H; camera.updateProjectionMatrix();
}
resize(); window.addEventListener('resize', resize);

// Escキーでウィンドウを閉じる機能を追加
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.close();
});

let mouse = {down:false, btn:0, lastX:0, lastY:0, downX:0, downY:0, moved:false};
const jointRaycaster=new THREE.Raycaster();
const jointPointer=new THREE.Vector2();
canvas.addEventListener('contextmenu', e=>e.preventDefault());
canvas.addEventListener('mousedown', e=>{mouse.down=true;mouse.btn=e.button;mouse.lastX=mouse.downX=e.clientX;mouse.lastY=mouse.downY=e.clientY;mouse.moved=false;});
window.addEventListener('mouseup', e=>{
  const shouldPick=jointEditMode&&mouse.down&&mouse.btn===0&&!mouse.moved&&e.target===canvas;
  mouse.down=false;
  if(shouldPick){
    const rect=canvas.getBoundingClientRect();
    jointPointer.x=((e.clientX-rect.left)/rect.width)*2-1;
    jointPointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
    jointRaycaster.setFromCamera(jointPointer,camera);
    const hits=jointRaycaster.intersectObjects(clickableJointMarkers,false);
    if(hits.length&&hits[0].object.userData.jointId)requestJointToggle(hits[0].object.userData.jointId);
  }
});

window.addEventListener('mousemove', e=>{
  if(!mouse.down) return;
  const dx=e.clientX-mouse.lastX, dy=e.clientY-mouse.lastY;
  if(Math.hypot(e.clientX-mouse.downX,e.clientY-mouse.downY)>4)mouse.moved=true;
  mouse.lastX=e.clientX; mouse.lastY=e.clientY;
  if(mouse.btn===0){
    camPhi -= dx * 0.008; camTheta = Math.max(0.05, Math.min(Math.PI-0.05, camTheta - dy * 0.008));
  } else if(mouse.btn===2){
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    camera.getWorldDirection(up); right.crossVectors(up, camera.up).normalize();
    const upDir = new THREE.Vector3().crossVectors(right, up).normalize();
    panOffset.addScaledVector(right, -dx * camDist * 0.001); 
    panOffset.addScaledVector(upDir,  dy * camDist * 0.001);
  }
  setCameraFromSpherical();
});

canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  camDist = Math.max(maxDim * 0.1, Math.min(maxDim * 20, camDist * (e.deltaY > 0 ? 1.1 : 0.91)));
  setCameraFromSpherical();
}, {passive:false});

function animate(){
  requestAnimationFrame(animate);
  if(dimGrp){
    dimGrp.traverse(function(o){
      if(o.isSprite) o.quaternion.copy(camera.quaternion);
    });
  }
  renderer.render(scene, camera);
}

var dimGrp = null;
var dimOn = false;

function fmtDimValue(v){
  if(!isFinite(v)) return '-';
  var rounded = Math.round(v * 10) / 10;
  return (Math.abs(rounded - Math.round(rounded)) < 0.05) ? String(Math.round(rounded)) : rounded.toFixed(1);
}

function makeTextSprite(text){
  var cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  var c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  c.font = 'bold 42px system-ui, -apple-system, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 8;
  c.strokeStyle = 'rgba(0,0,0,0.75)';
  c.strokeText(text, cv.width / 2, cv.height / 2);
  c.fillStyle = '#00d2ff';
  c.fillText(text, cv.width / 2, cv.height / 2);
  var tex = new THREE.CanvasTexture(cv);
  var mat = new THREE.SpriteMaterial({map:tex, depthTest:false, depthWrite:false, sizeAttenuation:false, transparent:true});
  var sp = new THREE.Sprite(mat);
  sp.scale.set(0.24, 0.06, 1);
  sp.renderOrder = 1000;
  return sp;
}

function makeLine(points){
  var mat = new THREE.LineBasicMaterial({color:0x00d2ff, depthTest:false, depthWrite:false, transparent:true, opacity:0.95});
  var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
  line.renderOrder = 999;
  return line;
}

function makeDimensionLine(p1, p2, offsetVec, label){
  var g = new THREE.Group();
  var a = p1.clone().add(offsetVec);
  var b = p2.clone().add(offsetVec);
  var axis = new THREE.Vector3().subVectors(b, a);
  var axisLen = axis.length();
  if(axisLen <= 0.0001) return g;
  axis.normalize();
  var offLen = offsetVec.length();
  var offDir = offLen > 0.0001 ? offsetVec.clone().normalize() : new THREE.Vector3(0, 1, 0);
  var tick = Math.max(maxDim * 0.018, 3);

  g.add(makeLine([a, b]));                         // 寸法線
  g.add(makeLine([p1, a]));                         // 補助線
  g.add(makeLine([p2, b]));                         // 補助線
  g.add(makeLine([a.clone().addScaledVector(offDir, -tick), a.clone().addScaledVector(offDir, tick)]));
  g.add(makeLine([b.clone().addScaledVector(offDir, -tick), b.clone().addScaledVector(offDir, tick)]));

  var sp = makeTextSprite(label);
  sp.position.copy(a).lerp(b, 0.5).addScaledVector(offDir, tick * 1.8);
  g.add(sp);
  return g;
}

function disposeDimensionGroup(g){
  if(!g) return;
  g.traverse(function(o){
    if(o.geometry) o.geometry.dispose();
    if(o.material){
      if(o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

function createDimensionGroup(){
  var g = new THREE.Group();
  var off = Math.max(maxDim * 0.16, 12);
  var xLen = Math.max(0, maxX - minX);
  var yLen = Math.max(0, maxY - minY);
  var zLen = Math.max(0, maxZ - minZ);

  var p000 = new THREE.Vector3(minX, minY, minZ);
  var p100 = new THREE.Vector3(maxX, minY, minZ);
  var p010 = new THREE.Vector3(minX, maxY, minZ);
  var p101 = new THREE.Vector3(maxX, minY, maxZ);

  g.add(makeDimensionLine(p000, p100, new THREE.Vector3(0, -off, 0), '横幅 ' + fmtDimValue(xLen) + ' mm'));
  g.add(makeDimensionLine(p000, p010, new THREE.Vector3(-off, 0, 0), '奥行き ' + fmtDimValue(yLen) + ' mm'));
  g.add(makeDimensionLine(p100, p101, new THREE.Vector3(off, 0, 0), '高さ ' + fmtDimValue(zLen) + ' mm'));

  g.rotation.copy(group.rotation);
  g.position.copy(group.position);
  return g;
}

function toggleDimensions(){
  dimOn = !dimOn;
  var btn = document.getElementById('dim-btn');
  if(btn){
    btn.textContent = dimOn ? '寸法非表示' : '寸法表示';
    btn.classList.toggle('active', dimOn);
  }
  if(dimOn){
    if(dimGrp){ scene.remove(dimGrp); disposeDimensionGroup(dimGrp); dimGrp = null; }
    dimGrp = createDimensionGroup();
    scene.add(dimGrp);
  }else if(dimGrp){
    scene.remove(dimGrp);
    disposeDimensionGroup(dimGrp);
    dimGrp = null;
  }
}

// === STLエクスポート ===
function exportSTL(){
  var meshes = [];
  group.traverse(function(o){ if(o.isMesh && !o.userData.isJointMarker) meshes.push(o); });
  if(meshes.length === 0){ alert('エクスポートするメッシュがありません'); return; }

  var totalTris = 0;
  meshes.forEach(function(m){
    var pos = m.geometry.attributes.position;
    var idx = m.geometry.index;
    totalTris += idx ? idx.count / 3 : pos.count / 3;
  });

  var bufLen = 80 + 4 + totalTris * 50;
  var buf = new ArrayBuffer(bufLen);
  var dv = new DataView(buf);
  var hdr = 'STL exported by Kidorin for CNC';
  for(var i=0; i<80; i++) dv.setUint8(i, i < hdr.length ? hdr.charCodeAt(i) : 0);
  dv.setUint32(80, totalTris, true);

  var off = 84;
  meshes.forEach(function(mesh){
    var geo = mesh.geometry;
    var pos = geo.attributes.position;
    var idx = geo.index;
    var triCount = idx ? idx.count / 3 : pos.count / 3;

    for(var t=0; t<triCount; t++){
      var i0 = idx ? idx.getX(t*3)   : t*3;
      var i1 = idx ? idx.getX(t*3+1) : t*3+1;
      var i2 = idx ? idx.getX(t*3+2) : t*3+2;

      var ax=pos.getX(i0),ay=pos.getY(i0),az=pos.getZ(i0);
      var bx=pos.getX(i1),by=pos.getY(i1),bz=pos.getZ(i1);
      var cx=pos.getX(i2),cy=pos.getY(i2),cz=pos.getZ(i2);
      var e1x=bx-ax, e1y=by-ay, e1z=bz-az;
      var e2x=cx-ax, e2y=cy-ay, e2z=cz-az;
      var nx=e1y*e2z-e1z*e2y, ny=e1z*e2x-e1x*e2z, nz=e1x*e2y-e1y*e2x;
      var nl=Math.sqrt(nx*nx+ny*ny+nz*nz);
      if(nl>0){nx/=nl;ny/=nl;nz/=nl;}

      dv.setFloat32(off,nx,true); dv.setFloat32(off+4,ny,true); dv.setFloat32(off+8,nz,true); off+=12;
      dv.setFloat32(off,ax,true); dv.setFloat32(off+4,ay,true); dv.setFloat32(off+8,az,true); off+=12;
      dv.setFloat32(off,bx,true); dv.setFloat32(off+4,by,true); dv.setFloat32(off+8,bz,true); off+=12;
      dv.setFloat32(off,cx,true); dv.setFloat32(off+4,cy,true); dv.setFloat32(off+8,cz,true); off+=12;
      dv.setUint16(off,0,true); off+=2;
    }
  });

  var blob = new Blob([buf], {type:'application/octet-stream'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (document.title.replace(/[^\w\u3000-\u9fff]/g,'_') || 'kidorin_export') + '.stl';
  a.click();
  URL.revokeObjectURL(a.href);
}

// === GLBエクスポート ===
function exportGLB(){
  var meshes = [];
  group.traverse(function(o){ if(o.isMesh && !o.userData.isJointMarker) meshes.push(o); });
  if(meshes.length === 0){ alert('エクスポートするメッシュがありません'); return; }

  var accessors=[], bufferViews=[], meshDefs=[], nodeDefs=[], materialDefs=[];
  var binParts=[];
  var byteOffset=0, accIdx=0, bvIdx=0;

  meshes.forEach(function(mesh, mi){
    var geo = mesh.geometry;
    var pos = geo.attributes.position;
    var norm = geo.attributes.normal;
    var idx = geo.index;

    // 位置
    var posArr = new Float32Array(pos.count*3);
    var pMin=[Infinity,Infinity,Infinity], pMax=[-Infinity,-Infinity,-Infinity];
    for(var i=0;i<pos.count;i++){
      var x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      posArr[i*3]=x; posArr[i*3+1]=y; posArr[i*3+2]=z;
      pMin[0]=Math.min(pMin[0],x); pMin[1]=Math.min(pMin[1],y); pMin[2]=Math.min(pMin[2],z);
      pMax[0]=Math.max(pMax[0],x); pMax[1]=Math.max(pMax[1],y); pMax[2]=Math.max(pMax[2],z);
    }
    var posBuf=new Uint8Array(posArr.buffer), posPad=(4-posBuf.byteLength%4)%4;
    bufferViews.push({buffer:0,byteOffset:byteOffset,byteLength:posBuf.byteLength,target:34962});
    accessors.push({bufferView:bvIdx,componentType:5126,count:pos.count,type:'VEC3',min:pMin,max:pMax});
    var posAccIdx=accIdx; binParts.push(posBuf); if(posPad>0)binParts.push(new Uint8Array(posPad));
    byteOffset+=posBuf.byteLength+posPad; accIdx++; bvIdx++;

    // 法線
    var normAccIdx=-1;
    if(norm){
      var normArr=new Float32Array(norm.count*3);
      for(var i=0;i<norm.count;i++){normArr[i*3]=norm.getX(i);normArr[i*3+1]=norm.getY(i);normArr[i*3+2]=norm.getZ(i);}
      var normBuf=new Uint8Array(normArr.buffer), normPad=(4-normBuf.byteLength%4)%4;
      bufferViews.push({buffer:0,byteOffset:byteOffset,byteLength:normBuf.byteLength,target:34962});
      accessors.push({bufferView:bvIdx,componentType:5126,count:norm.count,type:'VEC3'});
      normAccIdx=accIdx; binParts.push(normBuf); if(normPad>0)binParts.push(new Uint8Array(normPad));
      byteOffset+=normBuf.byteLength+normPad; accIdx++; bvIdx++;
    }

    // インデックス
    var idxAccIdx=-1;
    if(idx){
      var use32=idx.count>65535||pos.count>65535;
      var idxArr=use32?new Uint32Array(idx.count):new Uint16Array(idx.count);
      for(var i=0;i<idx.count;i++)idxArr[i]=idx.getX(i);
      var idxBuf=new Uint8Array(idxArr.buffer), idxPad=(4-idxBuf.byteLength%4)%4;
      bufferViews.push({buffer:0,byteOffset:byteOffset,byteLength:idxBuf.byteLength,target:34963});
      accessors.push({bufferView:bvIdx,componentType:use32?5125:5123,count:idx.count,type:'SCALAR'});
      idxAccIdx=accIdx; binParts.push(idxBuf); if(idxPad>0)binParts.push(new Uint8Array(idxPad));
      byteOffset+=idxBuf.byteLength+idxPad; accIdx++; bvIdx++;
    }

    // マテリアル
    var c=mesh.material.color;
    materialDefs.push({pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,1.0],metallicFactor:mesh.material.metalness||0,roughnessFactor:mesh.material.roughness||0.9},doubleSided:true});

    // メッシュ・ノード
    var prim={attributes:{POSITION:posAccIdx},material:mi};
    if(normAccIdx>=0)prim.attributes.NORMAL=normAccIdx;
    if(idxAccIdx>=0)prim.indices=idxAccIdx;
    meshDefs.push({primitives:[prim]});
    nodeDefs.push({mesh:mi});
  });

  var rootIdx=nodeDefs.length;
  nodeDefs.push({children:nodeDefs.map(function(_,i){return i;}),name:'kidorin_model'});

  var gltf={
    asset:{version:'2.0',generator:'Kidorin for CNC'},
    scene:0, scenes:[{nodes:[rootIdx]}],
    nodes:nodeDefs, meshes:meshDefs, materials:materialDefs,
    accessors:accessors, bufferViews:bufferViews,
    buffers:[{byteLength:byteOffset}]
  };

  var jsonStr=JSON.stringify(gltf);
  var jsonPad=(4-(jsonStr.length%4))%4;
  var jsonBuf=new TextEncoder().encode(jsonStr+' '.repeat(jsonPad));
  var binPadLen=(4-(byteOffset%4))%4;
  var totalLen=12+8+jsonBuf.byteLength+8+byteOffset+binPadLen;
  var glb=new ArrayBuffer(totalLen);
  var dv=new DataView(glb); var o=0;
  dv.setUint32(o,0x46546C67,true);o+=4;
  dv.setUint32(o,2,true);o+=4;
  dv.setUint32(o,totalLen,true);o+=4;
  dv.setUint32(o,jsonBuf.byteLength,true);o+=4;
  dv.setUint32(o,0x4E4F534A,true);o+=4;
  new Uint8Array(glb,o,jsonBuf.byteLength).set(jsonBuf);o+=jsonBuf.byteLength;
  dv.setUint32(o,byteOffset+binPadLen,true);o+=4;
  dv.setUint32(o,0x004E4942,true);o+=4;
  for(var i=0;i<binParts.length;i++){new Uint8Array(glb,o,binParts[i].byteLength).set(binParts[i]);o+=binParts[i].byteLength;}
  for(var i=0;i<binPadLen;i++)dv.setUint8(o++,0);

  var blob=new Blob([glb],{type:'model/gltf-binary'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(document.title.replace(/[^\w\u3000-\u9fff]/g,'_')||'kidorin_export')+'.glb';
  a.click();
  URL.revokeObjectURL(a.href);
}

animate();
<\/script>
</body>
</html>`;
  try {
    w.document.open(); w.document.write(htmlDoc); w.document.close();
  } catch(e) {
    try { w.document.documentElement.innerHTML = htmlDoc; } catch(e2) { alert('3D表示エラー'); }
  }
}

let currentStlFileName = '';

function updateDocTitle(name){
  currentStlFileName = name || '';
  const el = document.getElementById('docTitle');
  if (!el) return;
  el.textContent = `STL to 木取り図作成「きどりん」　STLのファイル名：${name || '-'}`;
}

function openPdfWindow(){
  const svg = document.querySelector('svg');
  if (!svg) { alert('SVGが見つかりません'); return; }

  Array.from(svg.querySelectorAll('g[data-x][id^="part-"]')).forEach(refreshPartVisualState);
  const clone = svg.cloneNode(true);

  try {
    const bbox = svg.getBBox();
    const pad = 10;
    clone.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad*2} ${bbox.height + pad*2}`);
  } catch(e) {}

  clone.removeAttribute('width');
  clone.removeAttribute('height');
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  clone.setAttribute('style', 'width:100%;height:100%;');

  const titleEl = document.getElementById('docTitle');
  const titleText = titleEl ? titleEl.textContent : 'STL木取り作成　STLのファイル名：-';

  const sheets = (window.sheets && Array.isArray(window.sheets)) ? window.sheets : [];
  const infoHtml = sheets.map((s, i)=>{
    const n = i + 1;
    const len = Math.round((s.length ?? 0) * 10) / 10;
    const wid = Math.round((s.width ?? 0) * 10) / 10;
    const gap = Math.round((s.margin ?? 0) * 10) / 10;
    return `<div>板${n}：長さ ${len} mm／幅 ${wid} mm／部品の間隔 ${gap} mm</div>`;
  }).join('');

  const yieldHtml = getYieldHtml();
  const grainHtml = getGrainWarningsHtml();
  const bomHtml = getBomHtml({asTable:true});

  const stlBaseName = currentStlFileName.replace(/\.stl$/i, '') || '木取り図';
  const pdfTitle = `${stlBaseName}_木取り図`;

  const w = window.open('about:blank', 'pdfWindow_' + Date.now(), 'popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes');
  if (!w) { alert('ポップアップがブロックされました'); return; }

  const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${pdfTitle}</title>
    <style>
      html,body{margin:0;padding:0;background:#fff;}
      @page{size:A4 landscape;margin:0;}
      body{overflow:hidden;}
      .page{width:297mm;min-height:210mm;box-sizing:border-box;padding:7mm;display:flex;flex-direction:column;gap:2mm;page-break-inside:avoid;break-inside:avoid;}
      .noprint{margin:0;}
      .title{margin:0; font-size:16px;}
      .info{margin:0; font-size:11px; line-height:1.35;}
      .svgbox{flex:0 0 auto;height:105mm;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid #ddd;}
      .svgbox svg{width:100%; height:100%;}
      .summary-grid{display:flex;gap:2mm;align-items:stretch;}
      .summary-card{flex:1 1 0;border:1px solid #ddd;border-radius:2mm;padding:2mm 2.5mm;font-size:10px;line-height:1.35;}
      .summary-card h4{margin:0 0 1.5mm 0;font-size:11px;}
      .yield-row{display:flex;justify-content:space-between;gap:2mm;border-bottom:1px dashed #ddd;padding:0.8mm 0;}
      .yield-row:last-child{border-bottom:none;}
      .yield-rate{font-weight:700;}
      .warning-text{color:#b42318;font-weight:700;}
      .ok-text{color:#1f7a1f;font-weight:700;}
      .sub{font-size:9px;color:#666;}
      .summary-card ul{margin:1mm 0 0 4mm;padding:0;}
      .summary-card li{margin:0.6mm 0;}
      .bom-table{width:100%;border-collapse:collapse;font-size:9.5px;}
      .bom-table th,.bom-table td{border:1px solid #ddd;padding:1mm 1.2mm;text-align:left;vertical-align:middle;}
      .bom-table th{background:#f7f7f7;}
      .count-cell{text-align:center;width:10mm;}
      .chip-cell{width:6mm;}
      .color-chip{display:inline-block;width:4mm;height:4mm;border-radius:1mm;border:1px solid rgba(0,0,0,0.2);}
      @media print {
        .noprint{display:none;}
        html,body{width:297mm;height:210mm;overflow:hidden;}
      }
      button{padding:6px 10px;}
    </style>
    </head><body>
      <div class="page">
        <div class="noprint" style="position:fixed;right:16px;bottom:16px;z-index:1000;"><button onclick="window.print()">印刷/保存(PDF)</button></div>
        <h3 class="title">${titleText}</h3>
        <div class="info">${infoHtml}</div>
        <div class="svgbox">${clone.outerHTML}</div>
        <div class="summary-grid">
          <section class="summary-card"><h4>板の歩留まり</h4>${yieldHtml}</section>
          <section class="summary-card"><h4>木目方向の注意</h4>${grainHtml}</section>
          <section class="summary-card"><h4>部品リスト（BOM）</h4>${bomHtml}</section>
        </div>
      </div>
    </body></html>`;

  try {
    w.document.open();
    w.document.write(htmlDoc);
    w.document.close();
  } catch (e) {
    try {
      w.document.documentElement.innerHTML = htmlDoc;
    } catch (e2) {
      alert('PDF表示の生成に失敗しました: ' + (e && e.message ? e.message : e));
    }
  }
}

function downloadSvg() {
  const svg = document.querySelector('#svg-container svg');
  if (!svg) { alert('SVGが見つかりません。先にSTLを読み込んでください。'); return; }

  Array.from(svg.querySelectorAll('g[data-x][id^="part-"]')).forEach(refreshPartVisualState);
  const clone = svg.cloneNode(true);

  clone.querySelectorAll('.part-no-badge, .part-dim-text, .part-grain-tag, .board-dims, rect[fill^="url"], text').forEach(el => el.remove());
  clone.querySelectorAll('.tab-marker').forEach(el => el.remove()); // タブはSVGに出力しない
  clone.querySelectorAll('.part-fill').forEach(el => el.remove());

  if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  
  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const stlBaseName = currentStlFileName.replace(/\.stl$/i, '') || '木取り図';
  const fileName = `${stlBaseName}.svg`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const stlInput = document.getElementById('stl-input');
const svgContainer = document.getElementById('svg-container');
const boardLengthInput = document.getElementById('board-length');
const boardWidthInput = document.getElementById('board-width');
const marginInput = document.getElementById('margin');
const updateLayoutButton = document.getElementById('update-layout-button');
const addBoardButton = document.getElementById('add-board-button');

const helpBtn = document.getElementById('helpBtn');
if (helpBtn) {
  helpBtn.addEventListener('click', (e)=>{ e.preventDefault(); openHelpWindow(); });
}

const view3dBtn = document.getElementById('view3d-button');
if (view3dBtn) {
  view3dBtn.addEventListener('click', (e)=>{ e.preventDefault(); open3dWindow(); });
}

const pdfButton = document.getElementById('pdf-button');
if (pdfButton) {
  pdfButton.addEventListener('click', (e)=>{ e.preventDefault(); openPdfWindow(); });
}

const svgButton = document.getElementById('svg-button');
if (svgButton) {
  svgButton.addEventListener('click', (e)=>{ e.preventDefault(); downloadSvg(); });
}

const extraBoardsContainer = document.getElementById('extra-boards');

const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');

let geometriesCache = [];
// STL読込直後の形状を不変の基準として保持する。
// ジョイントを再計算するときは、必ずこの配列からCSGをやり直す。
let originalGeometriesCache = [];
let jointCandidates = [];
const jointAssignments = new Map();
let jointViewerWindow = null;
let lastJointBuildOptions = { withTbone: true };
let zoomScale = 1;
let responsiveFitScale = 1;

let boards = [
  { lengthInput: boardLengthInput, widthInput: boardWidthInput, marginInput: marginInput }
];

function getSvgViewBoxSize(svg) {
  if (!svg) return {width:0,height:0};
  const vb = svg.viewBox && svg.viewBox.baseVal;
  return (vb && vb.width && vb.height) ? {width:vb.width,height:vb.height} : {width:parseFloat(svg.getAttribute('width'))||0,height:parseFloat(svg.getAttribute('height'))||0};
}
function updateResponsiveFitScale(svg) {
  if (!svg||!svgContainer) { responsiveFitScale=1; return; }
  const vb=getSvgViewBoxSize(svg);
  const cw=Math.max(1,svgContainer.clientWidth-16), ch=Math.max(1,svgContainer.clientHeight-16);
  if (!vb.width||!vb.height) { responsiveFitScale=1; return; }
  responsiveFitScale=Math.min(cw/vb.width, ch/vb.height)*0.97;
  if (!isFinite(responsiveFitScale)||responsiveFitScale<=0) responsiveFitScale=1;
}
function getCurrentDisplayScale() { return Math.max(0.01, zoomScale*responsiveFitScale); }

function applyZoomToSvg(svg) {
  if (!svg) return;
  updateResponsiveFitScale(svg);
  const vb=getSvgViewBoxSize(svg), s=getCurrentDisplayScale();
  svg.style.transform='none'; svg.style.transformOrigin='0 0';
  if (vb.width&&vb.height) { svg.style.width=Math.max(1,vb.width*s)+'px'; svg.style.height=Math.max(1,vb.height*s)+'px'; }
}
function updateZoom(delta) {
  zoomScale=Math.max(0.1,Math.min(10,zoomScale*delta));
  const svg=svgContainer.querySelector('svg'); applyZoomToSvg(svg);
}
if (zoomInBtn) zoomInBtn.addEventListener('click', () => updateZoom(1.1));
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => updateZoom(0.9));
window.addEventListener('resize',()=>{ const svg=svgContainer.querySelector('svg'); if(svg) applyZoomToSvg(svg); });

// STL読み込み前でも板を表示する
function showEmptyBoard() {
    // STLが読み込まれている場合は何もしない
    if (geometriesCache && geometriesCache.length > 0) return;
    svgContainer.innerHTML = '';
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    svg.setAttribute("overflow", "visible");
    svg.style.overflow = "visible";
    const specs = getBoardsSpec();
    const totalBoardsWidth = specs.reduce((acc, b, i) => acc + b.length + (i < specs.length - 1 ? b.gap : 0), 0) || 100;
    const maxBoardHeight = Math.max(...specs.map(b => b.width), 100);
    const DIM_EXTRA_PAD = 40;
    const requiredHeight = maxBoardHeight + DIM_EXTRA_PAD;
    svg.setAttribute("width", `${totalBoardsWidth}mm`);
    svg.setAttribute("height", `${requiredHeight}mm`);
    svg.setAttribute("viewBox", `0 0 ${totalBoardsWidth} ${requiredHeight}`);
    svgContainer.appendChild(svg);
    // Y軸反転グループ
    const flipGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    flipGroup.setAttribute('id', 'content-flip');
    flipGroup.setAttribute('transform', `translate(0, ${requiredHeight}) scale(1, -1)`);
    svg.appendChild(flipGroup);
    // テキスト反転補正
    const svgStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    svgStyle.textContent = '#content-flip text { transform-box: fill-box; transform-origin: center; transform: scaleY(-1); }';
    svg.insertBefore(svgStyle, svg.firstChild);
    redrawBoardsOnly(svg);
    applyZoomToSvg(svg);
    requestAnimationFrame(()=>applyZoomToSvg(svg));
}

// 板サイズ変更時に再描画
[boardLengthInput, boardWidthInput, marginInput].forEach(inp => {
    inp.addEventListener('change', showEmptyBoard);
});

// 初期表示
showEmptyBoard();

stlInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    updateDocTitle(file.name);
    loadFile(file);
});
svgContainer.addEventListener('dragover', (event) => { event.preventDefault(); svgContainer.style.borderColor = '#333'; });
svgContainer.addEventListener('dragleave', () => { svgContainer.style.borderColor = '#ccc'; });
svgContainer.addEventListener('drop', (event) => {
    event.preventDefault();
    svgContainer.style.borderColor = '#ccc';
    const file = event.dataTransfer.files[0];
    if (file) loadFile(file);
});
addBoardButton.addEventListener('click', () => {
    const idx = boards.length + 1;
    const group = document.createElement('div');
    group.className = 'board-settings';
    group.innerHTML = `
      <div class="input-group">
        <label>板${idx}の長さ (mm)</label>
        <input type="number" value="${boardLengthInput.value}" class="board-length" />
      </div>
      <div class="input-group">
        <label>板${idx}の幅 (mm)</label>
        <input type="number" value="${boardWidthInput.value}" class="board-width" />
      </div>
      <div class="input-group">
        <label>部品の間隔 (mm)</label>
        <input type="number" value="${marginInput.value}" class="board-margin" />
      </div>
    `;
    extraBoardsContainer.appendChild(group);

    const lengthInput = group.querySelector('.board-length');
    const widthInput  = group.querySelector('.board-width');
    const marginInputEl = group.querySelector('.board-margin');
    boards.push({ lengthInput, widthInput, marginInput: marginInputEl });

    const svg = svgContainer.querySelector('svg');
    if (svg) {
      const specs = getBoardsSpec();
      const totalBW = specs.reduce((acc, b, i) => acc + b.length + (i < specs.length - 1 ? b.gap : 0), 0) || 100;
      const maxBH = Math.max(...specs.map(b => b.width), 100);
      const reqH = maxBH + 40;
      svg.setAttribute('viewBox', `0 0 ${totalBW} ${reqH}`);
      const fg = svg.querySelector('#content-flip');
      if (fg) fg.setAttribute('transform', `translate(0, ${reqH}) scale(1, -1)`);
      redrawBoardsOnly(svg);
      applyZoomToSvg(svg);
    }
});

updateLayoutButton.addEventListener('click', () => {
    if (geometriesCache.length > 0) {
        displayAsSvg(geometriesCache);
    }
});


let stlArrayBufferCache = null;

function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;
        stlArrayBufferCache = contents;
        const loader = new THREE.STLLoader();
        const geometry = loader.parse(contents);
        originalGeometriesCache = separateGeometries(geometry);
        geometriesCache = originalGeometriesCache.map(geo => geo.clone());
        jointAssignments.clear();
        jointCandidates = detectJointCandidates(originalGeometriesCache);
        displayAsSvg(geometriesCache);
        syncJointViewer();
    };
    reader.readAsArrayBuffer(file);
}

function separateGeometries(geometry) {
    const positions = geometry.attributes.position.array;
    const numTriangles = positions.length / 9;
    const visited = new Array(numTriangles).fill(false);
    const adjacency = new Map();
    const edgeToTriangles = new Map();
    const precision = 1e4;
    for (let i = 0; i < numTriangles; i++) {
        const triangleVertices = [];
        for (let j = 0; j < 3; j++) {
            const vertIndex = i * 9 + j * 3;
            const x = Math.round(positions[vertIndex] * precision) / precision;
            const y = Math.round(positions[vertIndex + 1] * precision) / precision;
            const z = Math.round(positions[vertIndex + 2] * precision) / precision;
            const key = `${x}|${y}|${z}`;
            triangleVertices.push(key);
        }
        for (let j = 0; j < 3; j++) {
            const v1 = triangleVertices[j], v2 = triangleVertices[(j + 1) % 3];
            const edgeKey = v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
            if (!edgeToTriangles.has(edgeKey)) edgeToTriangles.set(edgeKey, []);
            edgeToTriangles.get(edgeKey).push(i);
        }
    }
    for (const triangles of edgeToTriangles.values()) {
        if (triangles.length === 2) {
            const [triA, triB] = triangles;
            if (!adjacency.has(triA)) adjacency.set(triA, []);
            if (!adjacency.has(triB)) adjacency.set(triB, []);
            adjacency.get(triA).push(triB);
            adjacency.get(triB).push(triA);
        }
    }
    const separatedGeometries = [];
    for (let i = 0; i < numTriangles; i++) {
        if (!visited[i]) {
            const componentTriangles = [], queue = [i];
            visited[i] = true;
            while (queue.length > 0) {
                const currentTri = queue.shift();
                componentTriangles.push(currentTri);
                const neighbors = adjacency.get(currentTri) || [];
                for (const neighbor of neighbors) {
                    if (!visited[neighbor]) {
                        visited[neighbor] = true;
                        queue.push(neighbor);
                    }
                }
            }
            const newPositions = new Float32Array(componentTriangles.length * 9);
            for (let k = 0; k < componentTriangles.length; k++) {
                const triIndex = componentTriangles[k];
                for (let v = 0; v < 9; v++) newPositions[k * 9 + v] = positions[triIndex * 9 + v];
            }
            const newGeo = new THREE.BufferGeometry();
            newGeo.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
            separatedGeometries.push(newGeo);
        }
    }
    return separatedGeometries;
}

function getBoardsSpec() {
    const gap = 20;
    const specsRaw = boards.map(b => ({
        length: Math.max(0, parseFloat(b.lengthInput.value) || 0),
        width: Math.max(0, parseFloat(b.widthInput.value) || 0),
        margin: Math.max(0, parseFloat(b.marginInput.value) || 0),
    }));
    let x = 0;
    const specs = specsRaw.map((s, i) => {
        const xOffset = x;
        x += s.length + (i < specsRaw.length - 1 ? gap : 0);
        return { ...s, xOffset, yOffset: 0, gap };
    });
    window.sheets = specs;
    return specs;
}

function redrawBoardsOnly(svg) {
    if (!svg) return;
    svg.querySelectorAll('defs').forEach(d => d.remove());
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.setAttribute("id", "boardPattern");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", "10");
    pattern.setAttribute("height", "10");

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", "10");
    bg.setAttribute("height", "10");
    bg.setAttribute("fill", "#F0E0B2");

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", "10");
    line.setAttribute("y2", "0");
    line.setAttribute("stroke", "#b57a3a");
    line.setAttribute("stroke-width", "0.8");
    line.setAttribute("opacity", "0.55");

    pattern.appendChild(bg);
    pattern.appendChild(line);
    defs.appendChild(pattern);
    svg.appendChild(defs);

    const specs = getBoardsSpec();
    const old = svg.querySelector('#boards-layer');
    if (old) old.remove();

    const boardsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    boardsLayer.setAttribute('id', 'boards-layer');

    specs.forEach((b, i) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.classList.add("board-rect");
        rect.setAttribute("x", b.xOffset);
        rect.setAttribute("y", 0);
        rect.setAttribute("width", b.length);
        rect.setAttribute("height", b.width);
        rect.setAttribute("fill", "url(#boardPattern)");
        rect.setAttribute("data-board-index", String(i + 1));
        boardsLayer.appendChild(rect);
    });
    // flipGroup内に挿入（Y軸反転対応）
    const flipTarget = svg.querySelector('#content-flip');
    if (flipTarget) {
        flipTarget.insertBefore(boardsLayer, flipTarget.firstChild);
    } else {
        svg.insertBefore(boardsLayer, svg.firstChild);
    }
    renderBoardInfo();
}


/**
 * ループの符号付き面積（ shoelace formula ）
 */
function polygonArea(loop) {
    let a = 0;
    for (let i = 0; i < loop.length; i++) {
        const p = loop[i];
        const q = loop[(i + 1) % loop.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

/**
 * ポリラインの総周長
 */
function polylineLength(loop) {
    let len = 0;
    for (let i = 1; i < loop.length; i++) {
        len += Math.hypot(loop[i].x - loop[i-1].x, loop[i].y - loop[i-1].y);
    }
    return len;
}

function simplifyLoop(loop) {
    if (loop.length < 3) return loop;
    const simplified = [loop[0]];
    for (let i = 1; i < loop.length - 1; i++) {
        const prev = simplified[simplified.length - 1];
        const curr = loop[i];
        const next = loop[i + 1];

        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;

        const cross = dx1 * dy2 - dy1 * dx2;
        const dot = dx1 * dx2 + dy1 * dy2;

        const len1 = Math.hypot(dx1, dy1);
        const len2 = Math.hypot(dx2, dy2);
        if (len1 > 0 && len2 > 0) {
            const sinTheta = cross / (len1 * len2);
            if (Math.abs(sinTheta) < 1e-4 && dot > 0) {
                continue;
            }
        }
        simplified.push(curr);
    }
    simplified.push(loop[loop.length - 1]);
    return simplified;
}

function displayAsSvg(geometries) {
    svgContainer.innerHTML = '';
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    svg.setAttribute("overflow", "visible");
    svg.style.overflow = "visible";

    const specs = getBoardsSpec();
    const board1 = specs[0] || { length: 1000, width: 140, margin: 5, xOffset: 0, yOffset: 0 };
    const boardLength = board1.length;
    const boardWidth = board1.width;
    const margin = board1.margin;

    const totalBoardsWidth = specs.reduce((acc, b, i) => acc + b.length + (i < specs.length - 1 ? b.gap : 0), 0) || boardLength;
    const maxBoardHeight = Math.max(...specs.map(b => b.width), boardWidth);

    svg.setAttribute("width", `${totalBoardsWidth}mm`);
    svg.setAttribute("height", `${maxBoardHeight}mm`);
    svg.setAttribute("viewBox", `0 0 ${totalBoardsWidth} ${maxBoardHeight}`);
    svgContainer.appendChild(svg);

    // Y軸反転グループ（左下原点に変換）
    const flipGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    flipGroup.setAttribute('id', 'content-flip');
    flipGroup.setAttribute('transform', `translate(0, ${maxBoardHeight}) scale(1, -1)`);
    svg.appendChild(flipGroup);

    // テキスト反転補正スタイルをSVG内にインライン追加（エクスポート時にも有効）
    const svgStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    svgStyle.textContent = '#content-flip text { transform-box: fill-box; transform-origin: center; transform: scaleY(-1); }';
    svg.insertBefore(svgStyle, svg.firstChild);

    redrawBoardsOnly(svg);

    let currentOffsetX = (board1.xOffset || 0) + margin;
    let currentOffsetY = margin;
    let rowMaxHeight = 0;
    let maxExtentX = totalBoardsWidth;
    let maxExtentY = maxBoardHeight;

    geometries.forEach((geometry, index) => {
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const positions = geometry.attributes.position.array;
        if (positions.length === 0) return;

        const projections = { xy: [], xz: [], yz: [] };
        let boundsXY = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        let boundsXZ = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        let boundsYZ = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        for (let i = 0; i < positions.length; i += 9) {
            const p1={x:positions[i],y:positions[i+1],z:positions[i+2]},
                  p2={x:positions[i+3],y:positions[i+4],z:positions[i+5]},
                  p3={x:positions[i+6],y:positions[i+7],z:positions[i+8]};
            projections.xy.push({p1:{x:p1.x,y:p1.y},p2:{x:p2.x,y:p2.y},p3:{x:p3.x,y:p3.y}});
            projections.xz.push({p1:{x:p1.x,y:p1.z},p2:{x:p2.x,y:p2.z},p3:{x:p3.x,y:p3.z}});
            projections.yz.push({p1:{x:p1.y,y:p1.z},p2:{x:p2.y,y:p2.z},p3:{x:p3.y,y:p3.z}});
        }

        function expandBounds(bounds, tris){
            tris.forEach(tri=>{
                [tri.p1,tri.p2,tri.p3].forEach(p=>{
                    if(p.x<bounds.minX) bounds.minX=p.x; if(p.x>bounds.maxX) bounds.maxX=p.x;
                    if(p.y<bounds.minY) bounds.minY=p.y; if(p.y>bounds.maxY) bounds.maxY=p.y;
                });
            });
        }
        expandBounds(boundsXY, projections.xy); expandBounds(boundsXZ, projections.xz); expandBounds(boundsYZ, projections.yz);

        const areaXY=(boundsXY.maxX-boundsXY.minX)*(boundsXY.maxY-boundsXY.minY);
        const areaXZ=(boundsXZ.maxX-boundsXZ.minX)*(boundsXZ.maxY-boundsXZ.minY);
        const areaYZ=(boundsYZ.maxX-boundsYZ.minX)*(boundsYZ.maxY-boundsYZ.minY);

        let bestProjection=projections.xy; let bestBounds=boundsXY;
        let uAxis = 'x', vAxis = 'y', sliceAxis = 'z';

        if(areaXZ>areaXY && areaXZ>=areaYZ){
            bestProjection=projections.xz; bestBounds=boundsXZ;
            uAxis = 'x'; vAxis = 'z'; sliceAxis = 'y';
        }
        else if(areaYZ>areaXY && areaYZ>areaXZ){
            bestProjection=projections.yz; bestBounds=boundsYZ;
            uAxis = 'y'; vAxis = 'z'; sliceAxis = 'x';
        }

        const partWidth = (bestBounds.maxX - bestBounds.minX);
        const partHeight = (bestBounds.maxY - bestBounds.minY);
        if (!isFinite(partWidth) || !isFinite(partHeight) || partWidth<=0 || partHeight<=0) return;

        if (currentOffsetX + partWidth + margin > boardLength) {
            currentOffsetX = margin; currentOffsetY += rowMaxHeight + margin; rowMaxHeight = 0;
        }

        const initialX = currentOffsetX; const initialY = currentOffsetY;
        const outer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        outer.id = `part-${index}`; outer.dataset.x = initialX; outer.dataset.y = initialY; outer.dataset.angle = 0;

        const centerX = partWidth / 2; const centerY = partHeight / 2;
        const partNo = index + 1; const partLabel = `部品${partNo}`;
        const partKey = toPartKey(partWidth, partHeight);
        const shapeKey = toShapeKey(partWidth, partHeight, bestProjection, bestBounds);
        const partColor = getColorForPartKey(shapeKey);
        outer.dataset.centerX = centerX; outer.dataset.centerY = centerY;
        outer.dataset.partW = partWidth; outer.dataset.partH = partHeight;
        outer.dataset.partNo = partNo; outer.dataset.partLabel = partLabel;
        outer.dataset.partKey = partKey; outer.dataset.partColor = partColor;

        outer.setAttribute("transform", `translate(${initialX} ${initialY})`);

        const inner = document.createElementNS("http://www.w3.org/2000/svg", "g");
        inner.classList.add("rot-group");
        inner.setAttribute("transform", `rotate(0, ${centerX}, ${centerY})`);

        const outlineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        outlineGroup.setAttribute("class","part-outline");
        
        const fillGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        fillGroup.setAttribute("class","part-fill"); 


        
        // ちょうど50%の高さだと頂点や平面と完全に重なって計算エラー（欠損）が起きやすいため、
        // 0.0001234 という極小のオフセットを足して「重なり」を回避します。
        const sliceVal = ((bbox.min[sliceAxis] + bbox.max[sliceAxis]) / 2) + 0.0001234;
        const segments = [];

        for (let i = 0; i < positions.length; i += 9) {
            const p = [
                { x: positions[i],   y: positions[i+1], z: positions[i+2] },
                { x: positions[i+3], y: positions[i+4], z: positions[i+5] },
                { x: positions[i+6], y: positions[i+7], z: positions[i+8] }
            ];
            const d = [ p[0][sliceAxis] - sliceVal, p[1][sliceAxis] - sliceVal, p[2][sliceAxis] - sliceVal ];

            let posIdx = [], negIdx = [], zeroIdx = [];
            d.forEach((val, idx) => {
                if (val > 1e-5) posIdx.push(idx);
                else if (val < -1e-5) negIdx.push(idx);
                else zeroIdx.push(idx);
            });

            if (posIdx.length > 0 && negIdx.length > 0) {
                const pts = [];
                for (let k = 0; k < 3; k++) {
                    let next = (k+1)%3;
                    if ((d[k] > 1e-5 && d[next] < -1e-5) || (d[k] < -1e-5 && d[next] > 1e-5)) {
                        const t = d[k] / (d[k] - d[next]);
                        const u = p[k][uAxis] + (p[next][uAxis] - p[k][uAxis]) * t;
                        const v = p[k][vAxis] + (p[next][vAxis] - p[k][vAxis]) * t;
                        pts.push({ x: u, y: v });
                    }
                }
                if (zeroIdx.length === 1) pts.push({ x: p[zeroIdx[0]][uAxis], y: p[zeroIdx[0]][vAxis] });
                if (pts.length === 2) segments.push({ p1: pts[0], p2: pts[1] });
            } else if (zeroIdx.length === 2) {
                segments.push({ p1: { x: p[zeroIdx[0]][uAxis], y: p[zeroIdx[0]][vAxis] }, p2: { x: p[zeroIdx[1]][uAxis], y: p[zeroIdx[1]][vAxis] } });
            }
        }

        const edgesObj = new Map();
        // 精度は元の高く厳密な状態（1e4）に戻し、誤ったパスのジャンプ（欠損）を防ぐ
        const prec = 1e4;
        function getPtKey(p) { return `${Math.round(p.x * prec)},${Math.round(p.y * prec)}`; }
        
        segments.forEach(seg => {
            const k1 = getPtKey(seg.p1);
            const k2 = getPtKey(seg.p2);
            if (k1 === k2) return;
            const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
            if (edgesObj.has(key)) {
                edgesObj.get(key).count++;
            } else {
                edgesObj.set(key, { count: 1, seg: seg });
            }
        });

        const boundarySegments = [];
        edgesObj.forEach(val => {
            if (val.count === 1) boundarySegments.push(val.seg);
        });

        const loops = [];
        const used = new Array(boundarySegments.length).fill(false);
        // 距離の許容誤差も元の厳密な状態（1e-8）に戻す
        const EPS_SQ = 1e-8;
        const distSq = (a, b) => (a.x - b.x)**2 + (a.y - b.y)**2;

        for (let i = 0; i < boundarySegments.length; i++) {
            if (used[i]) continue;
            const loop = [boundarySegments[i].p1, boundarySegments[i].p2];
            used[i] = true;
            let currentPt = boundarySegments[i].p2;

            while (true) {
                let found = false;
                for (let j = 0; j < boundarySegments.length; j++) {
                    if (used[j]) continue;
                    if (distSq(currentPt, boundarySegments[j].p1) < EPS_SQ) {
                        loop.push(boundarySegments[j].p2); currentPt = boundarySegments[j].p2; used[j] = true; found = true; break;
                    } else if (distSq(currentPt, boundarySegments[j].p2) < EPS_SQ) {
                        loop.push(boundarySegments[j].p1); currentPt = boundarySegments[j].p1; used[j] = true; found = true; break;
                    }
                }
                if (!found) break;
            }
            loops.push(loop);
        }

        // 加工順を「内側の穴・はめ込み形状 → 外側の輪郭」にするため、
        // 面積が小さいループ（内側の穴）から先に並べ、最大面積（外形）を最後にする。
        // こうすることで、部品が材料から切り離される前に内側の加工を終えられる。
        loops.sort((a, b) => Math.abs(polygonArea(a)) - Math.abs(polygonArea(b)));

        let fullPathD = "";
        loops.forEach(loop => {
            const simplified = simplifyLoop(loop);
            // 極小・退化ループを除去（Cut2Dへのインポートエラー防止）
            if (simplified.length < 3) return;
            if (polylineLength(simplified) < 0.1) return;
            if (Math.abs(polygonArea(simplified)) < 0.01) return;
            let dStr = `M ${simplified[0].x - bestBounds.minX} ${simplified[0].y - bestBounds.minY}`;
            for (let k = 1; k < simplified.length; k++) {
                dStr += ` L ${simplified[k].x - bestBounds.minX} ${simplified[k].y - bestBounds.minY}`;
            }
            if (distSq(simplified[0], simplified[simplified.length-1]) < EPS_SQ) dStr += ' Z';
            fullPathD += dStr + " ";
        });

        if (fullPathD) {
            const pathNode = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathNode.setAttribute("d", fullPathD);
            pathNode.setAttribute("fill", "none");
            pathNode.setAttribute("stroke", "black");
            pathNode.setAttribute("stroke-width", "0.5");
            pathNode.setAttribute("vector-effect", "non-scaling-stroke");
            outlineGroup.appendChild(pathNode);

            const fillNode = pathNode.cloneNode();
            fillNode.setAttribute("fill", partColor);
            fillNode.setAttribute("fill-rule", "evenodd");
            // SVG特有の細い隙間（白い線）を隠すための同色フチ取りは残しておく
            fillNode.setAttribute("stroke", partColor);
            fillNode.setAttribute("stroke-width", "0.5");
            fillNode.setAttribute("stroke-linejoin", "round");
            fillGroup.appendChild(fillNode);
        }

        inner.appendChild(outlineGroup);
        inner.appendChild(fillGroup);

        const dimText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        dimText.setAttribute("class", "part-dim-text");
        dimText.setAttribute("x", centerX.toString());
        dimText.setAttribute("y", centerY.toString());
        dimText.setAttribute("text-anchor", "middle");
        dimText.setAttribute("dominant-baseline", "middle");

        const badge = document.createElementNS("http://www.w3.org/2000/svg", "g");
        badge.setAttribute("class", "part-no-badge");
        const badgeCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        badgeCircle.setAttribute("class", "part-no-circle");
        badgeCircle.setAttribute("r", "9");
        badgeCircle.setAttribute("fill", partColor);
        const badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        badgeText.setAttribute("class", "part-no-text");
        badgeText.setAttribute("text-anchor", "middle");
        badgeText.setAttribute("dominant-baseline", "central");
        badgeText.textContent = String(partNo);
        badge.appendChild(badgeCircle);
        badge.appendChild(badgeText);

        const grainTag = document.createElementNS("http://www.w3.org/2000/svg", "text");
        grainTag.setAttribute("class", "part-grain-tag");
        grainTag.textContent = '木目注意';

        let partArea = 0;
        bestProjection.forEach(tri => {
          const ax = tri.p1.x - bestBounds.minX, ay = tri.p1.y - bestBounds.minY;
          const bx = tri.p2.x - bestBounds.minX, by = tri.p2.y - bestBounds.minY;
          const cx = tri.p3.x - bestBounds.minX, cy = tri.p3.y - bestBounds.minY;
          partArea += Math.abs((ax*(by-cy) + bx*(cy-ay) + cx*(ay-by)) / 2);
        });
        outer.dataset.partArea = partArea;

        dimText.textContent = `${partLabel}  ${Math.round(partWidth)} × ${Math.round(partHeight)} mm`;

        outer.appendChild(inner);
        outer.appendChild(dimText);
        outer.appendChild(badge);
        outer.appendChild(grainTag);
        // 部品はflipGroupに追加（Y軸反転対応）
        const fg = svg.querySelector('#content-flip');
        (fg || svg).appendChild(outer);
        refreshPartVisualState(outer);

        maxExtentX = Math.max(maxExtentX, initialX + partWidth + margin);
        maxExtentY = Math.max(maxExtentY, initialY + partHeight + margin);

        currentOffsetX += partWidth + margin;
        if (partHeight > rowMaxHeight) rowMaxHeight = partHeight;
    });

    const requiredLength = Math.max(totalBoardsWidth, maxExtentX);
    const DIM_EXTRA_PAD = 40;
    const requiredHeight = Math.max(maxBoardHeight,  maxExtentY) + DIM_EXTRA_PAD;
    svg.setAttribute('width', `${requiredLength}mm`);
    svg.setAttribute('height', `${requiredHeight}mm`);
    svg.setAttribute('viewBox', `0 0 ${requiredLength} ${requiredHeight}`);

    // Y軸反転グループのtransformを最終高さで更新
    const flipG = svg.querySelector('#content-flip');
    if (flipG) flipG.setAttribute('transform', `translate(0, ${requiredHeight}) scale(1, -1)`);

    redrawBoardsOnly(svg);
    makeInteractive(svg);
    applyZoomToSvg(svg);
    requestAnimationFrame(()=>applyZoomToSvg(svg));
    updateLearningPanels();
}

// viewBox再計算（部品・板の移動後に呼ぶ）
function recalcViewBox(svg, options) {
    if (!svg) return;
    options = options || {};
    const oldView = getSvgViewBoxSize(svg);
    const oldRect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : {width:0, height:0};
    const preserveScale = !!options.preserveScale;
    const keepScale = (preserveScale && oldView.width > 0 && oldRect.width > 0) ? (oldRect.width / oldView.width) : null;

    let minVX = Infinity;
    let minVY = Infinity;
    let maxVX = -Infinity;
    let maxVY = -Infinity;

    function includeRect(x1, y1, x2, y2, pad) {
        if (![x1, y1, x2, y2].every(Number.isFinite)) return;
        pad = Number.isFinite(pad) ? pad : 0;
        const left = Math.min(x1, x2) - pad;
        const right = Math.max(x1, x2) + pad;
        const bottom = Math.min(y1, y2) - pad;
        const top = Math.max(y1, y2) + pad;
        minVX = Math.min(minVX, left);
        minVY = Math.min(minVY, bottom);
        maxVX = Math.max(maxVX, right);
        maxVY = Math.max(maxVY, top);
    }

    const boardRects = Array.from(svg.querySelectorAll('.board-rect'));
    if (boardRects.length) {
        boardRects.forEach(r => {
            const rx = parseFloat(r.getAttribute('x')) || 0;
            const ry = parseFloat(r.getAttribute('y')) || 0;
            const rw = parseFloat(r.getAttribute('width')) || 0;
            const rh = parseFloat(r.getAttribute('height')) || 0;
            includeRect(rx, ry, rx + rw, ry + rh, 10);
        });
    } else {
        const specs = getBoardsSpec();
        specs.forEach(s => includeRect(s.xOffset, 0, s.xOffset + s.length, s.width, 10));
    }

    svg.querySelectorAll('g[data-x][id^="part-"]').forEach(el => {
        const x = parseFloat(el.dataset.x || '0') || 0;
        const y = parseFloat(el.dataset.y || '0') || 0;
        const w = parseFloat(el.dataset.partW || '0') || 0;
        const h = parseFloat(el.dataset.partH || '0') || 0;
        const a = parseFloat(el.dataset.angle || '0') || 0;
        const bb = rotatedBBoxRel(w, h, a);
        includeRect(x + bb.minX, y + bb.minY, x + bb.maxX, y + bb.maxY, 24);
    });

    if (!Number.isFinite(minVX) || !Number.isFinite(minVY) || !Number.isFinite(maxVX) || !Number.isFinite(maxVY)) {
        minVX = 0; minVY = 0; maxVX = 100; maxVY = 100;
    }

    minVX = Math.floor(minVX);
    minVY = Math.floor(minVY);
    maxVX = Math.ceil(maxVX);
    maxVY = Math.ceil(maxVY);

    const rW = Math.max(1, maxVX - minVX);
    const rH = Math.max(1, maxVY - minVY);
    svg.setAttribute('viewBox', `${minVX} ${minVY} ${rW} ${rH}`);
    svg.setAttribute('width', `${rW}mm`);
    svg.setAttribute('height', `${rH}mm`);
    svg.setAttribute('overflow', 'visible');
    svg.style.overflow = 'visible';

    const fg = svg.querySelector('#content-flip');
    if (fg) {
        // viewBox のY原点が0以外になっても、左下原点の表示がずれないようにする
        fg.setAttribute('transform', `translate(0, ${2 * minVY + rH}) scale(1, -1)`);
    }

    if (keepScale && Number.isFinite(keepScale) && keepScale > 0) {
        svg.style.transform = 'none';
        svg.style.transformOrigin = '0 0';
        svg.style.width = Math.max(1, rW * keepScale) + 'px';
        svg.style.height = Math.max(1, rH * keepScale) + 'px';
        responsiveFitScale = keepScale / Math.max(zoomScale, 0.01);
    } else {
        applyZoomToSvg(svg);
    }
}

function scheduleRecalcViewBox(svg) {
    if (!svg || svg._kidorinRecalcScheduled) return;
    svg._kidorinRecalcScheduled = true;
    requestAnimationFrame(() => {
        svg._kidorinRecalcScheduled = false;
        recalcViewBox(svg, { preserveScale: true });
    });
}

function updateTransform(outer) {
    const x = parseFloat(outer.dataset.x) || 0;
    const y = parseFloat(outer.dataset.y) || 0;
    outer.setAttribute('transform', `translate(${x}, ${y})`);

    const angle = parseFloat(outer.dataset.angle) || 0;
    const cx = parseFloat(outer.dataset.centerX) || 0;
    const cy = parseFloat(outer.dataset.centerY) || 0;
    const inner = outer.querySelector('.rot-group');
    if (inner) {
      inner.setAttribute('transform', `rotate(${angle}, ${cx}, ${cy})`);
    }
    refreshPartVisualState(outer);
}

function makeInteractive(svg) {
    function rotatePart(outer) {
        let angle = parseFloat(outer.dataset.angle) || 0;
        angle = (angle + 90) % 360;
        outer.dataset.angle = angle;
        updateTransform(outer);
        updateLearningPanels();
    }

    svg.addEventListener('contextmenu', (e) => {
        const outer = e.target.closest && e.target.closest('g[data-x]');
        if (!outer) return;
        e.preventDefault();
        e.stopPropagation();
        rotatePart(outer);
    });

    // ダブルクリックで90度回転
    svg.addEventListener('dblclick', (e) => {
        const outer = e.target.closest && e.target.closest('g[data-x]');
        if (!outer) return;
        e.preventDefault();
        e.stopPropagation();
        rotatePart(outer);
    });

    const DOUBLE_TAP_MS   = 300;
    const DOUBLE_TAP_MOVE = 10;
    let lastTap = { time: 0, x: 0, y: 0, target: null };

    svg.addEventListener('touchend', (e) => {
        const touch = e.changedTouches[0];
        if (!touch) return;
        const now = Date.now();
        const dx = touch.clientX - lastTap.x;
        const dy = touch.clientY - lastTap.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const outer = touch.target.closest && touch.target.closest('g[data-x]');

        if (
            outer &&
            now - lastTap.time < DOUBLE_TAP_MS &&
            dist < DOUBLE_TAP_MOVE &&
            lastTap.target === outer
        ) {
            e.preventDefault();
            rotatePart(outer);
            lastTap = { time: 0, x: 0, y: 0, target: null };
        } else {
            lastTap = { time: now, x: touch.clientX, y: touch.clientY, target: outer };
        }
    }, { passive: false });

    // ドラッグ設定をwindowに保存してタブモード切替時に再利用できるようにする
    window._interactDragConfig = {
        inertia: false,
        modifiers: [],
        listeners: {
            start(event) {
                event.target.style.cursor = 'grabbing';
                // flipGroup内でz-orderを最前面に
                const fg = svg.querySelector('#content-flip');
                (fg || svg).appendChild(event.target);
            },
            move(event) {
                const target = event.target;
                let dx = event.dx;
                let dy = event.dy;

                if (svg && svg.getScreenCTM) {
                    const ctm = svg.getScreenCTM();
                    if (ctm) {
                        dx = event.dx / ctm.a;
                        // Y軸反転のためdyを反転
                        dy = -event.dy / Math.abs(ctm.d);
                    } else {
                        dx = event.dx / getCurrentDisplayScale();
                        dy = -event.dy / getCurrentDisplayScale();
                    }
                } else {
                    dx = event.dx / getCurrentDisplayScale();
                    dy = -event.dy / getCurrentDisplayScale();
                }

                const x = (parseFloat(target.dataset.x) || 0) + dx;
                const y = (parseFloat(target.dataset.y) || 0) + dy;
                target.dataset.x = x;
                target.dataset.y = y;
                updateTransform(target);
                scheduleRecalcViewBox(svg);
            },
            end(event) {
                event.target.style.cursor = 'grab';
                recalcViewBox(svg, { preserveScale: true });
                updateLearningPanels();
            }
        }
    };

    interact('g[data-x]')
        .styleCursor(false)
        .draggable(window._interactDragConfig);

    svg.style.touchAction = 'none';

    let _bd=false,_bx=0,_by=0;
    svg.addEventListener('pointerdown',e=>{
        if(e.target.closest('g[data-x]')||e.target.closest('.tab-marker'))return;
        _bd=true;_bx=e.clientX;_by=e.clientY;svg.style.cursor='grabbing';svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove',e=>{
        if(!_bd)return;
        const sc=getCurrentDisplayScale(),dx=(e.clientX-_bx)/sc,dy=-(e.clientY-_by)/sc;
        _bx=e.clientX;_by=e.clientY;
        svg.querySelectorAll('g[data-x][id^="part-"]').forEach(el=>{
            el.dataset.x=(parseFloat(el.dataset.x)||0)+dx;el.dataset.y=(parseFloat(el.dataset.y)||0)+dy;updateTransform(el);
        });
        svg.querySelectorAll('.board-rect').forEach(r=>{
            r.setAttribute('x',(parseFloat(r.getAttribute('x'))||0)+dx);r.setAttribute('y',(parseFloat(r.getAttribute('y'))||0)+dy);
        });
        svg.querySelectorAll('g.board-dims').forEach(g=>{
            const m=(g.getAttribute('transform')||'').match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)/);
            g.setAttribute('transform','translate('+((m?parseFloat(m[1]):0)+dx)+' '+((m?parseFloat(m[2]):0)+dy)+')');
        });
        scheduleRecalcViewBox(svg);
    });
    svg.addEventListener('pointerup',e=>{if(_bd){_bd=false;svg.style.cursor='';svg.releasePointerCapture(e.pointerId);recalcViewBox(svg, { preserveScale: true });updateLearningPanels();}});
}

/** interact.js のドラッグを無効化する */
function disablePartDrag() {
    try { interact('g[data-x]').draggable(false); } catch(ex) {}
}

/** interact.js のドラッグを再有効化する */
function enablePartDrag() {
    try {
        if (window._interactDragConfig) {
            interact('g[data-x]').styleCursor(false).draggable(window._interactDragConfig);
        } else {
            interact('g[data-x]').draggable(true);
        }
    } catch(ex) {}
}

function renderBoardInfo(){
  const el = document.getElementById('boardInfo');
  if (!el) return;
  if (!window.sheets || !Array.isArray(window.sheets) || window.sheets.length === 0){
    el.innerHTML = '';
    return;
  }
  const rows = window.sheets.map((s, i)=>{
    const n = i + 1;
    const len = Math.round((s.length ?? 0) * 10) / 10;
    const wid = Math.round((s.width ?? 0) * 10) / 10;
    const gap = Math.round((s.margin ?? 0) * 10) / 10;
    return `<div class="board-row">板${n}：長さ ${len} mm／幅 ${wid} mm／部品の間隔 ${gap} mm</div>`;
  }).join('');
  el.innerHTML = rows;
}

const InternalCSG = (function(){
    class Vector {
        constructor(x,y,z){ this.x=x; this.y=y; this.z=z; }
        clone(){ return new Vector(this.x, this.y, this.z); }
        negated(){ return new Vector(-this.x, -this.y, -this.z); }
        plus(a){ return new Vector(this.x+a.x, this.y+a.y, this.z+a.z); }
        minus(a){ return new Vector(this.x-a.x, this.y-a.y, this.z-a.z); }
        times(a){ return new Vector(this.x*a, this.y*a, this.z*a); }
        dividedBy(a){ return new Vector(this.x/a, this.y/a, this.z/a); }
        dot(a){ return this.x*a.x + this.y*a.y + this.z*a.z; }
        lerp(a, t){ return this.plus(a.minus(this).times(t)); }
        length(){ return Math.sqrt(this.dot(this)); }
        unit(){ return this.dividedBy(this.length()); }
        cross(a){ return new Vector(this.y*a.z-this.z*a.y, this.z*a.x-this.x*a.z, this.x*a.y-this.y*a.x); }
    }
    class Vertex {
        constructor(pos, normal){ this.pos = new Vector(pos.x,pos.y,pos.z); this.normal = new Vector(normal.x,normal.y,normal.z); }
        clone(){ return new Vertex(this.pos.clone(), this.normal.clone()); }
        flip(){ this.normal = this.normal.negated(); }
        interpolate(other, t){ return new Vertex(this.pos.lerp(other.pos, t), this.normal.lerp(other.normal, t)); }
    }
    class Plane {
        constructor(normal, w){ this.normal=normal; this.w=w; }
        static fromPoints(a,b,c){
            const n = b.minus(a).cross(c.minus(a));
            const l = n.length();
            if(l < 1e-8) return new Plane(new Vector(0,1,0), 0);
            return new Plane(n.dividedBy(l), n.dividedBy(l).dot(a));
        }
        clone(){ return new Plane(this.normal.clone(), this.w); }
        flip(){ this.normal = this.normal.negated(); this.w = -this.w; }
        splitPolygon(polygon, coplanarFront, coplanarBack, front, back){
            const COPLANAR=0, FRONT=1, BACK=2, SPANNING=3;
            let polygonType = 0; const types = [];
            for(let i=0; i<polygon.vertices.length; i++){
                const t = this.normal.dot(polygon.vertices[i].pos) - this.w;
                const type = (t < -1e-5) ? BACK : (t > 1e-5) ? FRONT : COPLANAR;
                polygonType |= type; types.push(type);
            }
            switch(polygonType){
                case COPLANAR:
                    (this.normal.dot(polygon.plane.normal)>0 ? coplanarFront : coplanarBack).push(polygon); break;
                case FRONT: front.push(polygon); break;
                case BACK: back.push(polygon); break;
                case SPANNING:
                    let f=[], b=[];
                    for(let i=0; i<polygon.vertices.length; i++){
                        let j = (i+1)%polygon.vertices.length;
                        let ti = types[i], tj = types[j];
                        let vi = polygon.vertices[i], vj = polygon.vertices[j];
                        if(ti!==BACK) f.push(vi);
                        if(ti!==FRONT) b.push(vi!==vi?vi.clone():vi);
                        if((ti|tj)===SPANNING){
                            let t = (this.w - this.normal.dot(vi.pos)) / this.normal.dot(vj.pos.minus(vi.pos));
                            let v = vi.interpolate(vj, t);
                            f.push(v); b.push(v.clone());
                        }
                    }
                    if(f.length>=3) front.push(new Polygon(f, polygon.shared));
                    if(b.length>=3) back.push(new Polygon(b, polygon.shared));
                    break;
            }
        }
    }
    class Polygon {
        constructor(vertices, shared){ this.vertices=vertices; this.shared=shared; this.plane=Plane.fromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos); }
        clone(){ return new Polygon(this.vertices.map(v=>v.clone()), this.shared); }
        flip(){ this.vertices.reverse().map(v=>v.flip()); this.plane.flip(); }
    }
    class Node {
        constructor(polygons){
            this.plane = null; this.front = null; this.back = null; this.polygons = [];
            if(polygons) this.build(polygons);
        }
        clone(){
            let node = new Node();
            node.plane = this.plane && this.plane.clone();
            node.front = this.front && this.front.clone();
            node.back = this.back && this.back.clone();
            node.polygons = this.polygons.map(p=>p.clone());
            return node;
        }
        invert(){
            for(let i=0; i<this.polygons.length; i++) this.polygons[i].flip();
            this.plane && this.plane.flip();
            if(this.front) this.front.invert();
            if(this.back) this.back.invert();
            let temp = this.front; this.front = this.back; this.back = temp;
        }
        clipPolygons(polygons){
            if(!this.plane) return polygons.slice();
            let front=[], back=[];
            for(let i=0; i<polygons.length; i++) this.plane.splitPolygon(polygons[i], front, back, front, back);
            if(this.front) front = this.front.clipPolygons(front);
            if(this.back) back = this.back.clipPolygons(back); else back = [];
            return front.concat(back);
        }
        clipTo(bsp){ this.polygons = bsp.clipPolygons(this.polygons); if(this.front) this.front.clipTo(bsp); if(this.back) this.back.clipTo(bsp); }
        allPolygons(){
            let polygons = this.polygons.slice();
            if(this.front) polygons = polygons.concat(this.front.allPolygons());
            if(this.back) polygons = polygons.concat(this.back.allPolygons());
            return polygons;
        }
        build(polygons){
            if(!polygons.length) return;
            if(!this.plane) this.plane = polygons[0].plane.clone();
            let front=[], back=[];
            for(let i=0; i<polygons.length; i++) this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
            if(front.length){ if(!this.front) this.front = new Node(); this.front.build(front); }
            if(back.length){ if(!this.back) this.back = new Node(); this.back.build(back); }
        }
    }
    class CSG {
        constructor(){ this.polygons = []; }
        static fromPolygons(polygons){ let csg = new CSG(); csg.polygons = polygons; return csg; }
        clone(){ let csg = new CSG(); csg.polygons = this.polygons.map(p=>p.clone()); return csg; }
        toPolygons(){ return this.polygons; }
        
        // CSGの足し算（Union）
        union(csg) {
            let a = new Node(this.clone().polygons);
            let b = new Node(csg.clone().polygons);
            a.clipTo(b);
            b.clipTo(a);
            b.invert();
            b.clipTo(a);
            b.invert();
            a.build(b.allPolygons());
            return CSG.fromPolygons(a.allPolygons());
        }

        subtract(csg){
            let a = new Node(this.clone().polygons);
            let b = new Node(csg.clone().polygons);
            a.invert(); a.clipTo(b); b.clipTo(a);
            b.invert(); b.clipTo(a); b.invert(); a.build(b.allPolygons()); a.invert();
            return CSG.fromPolygons(a.allPolygons());
        }
        static fromMesh(mesh) {
            mesh.updateMatrixWorld(true);
            const geo = mesh.geometry;
            if(!geo.attributes.position) return new CSG();
            const pos = geo.attributes.position.array;
            const norm = geo.attributes.normal ? geo.attributes.normal.array : null;
            const polys = [];
            const mat = mesh.matrixWorld;
            const normalMat = new THREE.Matrix3().getNormalMatrix(mat);
            for(let i=0; i<pos.length; i+=9){
                const vertices = [];
                for(let j=0; j<3; j++){
                    let v = new THREE.Vector3(pos[i+j*3], pos[i+j*3+1], pos[i+j*3+2]);
                    v.applyMatrix4(mat);
                    let n = new THREE.Vector3();
                    if(norm){
                        n.set(norm[i+j*3], norm[i+j*3+1], norm[i+j*3+2]);
                        n.applyMatrix3(normalMat).normalize();
                    }
                    vertices.push(new Vertex(v, n));
                }
                polys.push(new Polygon(vertices, mesh.material));
            }
            return CSG.fromPolygons(polys);
        }
        static toMesh(csg, matrix, material) {
            const polys = csg.toPolygons();
            const positions = [];
            const normals = [];
            const invMat = new THREE.Matrix4().copy(matrix).invert();
            const invNormMat = new THREE.Matrix3().getNormalMatrix(invMat);
            for(let i=0; i<polys.length; i++){
                const poly = polys[i];
                for(let j=2; j<poly.vertices.length; j++){
                    const verts = [poly.vertices[0], poly.vertices[j-1], poly.vertices[j]];
                    verts.forEach(v => {
                        let p = new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z);
                        p.applyMatrix4(invMat);
                        positions.push(p.x, p.y, p.z);
                        let n = new THREE.Vector3(v.normal.x, v.normal.y, v.normal.z);
                        n.applyMatrix3(invNormMat).normalize();
                        normals.push(n.x, n.y, n.z);
                    });
                }
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
            if (normals.length > 0) {
                geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
            }
            return new THREE.Mesh(geo, material);
        }
    }
    return CSG;
})();

document.addEventListener('DOMContentLoaded', () => {
    const jointBtn = document.getElementById('generate-joints-button');
    const tboneBtn = document.getElementById('generate-tbone-button');
    const generateAllBtn = document.getElementById('generate-all-button'); // 追加
    
    if (jointBtn) jointBtn.onclick = generateJoints;
    if (tboneBtn) tboneBtn.onclick = generateTBones;
    if (generateAllBtn) generateAllBtn.onclick = generateAll; // 追加
});

function generateJoints() { processJointsLogic(false); }
function generateTBones() { processJointsLogic(true); }
function generateAll() { processJointsLogic(true); }

function makeJointPartData(geometries) {
    return geometries.map(geo => {
        const workingGeo = geo.clone();
        if (!workingGeo.attributes.normal) workingGeo.computeVertexNormals();
        const mesh = new THREE.Mesh(workingGeo, new THREE.MeshNormalMaterial());
        mesh.updateMatrixWorld(true);
        return {
            csg: InternalCSG.fromMesh(mesh),
            box: new THREE.Box3().setFromObject(mesh),
            originalGeo: workingGeo,
            modified: false
        };
    });
}

function chooseJointDivisionCount(splitLen) {
    let bestN = 3;
    let minDiff = Infinity;
    const maxCheckN = Math.max(3, Math.ceil(splitLen / 30));
    for (let n = 1; n <= maxCheckN; n += 2) {
        const toothLen = splitLen / n;
        let penalty = 0;
        if (toothLen < 100) penalty = 100 - toothLen;
        else if (toothLen > 150) penalty = toothLen - 150;
        const score = penalty * 1000 + Math.abs(toothLen - 125);
        if (score < minDiff) { minDiff = score; bestN = n; }
    }
    return Math.max(3, bestN);
}

function detectJointCandidates(geometries) {
    if (!geometries || geometries.length < 2) return [];
    const boxes = geometries.map(geo => {
        const mesh = new THREE.Mesh(geo);
        mesh.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(mesh);
    });
    const found = [];
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const boxA = boxes[i], boxB = boxes[j];
            if (!boxA.intersectsBox(boxB)) continue;
            const intBox = boxA.clone().intersect(boxB);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            intBox.getSize(size);
            intBox.getCenter(center);
            if (size.x <= 0.1 || size.y <= 0.1 || size.z <= 0.1) continue;
            const dims = [
                {axis:'x', val:size.x}, {axis:'y', val:size.y}, {axis:'z', val:size.z}
            ].sort((a,b) => a.val - b.val);
            const splitAxis = dims[2].axis;
            const splitLength = size[splitAxis];
            const divisions = chooseJointDivisionCount(splitLength);
            const lenA = boxA.max[splitAxis] - boxA.min[splitAxis];
            const lenB = boxB.max[splitAxis] - boxB.min[splitAxis];
            const defaultMortiseIndex = lenA > lenB ? i : j;
            const q = v => Math.round(v * 100) / 100;
            const id = `joint-${i}-${j}-${splitAxis}-${q(center.x)}-${q(center.y)}-${q(center.z)}`;
            const selected = jointAssignments.has(id) ? jointAssignments.get(id) : defaultMortiseIndex;
            jointAssignments.set(id, selected === i || selected === j ? selected : defaultMortiseIndex);
            found.push({
                id, label:`J${found.length + 1}`, partAIndex:i, partBIndex:j,
                splitAxis, splitLength, divisions, defaultMortiseIndex,
                selectedMortiseIndex: jointAssignments.get(id),
                center:{x:center.x,y:center.y,z:center.z},
                size:{x:size.x,y:size.y,z:size.z},
                min:{x:intBox.min.x,y:intBox.min.y,z:intBox.min.z},
                max:{x:intBox.max.x,y:intBox.max.y,z:intBox.max.z}
            });
        }
    }
    return found;
}

function makeJointCutterResult(part, candidate, isMortise, options) {
    const withTbone = !!options.withTbone;
    const toolRadius = options.toolRadius;
    const cl = options.clearance / 2.0;
    const pad = 0.5;
    const intBox = new THREE.Box3(
        new THREE.Vector3(candidate.min.x, candidate.min.y, candidate.min.z),
        new THREE.Vector3(candidate.max.x, candidate.max.y, candidate.max.z)
    );
    const targetBox = part.box;
    const wAxis = candidate.splitAxis;
    const remAxes = ['x','y','z'].filter(a => a !== wAxis);
    const l0 = targetBox.max[remAxes[0]] - targetBox.min[remAxes[0]];
    const l1 = targetBox.max[remAxes[1]] - targetBox.min[remAxes[1]];
    const dAxis = l0 > l1 ? remAxes[0] : remAxes[1];
    const hAxis = l0 > l1 ? remAxes[1] : remAxes[0];
    const extDMin = Math.abs(intBox.min[dAxis] - targetBox.min[dAxis]) < 0.1 ? pad : cl * 2.0;
    const extDMax = Math.abs(targetBox.max[dAxis] - intBox.max[dAxis]) < 0.1 ? pad : cl * 2.0;
    const cMin = intBox.min.clone(), cMax = intBox.max.clone();
    cMin[dAxis] -= extDMin; cMax[dAxis] += extDMax;
    cMin[hAxis] -= pad; cMax[hAxis] += pad;
    const vMin = intBox.min[wAxis], vMax = intBox.max[wAxis];
    const step = (vMax - vMin) / candidate.divisions;
    const cylH = (cMax[hAxis] - cMin[hAxis]) + 2.0;
    const hCenter = (cMin[hAxis] + cMax[hAxis]) / 2.0;

    function createCyl(wPos, dPos) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(toolRadius, toolRadius, cylH, 64).toNonIndexed());
        if (hAxis === 'x') mesh.rotation.z = Math.PI / 2;
        else if (hAxis === 'z') mesh.rotation.x = Math.PI / 2;
        mesh.position[wAxis] = wPos; mesh.position[dAxis] = dPos; mesh.position[hAxis] = hCenter;
        mesh.updateMatrixWorld(true);
        return InternalCSG.fromMesh(mesh);
    }

    function getBoxCSG(wMin, wMax) {
        const sx = Math.max(0.01, cMax.x-cMin.x), sy = Math.max(0.01, cMax.y-cMin.y), sz = Math.max(0.01, cMax.z-cMin.z);
        const sw = Math.max(0.01, wMax-wMin);
        const geo = new THREE.BoxGeometry(wAxis==='x'?sw:sx, wAxis==='y'?sw:sy, wAxis==='z'?sw:sz).toNonIndexed();
        const mesh = new THREE.Mesh(geo);
        mesh.position.set((cMin.x+cMax.x)/2, (cMin.y+cMax.y)/2, (cMin.z+cMax.z)/2);
        mesh.position[wAxis] = (wMin+wMax)/2;
        mesh.updateMatrixWorld(true);
        return InternalCSG.fromMesh(mesh);
    }

    let cutter = null;
    for (let k = 0; k < candidate.divisions; k++) {
        if (!(isMortise ? k % 2 === 1 : k % 2 === 0)) continue;
        let cutMin = vMin + k * step, cutMax = vMin + (k+1) * step;
        cutMin -= k === 0 ? pad : cl;
        cutMax += k === candidate.divisions-1 ? pad : cl;
        const boxCsg = getBoxCSG(cutMin, cutMax);
        cutter = cutter === null ? boxCsg : cutter.union(boxCsg);
        if (withTbone) {
            const w1 = cutMin + toolRadius, w2 = cutMax - toolRadius;
            if (k > 0) {
                if (extDMin === cl*2.0) cutter = cutter.union(createCyl(w1,cMin[dAxis]));
                if (extDMax === cl*2.0) cutter = cutter.union(createCyl(w1,cMax[dAxis]));
            }
            if (k < candidate.divisions-1) {
                if (extDMin === cl*2.0) cutter = cutter.union(createCyl(w2,cMin[dAxis]));
                if (extDMax === cl*2.0) cutter = cutter.union(createCyl(w2,cMax[dAxis]));
            }
        }
    }
    return cutter === null ? part.csg : part.csg.subtract(cutter);
}

function captureCurrentLayoutState() {
    const state = {layout:{}, tabs:{}};
    const svg = svgContainer.querySelector('svg');
    if (!svg) return state;
    svg.querySelectorAll('g[data-x][id^="part-"]').forEach(el => {
        state.layout[el.id] = {x:parseFloat(el.dataset.x||0),y:parseFloat(el.dataset.y||0),angle:parseFloat(el.dataset.angle||0)};
        const list = [];
        const rg = el.querySelector('.rot-group');
        if (rg) rg.querySelectorAll('.tab-marker').forEach(m => list.push({tx:parseFloat(m.getAttribute('data-tx')||0),ty:parseFloat(m.getAttribute('data-ty')||0)}));
        if (list.length) state.tabs[el.id] = list;
    });
    return state;
}

function restoreCurrentLayoutState(state) {
    const svg = svgContainer.querySelector('svg');
    if (!svg || !state) return;
    svg.querySelectorAll('g[data-x][id^="part-"]').forEach(el => {
        const saved = state.layout[el.id];
        if (saved) { el.dataset.x=saved.x; el.dataset.y=saved.y; el.dataset.angle=saved.angle; updateTransform(el); }
        const tabs = state.tabs[el.id], rg = el.querySelector('.rot-group');
        if (rg && tabs) tabs.forEach(t => drawTabMarker(rg,t.tx,t.ty));
    });
    recalcViewBox(svg,{preserveScale:true});
    updateLearningPanels();
}

function currentJointOptions(withTbone) {
    const tool = parseFloat(document.getElementById('tool-diameter')?.value);
    const clearance = parseFloat(document.getElementById('clearance-input')?.value);
    return {withTbone:!!withTbone,toolRadius:Number.isFinite(tool)&&tool>0?tool/2:3,clearance:Number.isFinite(clearance)?clearance:0};
}

function rebuildJointModel(withTbone, silent) {
    if (!originalGeometriesCache.length) return {jointCount:0,errorCount:0};
    const savedState = captureCurrentLayoutState();
    const options = currentJointOptions(withTbone);
    lastJointBuildOptions = {withTbone:!!withTbone};
    const partData = makeJointPartData(originalGeometriesCache);
    let jointCount = 0, errorCount = 0;
    for (const candidate of jointCandidates) {
        const selected = jointAssignments.get(candidate.id) ?? candidate.defaultMortiseIndex;
        candidate.selectedMortiseIndex = selected;
        try {
            // 両側の演算が成功してから同時に反映し、片側だけの加工結果を残さない。
            const nextA = makeJointCutterResult(partData[candidate.partAIndex], candidate, selected===candidate.partAIndex, options);
            const nextB = makeJointCutterResult(partData[candidate.partBIndex], candidate, selected===candidate.partBIndex, options);
            partData[candidate.partAIndex].csg = nextA;
            partData[candidate.partBIndex].csg = nextB;
            partData[candidate.partAIndex].modified = true;
            partData[candidate.partBIndex].modified = true;
            jointCount++;
        } catch (e) {
            errorCount++;
            console.error('CSG演算エラー:',candidate.id,e);
        }
    }
    geometriesCache = partData.map(part => part.modified ? InternalCSG.toMesh(part.csg,new THREE.Matrix4()).geometry : part.originalGeo.clone());
    displayAsSvg(geometriesCache);
    restoreCurrentLayoutState(savedState);
    syncJointViewer();
    if (!silent) {
        if (jointCount) alert(`${jointCount} 箇所の交差部に相欠きジョイント${withTbone?'（Tボーン付き）':''}を生成しました。${errorCount?`\n${errorCount} 箇所で演算エラーが発生しました。`:''}`);
        else alert('交差している部品が見つかりませんでした。');
    }
    return {jointCount,errorCount};
}

function processJointsLogic(withTbone) {
    if (!originalGeometriesCache || originalGeometriesCache.length < 2) {
        alert('交差を判定するには、部品が2つ以上必要です。STLを読み込んでください。');
        return;
    }
    jointCandidates = detectJointCandidates(originalGeometriesCache);
    rebuildJointModel(withTbone,false);
}

window.kidorinToggleJointPattern = function(jointId) {
    const candidate = jointCandidates.find(j => j.id === jointId);
    if (!candidate) return null;
    const current = jointAssignments.get(jointId) ?? candidate.defaultMortiseIndex;
    const next = current === candidate.partAIndex ? candidate.partBIndex : candidate.partAIndex;
    jointAssignments.set(jointId,next);
    candidate.selectedMortiseIndex = next;
    const build = rebuildJointModel(lastJointBuildOptions.withTbone,true);
    return {id:jointId,selectedMortiseIndex:next,errorCount:build.errorCount};
};




// === STL初期状態に戻す処理 ===
const resetStlBtn = document.getElementById('reset-stl-button');
if (resetStlBtn) {
    resetStlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        // STLファイルがまだ読み込まれていない場合は処理しない
        if (!stlArrayBufferCache) {
            alert('先にSTLファイルを読み込んでください。');
            return;
        }

        // 確認ダイアログを出す（誤操作防止）
        if (!confirm('ジョイントなどの加工を取り消して、アップロード時の初期状態に戻しますか？')) {
            return;
        }

        // キャッシュされたバイナリデータからSTLを再パース（再読み込み）
        const loader = new THREE.STLLoader();
        const geometry = loader.parse(stlArrayBufferCache);
        
        // ジオメトリを部品ごとに分離してキャッシュを上書き
        originalGeometriesCache = separateGeometries(geometry);
        geometriesCache = originalGeometriesCache.map(geo => geo.clone());
        jointAssignments.clear();
        jointCandidates = detectJointCandidates(originalGeometriesCache);
        
        // 2Dビューを再描画（板への配置も初期状態に戻る）
        displayAsSvg(geometriesCache);
        syncJointViewer();
        
        // ※完了後の alert() は削除しました
    });
}

// ============================================================
// === Mach2/3用 Gコード生成機能 (修正版) ===
// ============================================================

/**
 * SVGパスのd属性をトークン列に分解する
 */
function tokenizeSvgPath(d) {
    // コマンド文字の前後にスペースを挿入してから分割
    const spaced = d.replace(/([MmZzLlHhVvCcSsQqTtAa])/g, ' $1 ')
                     .replace(/,/g, ' ')
                     .replace(/-/g, ' -')          // 負号の前にスペース
                     .replace(/e\s+-/gi, 'e-')     // 指数表記の復元
                     .trim();
    return spaced.split(/\s+/).filter(s => s !== '');
}

/**
 * SVGパスd属性をセグメント列（絶対座標）に変換する
 * 各セグメント: { cmd:'L'|'C'|'A'|'Z', args:[...] }
 * ※ 対応コマンド: M, L, H, V, C, S, Q, T, A, Z（小文字相対座標も変換）
 */
function parseSvgPathToSegments(d) {
    const tokens = tokenizeSvgPath(d);
    const segments = [];
    let cx = 0, cy = 0;   // 現在位置
    let sx = 0, sy = 0;   // サブパス開始点
    let lastCmd = '';
    let lastCtrl = null;  // 直前の制御点（S/T用）
    let i = 0;

    function num() { return parseFloat(tokens[i++]); }
    function flag() { return parseFloat(tokens[i++]); }

    while (i < tokens.length) {
        const raw = tokens[i];
        if (/[a-zA-Z]/.test(raw)) {
            lastCmd = raw;
            i++;
        }
        const cmd = lastCmd;
        const rel = cmd === cmd.toLowerCase() && cmd !== 'Z' && cmd !== 'z';

        switch (cmd.toUpperCase()) {
            case 'M': {
                let x = num(), y = num();
                if (rel) { x += cx; y += cy; }
                segments.push({ cmd: 'M', x, y });
                sx = x; sy = y; cx = x; cy = y;
                lastCtrl = null;
                // Mの後続座標はLとして扱う
                lastCmd = rel ? 'l' : 'L';
                break;
            }
            case 'L': {
                let x = num(), y = num();
                if (rel) { x += cx; y += cy; }
                segments.push({ cmd: 'L', x1: cx, y1: cy, x, y });
                cx = x; cy = y; lastCtrl = null;
                break;
            }
            case 'H': {
                let x = num();
                if (rel) x += cx;
                segments.push({ cmd: 'L', x1: cx, y1: cy, x, y: cy });
                cx = x; lastCtrl = null;
                break;
            }
            case 'V': {
                let y = num();
                if (rel) y += cy;
                segments.push({ cmd: 'L', x1: cx, y1: cy, x: cx, y });
                cy = y; lastCtrl = null;
                break;
            }
            case 'C': {
                let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
                if (rel) { x1+=cx; y1+=cy; x2+=cx; y2+=cy; x+=cx; y+=cy; }
                segments.push({ cmd: 'C', x0:cx, y0:cy, x1, y1, x2, y2, x, y });
                lastCtrl = { x: x2, y: y2 };
                cx = x; cy = y;
                break;
            }
            case 'S': {
                // 直前がC/Sなら制御点を鏡像化、そうでなければ現在点
                let rx1 = lastCtrl ? 2*cx - lastCtrl.x : cx;
                let ry1 = lastCtrl ? 2*cy - lastCtrl.y : cy;
                let x2 = num(), y2 = num(), x = num(), y = num();
                if (rel) { x2+=cx; y2+=cy; x+=cx; y+=cy; }
                segments.push({ cmd: 'C', x0:cx, y0:cy, x1:rx1, y1:ry1, x2, y2, x, y });
                lastCtrl = { x: x2, y: y2 };
                cx = x; cy = y;
                break;
            }
            case 'Q': {
                let x1 = num(), y1 = num(), x = num(), y = num();
                if (rel) { x1+=cx; y1+=cy; x+=cx; y+=cy; }
                // QをCubicに昇格
                const cx1 = cx + 2/3*(x1-cx), cy1 = cy + 2/3*(y1-cy);
                const cx2 =  x + 2/3*(x1- x), cy2 =  y + 2/3*(y1- y);
                segments.push({ cmd:'C', x0:cx, y0:cy, x1:cx1, y1:cy1, x2:cx2, y2:cy2, x, y });
                lastCtrl = { x: x1, y: y1 };
                cx = x; cy = y;
                break;
            }
            case 'T': {
                let rx1 = lastCtrl ? 2*cx - lastCtrl.x : cx;
                let ry1 = lastCtrl ? 2*cy - lastCtrl.y : cy;
                let x = num(), y = num();
                if (rel) { x+=cx; y+=cy; }
                const cx1 = cx + 2/3*(rx1-cx), cy1 = cy + 2/3*(ry1-cy);
                const cx2 =  x + 2/3*(rx1- x), cy2 =  y + 2/3*(ry1- y);
                segments.push({ cmd:'C', x0:cx, y0:cy, x1:cx1, y1:cy1, x2:cx2, y2:cy2, x, y });
                lastCtrl = { x: rx1, y: ry1 };
                cx = x; cy = y;
                break;
            }
            case 'A': {
                let rx=num(), ry=num(), xRot=num(), largeArc=flag(), sweep=flag(), x=num(), y=num();
                if (rel) { x+=cx; y+=cy; }
                segments.push({ cmd:'A', x0:cx, y0:cy, rx, ry, xRot, largeArc, sweep, x, y });
                cx = x; cy = y; lastCtrl = null;
                break;
            }
            case 'Z': {
                segments.push({ cmd: 'Z', x: sx, y: sy });
                cx = sx; cy = sy; lastCtrl = null;
                break;
            }
            default:
                i++; // 不明なトークンをスキップ
        }
    }
    return segments;
}

/**
 * 2D変換行列の適用（translate + rotate）
 * SVG transform="translate(tx,ty) rotate(angle, cx, cy)" を模倣
 */
function applyTransform(x, y, tx, ty, angleDeg, rcx, rcy) {
    if (angleDeg === 0) return { x: x + tx, y: y + ty };
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // 中心(rcx,rcy)まわりに回転
    const dx = x - rcx, dy = y - rcy;
    const rx = dx * cos - dy * sin + rcx;
    const ry = dx * sin + dy * cos + rcy;
    return { x: rx + tx, y: ry + ty };
}

/**
 * ベジェ曲線セグメントを近似円弧（G2/G3）またはG1直線リストに変換する
 * 曲率が円弧として近似できる場合はG2/G3コマンドを返す
 * @returns {Array} Gコード行の配列
 */
/**
 * SVGセグメント列をMach2/3 Gコード行に変換する
 * タブ処理（Z切り上げ）を含む
 */

/**
 * 部品のSVGパスに部品変換（オフセット＋回転）を適用してセグメントを返す
 */
function getTransformedSegments(pathEl, offsetX, offsetY, angle, partW, partH) {
    const d = pathEl.getAttribute('d') || '';
    if (!d.trim()) return [];
    const segs = parseSvgPathToSegments(d);
    if (angle === 0 && offsetX === 0 && offsetY === 0) return segs;
    const rcx = partW / 2, rcy = partH / 2;
    return segs.map(seg => {
        const t = (x, y) => applyTransform(x, y, offsetX, offsetY, angle, rcx, rcy);
        switch (seg.cmd) {
            case 'M': { const p=t(seg.x, seg.y); return {...seg, x:p.x, y:p.y}; }
            case 'L': { const p=t(seg.x, seg.y); return {...seg, x:p.x, y:p.y}; }
            case 'C': {
                const p0=t(seg.x0,seg.y0), p1=t(seg.x1,seg.y1);
                const p2=t(seg.x2,seg.y2), p =t(seg.x, seg.y);
                return {...seg, x0:p0.x,y0:p0.y, x1:p1.x,y1:p1.y, x2:p2.x,y2:p2.y, x:p.x,y:p.y};
            }
            case 'A': {
                const p0=t(seg.x0,seg.y0), p =t(seg.x, seg.y);
                return {...seg, x0:p0.x,y0:p0.y, x:p.x,y:p.y, xRot: seg.xRot + angle};
            }
            case 'Z': { const p=t(seg.x, seg.y); return {...seg, x:p.x, y:p.y}; }
            default: return seg;
        }
    });
}

function segmentsToGcodeLines(segments, svgH, feedRate, plungeRate, clearH, pass1Z, pass2Z, addLine, gcLines, stats) {
    const subpaths = [];
    let cur = null;
    for (const seg of segments) {
        if (seg.cmd === 'M') {
            if (cur && cur.segs.length > 0) subpaths.push(cur);
            cur = { startX: seg.x, startY: seg.y, segs: [] };
        } else if (cur) {
            cur.segs.push(seg);
        }
    }
    if (cur && cur.segs.length > 0) subpaths.push(cur);

    const TOLERANCE = 0.05;
    const multiPass = Math.abs(pass1Z - pass2Z) > 0.001;

    const validSubpaths = [];
    for (const sp of subpaths) {
        const pathLines = [];
        for (const seg of sp.segs) {
            if (seg.cmd === 'L') {
                pathLines.push(`G1X${f3(seg.x)}Y${f3(seg.y)}`);
            } else if (seg.cmd === 'C') {
                for (const gl of cubicToGcode(seg, svgH, feedRate, TOLERANCE)) pathLines.push(gl);
            } else if (seg.cmd === 'A') {
                for (const gl of arcToGcode(seg, svgH, feedRate, TOLERANCE)) pathLines.push(gl);
            } else if (seg.cmd === 'Z') {
                pathLines.push(`G1X${f3(sp.startX)}Y${f3(sp.startY)}`);
            } else if (seg.cmd === 'TAB_UP') {
                pathLines.push(`__TAB_UP__${f3(seg.z)}`);
            } else if (seg.cmd === 'TAB_DOWN') {
                pathLines.push(`__TAB_DOWN__`);
            }
        }
        const hasMeaningfulMove = pathLines
            .map(l => { const m = l.match(/G[12]X([\.\d]+)Y([\.\d]+)/); return m ? {x:parseFloat(m[1]),y:parseFloat(m[2])} : null; })
            .filter(Boolean)
            .some(pt => Math.abs(pt.x - sp.startX) > 0.001 || Math.abs(pt.y - sp.startY) > 0.001);
        if (hasMeaningfulMove) validSubpaths.push({ sp, pathLines });
    }

    if (validSubpaths.length === 0) return;

    // __TAB_UP__Z と __TAB_DOWN__ を実際のGコードに展開する
    const expandTabs = (lines, currentCutZ, plungeR, isFinalPass) => {
        const tabZval = TAB_HEIGHT_Z;
        // currentCutZ は負値。タブ上面(tabZval)が現在パスより浅い場合だけZを上げる。
        // 例: 材料13.5mm・タブ残し8mm → tabZ=-5.5。
        // 1パス目Z=-7.6ではタブ区間だけZ=-5.5へ上げる、
        // 2パス目Z=-13.5でもタブ区間だけZ=-5.5へ上げて切り残す。
        const tabNeedsLift = tabZval > currentCutZ + 0.001;
        for (const gl of lines) {
            if (gl.startsWith('__TAB_UP__')) {
                if (tabNeedsLift) {
                    gcLines.push(addLine(`(TAB UP)`));
                    gcLines.push(addLine(`G1Z${f3(tabZval)}F${plungeR.toFixed(1)}`));
                    if (stats) {
                        stats.tabUpEvents = (stats.tabUpEvents || 0) + 1;
                        if (isFinalPass) stats.finalTabUpEvents = (stats.finalTabUpEvents || 0) + 1;
                    }
                }
            } else if (gl === '__TAB_DOWN__') {
                if (tabNeedsLift) {
                    gcLines.push(addLine(`(TAB DOWN)`));
                    gcLines.push(addLine(`G1Z${f3(currentCutZ)}F${plungeR.toFixed(1)}`));
                }
            } else {
                gcLines.push(addLine(gl));
            }
        }
    };

    for (const { sp, pathLines } of validSubpaths) {
        gcLines.push(addLine(`G00X${f3(sp.startX)}Y${f3(sp.startY)}Z${f3(clearH)}`));
        gcLines.push(addLine(`G00Z5.000`));
        gcLines.push(addLine(`G1Z${f3(pass1Z)}F${plungeRate.toFixed(1)}`));
        expandTabs(pathLines, pass1Z, plungeRate, !multiPass);

        if (multiPass) {
            gcLines.push(addLine(`G1Z${f3(pass2Z)}`));
            expandTabs(pathLines, pass2Z, plungeRate, true);
        }

        gcLines.push(addLine(`G00Z${f3(clearH)}`));
    }
}

function cubicToGcode(seg, svgH, feedRate, tolerance) {
    // 変換済み座標（Y軸反転済み）でのde Casteljau分割によるG1近似
    // 円弧近似は複雑なので、ここでは適応的サンプリングで折れ線に変換しG1で出力する
    // ※ 実用上、SVGのCはほとんどのCNCソフトと互換のある品質が得られる
    const pts = adaptiveSampleCubic(
        seg.x0, seg.y0,
        seg.x1, seg.y1,
        seg.x2, seg.y2,
        seg.x,  seg.y,
        tolerance
    );
    const result = [];
    for (let i = 1; i < pts.length; i++) {
        result.push(`G1X${f3(pts[i].x)}Y${f3(pts[i].y)}`);
    }
    return result;
}

/**
 * 3次ベジェ曲線を誤差 tolerance 以下になるまで適応的にサンプリング
 */
function adaptiveSampleCubic(x0,y0, x1,y1, x2,y2, x3,y3, tol, depth) {
    depth = depth || 0;
    if (depth > 10) return [{x:x3,y:y3}];
    // 中点
    const mx01x=(x0+x1)/2, mx01y=(y0+y1)/2;
    const mx12x=(x1+x2)/2, mx12y=(y1+y2)/2;
    const mx23x=(x2+x3)/2, mx23y=(y2+y3)/2;
    const mx012x=(mx01x+mx12x)/2, mx012y=(mx01y+mx12y)/2;
    const mx123x=(mx12x+mx23x)/2, mx123y=(mx12y+mx23y)/2;
    const midx=(mx012x+mx123x)/2, midy=(mx012y+mx123y)/2;
    // 直線からの最大偏差を確認
    const lx=x3-x0, ly=y3-y0, len=Math.sqrt(lx*lx+ly*ly);
    let err = 0;
    if (len > 1e-9) {
        const nx=-ly/len, ny=lx/len;
        err = Math.abs(nx*(midx-x0)+ny*(midy-y0));
    } else {
        err = Math.sqrt((midx-x0)**2+(midy-y0)**2);
    }
    if (err <= tol) return [{x:x3,y:y3}];
    const left  = adaptiveSampleCubic(x0,y0, mx01x,mx01y, mx012x,mx012y, midx,midy,  tol, depth+1);
    const right = adaptiveSampleCubic(midx,midy, mx123x,mx123y, mx23x,mx23y, x3,y3, tol, depth+1);
    return left.concat(right);
}

/**
 * SVG Arc セグメントをGコード行に変換
 * 真円弧はG2/G3、楕円弧はG1近似にフォールバック
 */
function arcToGcode(seg, svgH, feedRate, tolerance) {
    const { x0, y0, rx, ry, xRot, largeArc, sweep, x, y } = seg;
    const EPS = 1e-6;

    // Y軸はSVG座標をそのまま使用（Cut2D互換・反転なし）
    const sweepCnc = sweep;  // Y反転しないのでsweep方向もそのまま

    // 真円（rx≒ry かつ xRot≒0）のみG2/G3で出力
    if (Math.abs(rx - ry) < EPS * Math.max(rx, ry, 1) && Math.abs(xRot) < 0.01) {
        const r = (rx + ry) / 2;
        const center = svgArcToCenter(x0, y0, r, r, 0, largeArc, sweepCnc, x, y);
        if (center) {
            const I = center.cx - x0;
            const J = center.cy - y0;
            const gcmd = sweepCnc === 0 ? 'G2' : 'G3';
            return [`${gcmd}X${f3(x)}Y${f3(y)}I${f3(I)}J${f3(J)}`];
        }
    }

    // 楕円弧：G1近似にフォールバック
    const pts = sampleSvgArc(x0, y0, rx, ry, xRot, largeArc, sweep, x, y, tolerance, 0);
    return pts.slice(1).map(p => `G1X${f3(p.x)}Y${f3(p.y)}`);
}

/**
 * SVGのアーク（端点形式）→ 中心形式に変換
 * 参考: https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
 */
function svgArcToCenter(x1, y1, rx, ry, phi, fA, fS, x2, y2) {
    if (Math.abs(x1-x2) < 1e-9 && Math.abs(y1-y2) < 1e-9) return null;
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    const dx = (x1-x2)/2, dy = (y1-y2)/2;
    const x1p =  cosPhi*dx + sinPhi*dy;
    const y1p = -sinPhi*dx + cosPhi*dy;
    const x1p2 = x1p*x1p, y1p2 = y1p*y1p;
    let rx2 = rx*rx, ry2 = ry*ry;
    // 半径補正
    const lam = x1p2/rx2 + y1p2/ry2;
    if (lam > 1) { const s=Math.sqrt(lam); rx*=s; ry*=s; rx2=rx*rx; ry2=ry*ry; }
    const num = Math.max(0, rx2*ry2 - rx2*y1p2 - ry2*x1p2);
    const den = rx2*y1p2 + ry2*x1p2;
    const sq = (den < 1e-12) ? 0 : Math.sqrt(num/den);
    const sign = (fA === fS) ? -1 : 1;
    const cxp =  sign * sq * rx * y1p / ry;
    const cyp = -sign * sq * ry * x1p / rx;
    const cx = cosPhi*cxp - sinPhi*cyp + (x1+x2)/2;
    const cy = sinPhi*cxp + cosPhi*cyp + (y1+y2)/2;
    return { cx, cy };
}

/**
 * SVGアークをポイント列にサンプリング（Y軸反転後の座標で返す）
 */
function sampleSvgArc(x1, y1, rx, ry, phi, fA, fS, x2, y2, tolerance, svgH) {
    // Y座標はそのまま使用（反転なし）
    const sweepCnc = fS;
    const center = svgArcToCenter(x1, y1, rx, ry, phi * Math.PI/180, fA, sweepCnc, x2, y2);
    if (!center) return [{x:x2, y:y2}];
    const startAngle = Math.atan2(y1 - center.cy, x1 - center.cx);
    const endAngle   = Math.atan2(y2 - center.cy, x2 - center.cx);
    const r = (rx + ry) / 2;
    let dAngle = endAngle - startAngle;
    if (sweepCnc === 0 && dAngle > 0) dAngle -= 2*Math.PI;
    if (sweepCnc === 1 && dAngle < 0) dAngle += 2*Math.PI;
    const steps = Math.max(4, Math.ceil(Math.abs(dAngle) * r / tolerance));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const a = startAngle + dAngle * (i / steps);
        pts.push({ x: center.cx + r * Math.cos(a), y: center.cy + r * Math.sin(a) });
    }
    return pts;
}

/**
 * 数値を小数3桁・末尾ゼロ除去でフォーマット（Mach2/3標準形式）
 */
function f3(v) {
    // Mach2/3標準: 小数3桁固定（Cut2D互換）
    return v.toFixed(3);
}

/**
 * 行番号付きでGコード行を追加するファクトリ
 */
function makeLineAdder() {
    // マーカー '\x01' を付与。renumberGcLines() でこのマーカー付き行のみ行番号を振る。
    // → 直接 gcLines.push() した行（ファイル先頭メタコメント等）には番号が付かない。
    return function(line) { return '\x01' + line; };
}

/**
 * gcLines 配列の全行に N100, N110, N120... を付け直す
 * （コメント行・% 行・番号なし行は除外）
 */
function renumberGcLines(lines) {
    // addLine() を通った行（マーカー '\x01' 付き）のみ N100, N110... を振る
    // 直接 push() したメタコメント行（%・ファイル名・日付等）は番号なしのまま
    let n = 100;
    return lines.map(l => {
        if (l.startsWith('\x01')) {
            const out = `N${n}${l.slice(1)}`;  // マーカーを除いて番号付与
            n += 10;
            return out;
        }
        return l;  // マーカーなし行（メタコメント等）はそのまま
    });
}

/**
 * SVGパスセグメント列をGコード行に変換する（サブパス単位）
 * @param {Array} segments - parseSvgPathToSegments の出力
 * @param {number} svgH - SVG論理高さ（未使用・互換性のため残存）
 * @param {number} feedRate - 切削送り速度
 * @param {number} plungeRate - 切り込み速度
 * @param {number} clearH - 安全高さ
 * @param {number} pass1Z - 1パス目切削深さ（負値）
 * @param {number} pass2Z - 2パス目切削深さ（負値）。pass1Zと同じなら1パスのみ
 * @param {Function} addLine - 行番号付き追加関数
 */
// タブ残し高さ: generateAndDownloadGcode 内で上書き
let TAB_HEIGHT_Z = -10;

/**
 * セグメント列にタブZ制御を挿入した新しいセグメント列を返す。
 * tabSegs: [{cx, cy, hw}]  (Gコード座標系 = SVGのY反転済み)
 * cutZ: 切削Z（負値）, tabZ: タブ保持Z（負値、cutZより浅い）
 */
/**
 * セグメント列にタブZ制御を挿入する。
 *
 * 判定方法：各セグメントの始点→終点の線分を細かくサンプリングし、
 * タブ中心の「幅方向」の円柱（半径=hw）と交差するかで判定。
 * これにより端点が直接タブ範囲に入らない長い直線でも確実に検出できる。
 */
function insertTabsIntoSegments(segs, tabSegs, cutZ, tabZ, svgH) {
    if (!tabSegs || tabSegs.length === 0) return segs;

    // ----------------------------------------------------------------
    // 弧長ベースのタブ判定
    // 1. セグメント列全体を走査して各タブの最近点(弧長)を求める
    // 2. 各タブの [最近点弧長 - hw, 最近点弧長 + hw] をタブ区間とする
    // 3. タブ区間に入ったらTAB_UP、出たらTAB_DOWN を1回ずつ出力
    // ----------------------------------------------------------------

    // セグメント列から折れ線近似と累積弧長を生成
    // 重要：直線の端点だけで最近点を探すと、長い直線中央のタブを見落とす。
    // そのため各線分への射影点から「タブ中心に最も近い弧長」を求める。
    const lineSpans = []; // {x1,y1,x2,y2,arcStart,len}
    let arcLen = 0;
    let cx = 0, cy = 0;
    let subStartX = 0, subStartY = 0;

    const addSpan = (x1, y1, x2, y2) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len > 0.0001) {
            lineSpans.push({x1, y1, x2, y2, arcStart: arcLen, len});
            arcLen += len;
        }
    };

    for (const seg of segs) {
        if (seg.cmd === 'M') {
            cx = subStartX = seg.x;
            cy = subStartY = seg.y;
        } else if (seg.cmd === 'L') {
            addSpan(cx, cy, seg.x, seg.y);
            cx = seg.x; cy = seg.y;
        } else if (seg.cmd === 'Z') {
            addSpan(cx, cy, subStartX, subStartY);
            cx = subStartX; cy = subStartY;
        } else if (seg.cmd === 'C') {
            const STEPS = 64;
            let px = cx, py = cy;
            for (let i = 1; i <= STEPS; i++) {
                const tt = i/STEPS, u = 1-tt;
                const ex = u*u*u*seg.x0 + 3*u*u*tt*seg.x1 + 3*u*tt*tt*seg.x2 + tt*tt*tt*seg.x;
                const ey = u*u*u*seg.y0 + 3*u*u*tt*seg.y1 + 3*u*tt*tt*seg.y2 + tt*tt*tt*seg.y;
                addSpan(px, py, ex, ey);
                px = ex; py = ey;
            }
            cx = seg.x; cy = seg.y;
        } else if (seg.cmd === 'A') {
            // Aは後段で折れ線Gコード化される。ここでは少なくとも始点-終点の線分で検出する。
            addSpan(cx, cy, seg.x, seg.y);
            cx = seg.x; cy = seg.y;
        }
    }
    const totalArc = arcLen;

    // 各タブの最近点弧長を求める
    const tabArcRanges = [];
    for (const tab of tabSegs) {
        let bestDist = Infinity, bestArc = -1;
        for (const sp of lineSpans) {
            const ux = sp.x2 - sp.x1;
            const uy = sp.y2 - sp.y1;
            const t = Math.max(0, Math.min(1, ((tab.cx - sp.x1) * ux + (tab.cy - sp.y1) * uy) / (sp.len * sp.len)));
            const px = sp.x1 + ux * t;
            const py = sp.y1 + uy * t;
            const d = Math.hypot(tab.cx - px, tab.cy - py);
            if (d < bestDist) {
                bestDist = d;
                bestArc = sp.arcStart + sp.len * t;
            }
        }
        if (bestDist > tab.hw * 2) continue; // タブが輪郭から遠すぎる
        tabArcRanges.push({
            enter: Math.max(0, bestArc - tab.hw),
            exit:  Math.min(totalArc, bestArc + tab.hw)
        });
    }
    // 昇順ソート＆マージ
    tabArcRanges.sort((a, b) => a.enter - b.enter);
    const merged = [];
    for (const r of tabArcRanges) {
        if (merged.length > 0 && r.enter <= merged[merged.length-1].exit) {
            merged[merged.length-1].exit = Math.max(merged[merged.length-1].exit, r.exit);
        } else {
            merged.push({...r});
        }
    }
    if (merged.length === 0) return segs;

    // ----------------------------------------------------------------
    // セグメント列を再走査して TAB_UP/DOWN を挿入
    // ----------------------------------------------------------------
    const out = [];
    let curArc = 0;
    let pcx = 0, pcy = 0;
    let inTab = false;
    let tabIdx = 0; // 次に処理すべきタブ区間のインデックス

    const emitUp   = () => { if (!inTab) { out.push({cmd:'TAB_UP',   z:tabZ}); inTab=true;  } };
    const emitDown = () => { if (inTab)  { out.push({cmd:'TAB_DOWN', z:cutZ}); inTab=false; } };

    // 線分を弧長で分割してTAB_UP/DOWNを挿入
    const processSegArc = (ex, ey, cmd, extra) => {
        const segLen = Math.hypot(ex - pcx, ey - pcy);
        if (segLen < 0.0001) {
            out.push(cmd === 'A' ? {...extra, x:ex, y:ey} : {cmd:'L', x:ex, y:ey});
            return;
        }
        const segStartArc = curArc;
        const segEndArc   = curArc + segLen;

        // この線分に関係するタブ区間を処理
        let prevT = 0;
        for (let ti = tabIdx; ti < merged.length; ti++) {
            const {enter, exit} = merged[ti];
            if (enter >= segEndArc) break;   // この線分より先
            if (exit  <= segStartArc) { tabIdx = ti+1; continue; } // この線分より前

            // タブとの交差あり
            const tEnter = Math.max(0, (enter - segStartArc) / segLen);
            const tExit  = Math.min(1, (exit  - segStartArc) / segLen);

            // タブ前の部分
            if (tEnter > prevT + 0.0001) {
                emitDown();
                out.push({cmd:'L', x: pcx+(ex-pcx)*tEnter, y: pcy+(ey-pcy)*tEnter});
            }
            // タブ区間
            emitUp();
            out.push({cmd:'L', x: pcx+(ex-pcx)*tExit, y: pcy+(ey-pcy)*tExit});
            prevT = tExit;

            if (exit >= segEndArc) break; // タブが線分をまたいで続く
            else { tabIdx = ti+1; }
        }
        // 残り
        if (prevT < 1 - 0.0001) {
            // 次のタブ区間がこの線分内に既にないか確認
            const nextTab = merged[tabIdx];
            if (!nextTab || nextTab.enter >= segEndArc) emitDown();
            out.push({cmd:'L', x:ex, y:ey});
        }
        curArc = segEndArc;
    };

    let mX = 0, mY = 0;
    for (const seg of segs) {
        if (seg.cmd === 'M') {
            emitDown();
            pcx = mX = seg.x; pcy = mY = seg.y;
            out.push(seg); continue;
        }
        if (seg.cmd === 'L') {
            processSegArc(seg.x, seg.y, 'L', null);
            pcx = seg.x; pcy = seg.y; continue;
        }
        if (seg.cmd === 'Z') {
            processSegArc(mX, mY, 'L', null);
            emitDown();
            pcx = mX; pcy = mY; continue;
        }
        if (seg.cmd === 'C') {
            const STEPS = 64;
            for (let i = 1; i <= STEPS; i++) {
                const tt=i/STEPS, u=1-tt;
                const ex=u*u*u*seg.x0+3*u*u*tt*seg.x1+3*u*tt*tt*seg.x2+tt*tt*tt*seg.x;
                const ey=u*u*u*seg.y0+3*u*u*tt*seg.y1+3*u*tt*tt*seg.y2+tt*tt*tt*seg.y;
                processSegArc(ex, ey, 'L', null);
                pcx = ex; pcy = ey;
            }
            continue;
        }
        if (seg.cmd === 'A') {
            processSegArc(seg.x, seg.y, 'A', seg);
            pcx = seg.x; pcy = seg.y; continue;
        }
        if (seg.cmd === 'TAB_UP' || seg.cmd === 'TAB_DOWN') continue; // 既存は無視
        out.push(seg);
    }
    emitDown();
    return out;
}

/*
 * Copyright (c) 2026 Hiroyuki Muramatsu / Mura-lab
 * https://gijyutu.com/main/
 * Released under the MIT License
 */

function toHalfWidth(str){
  if (str == null) return '';
  return String(str)
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[．]/g, '.')
    .replace(/[－]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/[，]/g, ',')
    .replace(/[　\s]/g, '');
}

function sanitizeNumericString(str){
  const s = toHalfWidth(str);
  let t = s.replace(/[^0-9.+-]/g, '');
  t = t.replace(/[+-]/g, (m, offset)=> (offset===0 ? m : ''));
  const firstDot = t.indexOf('.');
  if (firstDot !== -1){
    t = t.slice(0, firstDot+1) + t.slice(firstDot+1).replace(/\./g,'');
  }
  return t;
}

function normalizeNumericInput(el){
  if (!el) return;
  const before = el.value ?? '';
  const after = sanitizeNumericString(before);
  if (before !== after) el.value = after;
}

// ================================================================
// Gコード生成（タブ対応版）
// ================================================================
/**
 * 工具径補正（外側オフセット）
 * エンドミル中心を輪郭の外側 radius mm 移動することで
 * 切削後の部品サイズを設計値と一致させる。
 * - 鋭角コーナーは bevel 処理で安定化（ジョイント形状対応）
 * - C/A セグメントは折れ線にサンプリング
 */
function applyToolRadiusOffset(segs, radius, partBBox) {
    if (!radius || radius <= 0) return segs;

    // ============================================================
    // 工具径補正（外側オフセット・角保持版）
    // ============================================================
    // 以前の版では、鋭角や直角付近で bevel 的に処理するため、
    // 設計上は角である箇所が斜め／丸みのある軌跡に見えることがあった。
    // この版では、各辺を外側へ平行移動し、隣接するオフセット直線の
    // 交点（miter）を求める。90度角は交点で結ぶため、工具中心線も
    // 角を保ち、切削後の部品寸法を設計値に近づける。

    const EPS = 1e-7;
    const CLEAN_EPS = 0.03; // 角付近の0.01〜0.03mm微小往復だけを除去。曲線点列は削り過ぎない
    const CURVE_STEPS = 64;
    const MITER_LIMIT = Math.max(radius * 12, 24); // 通常の90度角は十分通す

    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function polygonArea2(pts) {
        let a = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], q = pts[(i + 1) % pts.length];
            a += p.x * q.y - q.x * p.y;
        }
        return a;
    }
    function lineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        const den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
        if (Math.abs(den) < EPS) return null;
        const px = ((x1*y2 - y1*x2)*(x3-x4) - (x1-x2)*(x3*y4 - y3*x4)) / den;
        const py = ((x1*y2 - y1*x2)*(y3-y4) - (y1-y2)*(x3*y4 - y3*x4)) / den;
        return {x:px, y:py};
    }
    function pointInPoly(pt, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
                (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || EPS) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    function signedDistanceToPolygon(pt, poly) {
        let best = Infinity;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i+1)%poly.length];
            const vx = b.x-a.x, vy = b.y-a.y;
            const len2 = vx*vx + vy*vy;
            const t = len2 > EPS ? Math.max(0, Math.min(1, ((pt.x-a.x)*vx + (pt.y-a.y)*vy) / len2)) : 0;
            const qx = a.x + vx*t, qy = a.y + vy*t;
            best = Math.min(best, Math.hypot(pt.x-qx, pt.y-qy));
        }
        return pointInPoly(pt, poly) ? -best : best;
    }
    function addClean(arr, p) {
        if (arr.length === 0 || dist(arr[arr.length-1], p) > CLEAN_EPS) arr.push(p);
    }

    function cleanMiterOnly(points) {
        // miter交点計算で発生する角付近の微小な往復だけを限定的に整理する。
        // 曲線近似点や通常の長い直線点列は削除しない。
        const DUP_EPS = 0.035;      // ほぼ同一点とみなす距離(mm)
        const SPIKE_EPS = 0.08;     // 微小往復の全体幅(mm)
        const BACK_EPS = 0.20;      // 微小な戻り移動の上限(mm)
        let pts = points
            .filter(p => p && isFinite(p.x) && isFinite(p.y))
            .map(p => ({x:p.x, y:p.y}));

        function removeAdjacentNear(arr) {
            const out = [];
            for (const p of arr) {
                if (out.length === 0 || dist(out[out.length - 1], p) > DUP_EPS) out.push(p);
            }
            if (out.length > 1 && dist(out[0], out[out.length - 1]) <= DUP_EPS) out.pop();
            return out;
        }

        pts = removeAdjacentNear(pts);
        for (let pass = 0; pass < 4 && pts.length >= 3; pass++) {
            let changed = false;
            const out = [];
            const n = pts.length;
            for (let i = 0; i < n; i++) {
                const prev = pts[(i - 1 + n) % n];
                const curr = pts[i];
                const next = pts[(i + 1) % n];
                const dPrev = dist(prev, curr);
                const dNext = dist(curr, next);
                const dAcross = dist(prev, next);

                // prev→curr→next がほぼ同じ場所で小さく往復している点だけ削る
                if (dAcross <= SPIKE_EPS && dPrev <= BACK_EPS && dNext <= BACK_EPS) {
                    changed = true;
                    continue;
                }

                // ごく短い戻り移動。dot<0 かつ両辺が短いときだけ削る。
                const vx1 = curr.x - prev.x, vy1 = curr.y - prev.y;
                const vx2 = next.x - curr.x, vy2 = next.y - curr.y;
                const dot = vx1 * vx2 + vy1 * vy2;
                if (dot < 0 && dPrev <= BACK_EPS && dNext <= BACK_EPS) {
                    changed = true;
                    continue;
                }

                out.push(curr);
            }
            pts = removeAdjacentNear(out);
            if (!changed) break;
        }
        return pts;
    }

    function extractLineLineCorners(sp) {
        // 元SVGで「直線セグメント同士」が接続している角だけを抽出する。
        // C(ベジェ)やA(円弧)を折れ線化した点は対象外にする。
        // さらに今回は、写真で問題になっている「上部側の直線角」だけを対象にする。
        const nodes = [];
        let start = null;
        let px = 0, py = 0;

        for (const s of sp) {
            if (s.cmd === 'M') {
                start = {x:s.x, y:s.y};
                nodes.length = 0;
                nodes.push({x:s.x, y:s.y, inLine:false, outLine:false});
                px = s.x; py = s.y;
            } else if (s.cmd === 'L') {
                if (nodes.length > 0) nodes[nodes.length - 1].outLine = true;
                nodes.push({x:s.x, y:s.y, inLine:true, outLine:false});
                px = s.x; py = s.y;
            } else if (s.cmd === 'C' || s.cmd === 'A') {
                nodes.push({x:s.x, y:s.y, inLine:false, outLine:false});
                px = s.x; py = s.y;
            } else if (s.cmd === 'Z') {
                if (nodes.length > 1 && start) {
                    const last = nodes[nodes.length - 1];
                    if (Math.hypot(last.x - start.x, last.y - start.y) <= CLEAN_EPS) {
                        nodes.pop();
                    }
                    if (nodes.length > 1) {
                        nodes[nodes.length - 1].outLine = true;
                        nodes[0].inLine = true;
                    }
                }
            }
        }

        const corners = [];
        const n = nodes.length;
        if (n < 3) return corners;

        let minY = Infinity, maxY = -Infinity;
        for (const p of nodes) {
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const h = Math.max(maxY - minY, 1);
        // 上部の段差・切り欠き角も拾うため、最上部から一定範囲を対象にする。
        // 300x200程度の部品では約25mm、450x300では約36mm相当。
        const TOP_BAND = Math.max(radius * 8, h * 0.12);

        function prevNode(i) { return nodes[(i - 1 + n) % n]; }
        function nextNode(i) { return nodes[(i + 1) % n]; }
        function unit(vx, vy) {
            const l = Math.hypot(vx, vy);
            return l > EPS ? {x:vx/l, y:vy/l, len:l} : null;
        }

        const DOT_RIGHT_ANGLE = 0.22; // 90度±約13度
        const MIN_EDGE = Math.max(radius * 1.5, 4.0);

        for (let i = 0; i < n; i++) {
            const cur = nodes[i];
            if (!cur.inLine || !cur.outLine) continue;

            // 上部側だけに限定。下部や側面全体に不要な逃げ跡を増やさない。
            if (cur.y > minY + TOP_BAND) continue;

            const prev = prevNode(i);
            const next = nextNode(i);
            const inDir = unit(cur.x - prev.x, cur.y - prev.y);   // 角へ入る直線方向
            const outDir = unit(next.x - cur.x, next.y - cur.y);  // 角から出る直線方向
            if (!inDir || !outDir) continue;
            if (inDir.len < MIN_EDGE || outDir.len < MIN_EDGE) continue;

            const dot = inDir.x * outDir.x + inDir.y * outDir.y;
            if (Math.abs(dot) > DOT_RIGHT_ANGLE) continue;

            corners.push({
                x: cur.x,
                y: cur.y,
                inDir,
                outDir
            });
        }
        return corners;
    }

    function insertCornerReliefs(points, lineCorners) {
        // 上部の直線角だけに、下部の段差角と同じような
        // 「縦→横→縦」の小さな段差状回り込みを追加する。
        // 斜め1本の逃げではなく、工具中心を廃材側に四角く回すことで
        // 溝の上部角に残る工具Rを削りやすくする。
        if (!points || !lineCorners || points.length < 3 || lineCorners.length === 0) return points;

        const STEP = radius;                       // 6mmミルなら3mmの小段差
        const MIN_MITER = radius * 0.95;
        const MAX_MITER = radius * 2.40;
        const FIND_RADIUS = radius * 3.0;

        function unit(vx, vy) {
            const l = Math.hypot(vx, vy);
            return l > EPS ? {x:vx/l, y:vy/l, len:l} : null;
        }

        function nearestLineCornerIndex(p) {
            let best = -1;
            let bestD = Infinity;
            for (let i = 0; i < lineCorners.length; i++) {
                const c = lineCorners[i];
                const d = dist(p, c);
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            return (bestD <= FIND_RADIUS) ? best : -1;
        }

        const out = [];
        const used = new Set();

        for (let i = 0; i < points.length; i++) {
            const cur = points[i];
            out.push(cur);

            const ci = nearestLineCornerIndex(cur);
            if (ci < 0 || used.has(ci)) continue;

            const orig = lineCorners[ci];
            const away = unit(cur.x - orig.x, cur.y - orig.y);
            if (!away) continue;

            const miterLen = dist(cur, orig);
            if (miterLen < MIN_MITER || miterLen > MAX_MITER) continue;

            const d1 = orig.inDir;
            const d2 = orig.outDir;

            // 現在のmiter点から見て、廃材側へ向かう符号を選ぶ。
            const s1 = (away.x * d1.x + away.y * d1.y) >= 0 ? 1 : -1;
            const s2 = (away.x * d2.x + away.y * d2.y) >= 0 ? 1 : -1;

            // 下部の段差と同じ発想の小さな回り込み：
            // cur -> 片側へSTEP -> 角奥へSTEP -> もう片側へSTEP -> cur
            const p1 = { x: cur.x + d1.x * s1 * STEP, y: cur.y + d1.y * s1 * STEP };
            const p2 = { x: p1.x + d2.x * s2 * STEP, y: p1.y + d2.y * s2 * STEP };
            const p3 = { x: cur.x + d2.x * s2 * STEP, y: cur.y + d2.y * s2 * STEP };

            out.push(p1);
            out.push(p2);
            out.push(p3);
            out.push(cur);

            used.add(ci);
        }
        return out;
    }

    // ---- 1) サブパスに分割 ----
    const subpaths = [];
    let cur = null;
    for (const seg of segs) {
        if (seg.cmd === 'M') { cur = [seg]; subpaths.push(cur); }
        else if (cur) cur.push(seg);
    }

    // ---- 1b) 各サブパスがスロット/穴かどうかを判定（複数の手がかりを組み合わせ） ----
    // 手がかり1: 同じsegsに他のサブパスがあり、その内側にある → 穴
    // 手がかり2: partBBoxが渡されていて、サブパスBBoxが部品BBoxから内側に離れている → 穴
    // 手がかり3: サブパスの短辺が閾値（40mm）以下 → 穴（板厚由来のスロットを想定）
    function spToVerts(sp) {
        const vs = []; let px=0, py=0, sx=0, sy=0;
        for (const s of sp) {
            if (s.cmd==='M') { vs.push({x:s.x,y:s.y}); px=sx=s.x; py=sy=s.y; }
            else if (s.cmd==='L') { vs.push({x:s.x,y:s.y}); px=s.x; py=s.y; }
            else if (s.cmd==='C') { vs.push({x:s.x,y:s.y}); px=s.x; py=s.y; }
            else if (s.cmd==='A') { vs.push({x:s.x,y:s.y}); px=s.x; py=s.y; }
        }
        return vs;
    }
    function bboxOf(vs) {
        let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
        for (const v of vs) {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        }
        return {minX, minY, maxX, maxY, w: maxX-minX, h: maxY-minY};
    }
    function centroid(vs) {
        let cx=0, cy=0;
        for (const v of vs) { cx+=v.x; cy+=v.y; }
        return {x:cx/vs.length, y:cy/vs.length};
    }
    const spVertsAll = subpaths.map(sp => spToVerts(sp));
    const spBBoxes = spVertsAll.map(vs => vs.length ? bboxOf(vs) : null);

    const SLOT_SHORT_EDGE_LIMIT = 20;  // 短辺20mm未満は穴・スロット確定
    const EDGE_MARGIN = 5;              // 部品BBoxの端から5mm以内なら「端に接する」

    const isHoleFlags = subpaths.map((sp, i) => {
        const vs = spVertsAll[i];
        const bb = spBBoxes[i];
        if (!vs || vs.length < 3 || !bb) return false;

        // 手がかり1（最優先・穴確定）: 短辺が板厚程度（20mm未満）→ 穴・スロット確定
        // ジョイントスロットは板厚 + T-boneコーナー膨張で幅約12〜19mm。
        // 通常の外周部品は最小でも20mm以上あるため、これで確実に判別できる。
        if (Math.min(bb.w, bb.h) < SLOT_SHORT_EDGE_LIMIT) return true;

        // 手がかり2（外周確定）: 部品BBoxの全端に接する → 外周
        if (partBBox) {
            const t0L = Math.abs(bb.minX - partBBox.minX) < EDGE_MARGIN;
            const t0R = Math.abs(bb.maxX - partBBox.maxX) < EDGE_MARGIN;
            const t0T = Math.abs(bb.minY - partBBox.minY) < EDGE_MARGIN;
            const t0B = Math.abs(bb.maxY - partBBox.maxY) < EDGE_MARGIN;
            if (t0L && t0R && t0T && t0B) return false;
        }

        // 手がかり3: 他のサブパスの内側にある → 穴
        const c = centroid(vs);
        for (let j = 0; j < subpaths.length; j++) {
            if (i === j) continue;
            const vs2 = spVertsAll[j];
            if (vs2.length < 3) continue;
            const bb2 = spBBoxes[j];
            if (bb2.w * bb2.h < bb.w * bb.h) continue;
            if (pointInPoly(c, vs2)) return true;
        }

        // 手がかり4: partBBoxが渡されていて、部品BBox端に接していない → 穴
        if (partBBox) {
            const touchLeft   = Math.abs(bb.minX - partBBox.minX) < EDGE_MARGIN;
            const touchRight  = Math.abs(bb.maxX - partBBox.maxX) < EDGE_MARGIN;
            const touchTop    = Math.abs(bb.minY - partBBox.minY) < EDGE_MARGIN;
            const touchBottom = Math.abs(bb.maxY - partBBox.maxY) < EDGE_MARGIN;
            if (!touchLeft && !touchRight && !touchTop && !touchBottom) return true;
        }

        return false;
    });

    const result = [];
    for (let spIdx = 0; spIdx < subpaths.length; spIdx++) {
        const sp = subpaths[spIdx];
        const isHoleContour = isHoleFlags[spIdx];

        // ---- 2) C/Aを折れ線化して閉ポリゴン頂点列にする ----
        const verts = [];
        let px = 0, py = 0;
        let startX = 0, startY = 0;
        for (const s of sp) {
            if (s.cmd === 'M') {
                addClean(verts, {x:s.x, y:s.y});
                px = startX = s.x;
                py = startY = s.y;
            } else if (s.cmd === 'L') {
                addClean(verts, {x:s.x, y:s.y});
                px = s.x; py = s.y;
            } else if (s.cmd === 'C') {
                for (let i = 1; i <= CURVE_STEPS; i++) {
                    const t = i / CURVE_STEPS, u = 1 - t;
                    const ex = u*u*u*s.x0 + 3*u*u*t*s.x1 + 3*u*t*t*s.x2 + t*t*t*s.x;
                    const ey = u*u*u*s.y0 + 3*u*u*t*s.y1 + 3*u*t*t*s.y2 + t*t*t*s.y;
                    addClean(verts, {x:ex, y:ey});
                }
                px = s.x; py = s.y;
            } else if (s.cmd === 'A') {
                // 円弧は既存のarcToGcodeと同じく近似が可能だが、
                // 工具径補正では安全側として端点を使用する。
                addClean(verts, {x:s.x, y:s.y});
                px = s.x; py = s.y;
            } else if (s.cmd === 'Z') {
                if (Math.hypot(px - startX, py - startY) > CLEAN_EPS) addClean(verts, {x:startX, y:startY});
                px = startX; py = startY;
            }
        }
        if (verts.length < 3) { result.push(...sp); continue; }
        if (dist(verts[0], verts[verts.length-1]) < CLEAN_EPS) verts.pop();
        if (verts.length < 3 || Math.abs(polygonArea2(verts)) < 0.01) { result.push(...sp); continue; }

        const n = verts.length;

        // ---- 3) 各辺の法線方向を決める ----
        // 外周（isHole=false）: 外側候補（+radius）を選択
        // 穴/スロット（isHole=true）: 外側候補の逆（内側、-radius）を選択
        const normals = [];
        for (let i = 0; i < n; i++) {
            const a = verts[i], b = verts[(i+1)%n];
            const dx = b.x-a.x, dy = b.y-a.y;
            const len = Math.hypot(dx, dy);
            if (len < EPS) { normals.push({nx:0, ny:0, len:0}); continue; }
            const c1 = {nx:-dy/len, ny: dx/len};
            const c2 = {nx: dy/len, ny:-dx/len};
            const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
            const p1 = {x: mx + c1.nx * radius * 0.5, y: my + c1.ny * radius * 0.5};
            const p2 = {x: mx + c2.nx * radius * 0.5, y: my + c2.ny * radius * 0.5};
            const d1 = signedDistanceToPolygon(p1, verts);
            const d2 = signedDistanceToPolygon(p2, verts);
            if (!isHoleContour) {
                normals.push(d1 >= d2 ? {...c1, len} : {...c2, len});
            } else {
                // 穴/スロット: 外側候補の逆を採用（内側オフセット）
                normals.push(d1 >= d2 ? {...c2, len} : {...c1, len});
            }
        }

        // ---- 4) 各辺を外側へ平行移動し、隣接オフセット線の交点を求める ----
        const offsetEdges = [];
        for (let i = 0; i < n; i++) {
            const a = verts[i], b = verts[(i+1)%n], no = normals[i];
            offsetEdges.push({
                a: {x:a.x + no.nx * radius, y:a.y + no.ny * radius},
                b: {x:b.x + no.nx * radius, y:b.y + no.ny * radius},
                normal: no
            });
        }

        const final = [];
        for (let i = 0; i < n; i++) {
            const prev = (i - 1 + n) % n;
            const e1 = offsetEdges[prev];
            const e2 = offsetEdges[i];
            let ip = lineIntersection(e1.a, e1.b, e2.a, e2.b);

            if (ip) {
                const miterLen = Math.hypot(ip.x - verts[i].x, ip.y - verts[i].y);
                // 90度角は約4.24mm（半径3mm）なので通す。
                // 極端に長い交点だけ安全のためベベル化する。
                if (miterLen <= MITER_LIMIT) {
                    addClean(final, ip);
                } else {
                    addClean(final, e1.b);
                    addClean(final, e2.a);
                }
            } else {
                // 平行・ほぼ平行の場合は平均法線でずらす。
                const nx = e1.normal.nx + e2.normal.nx;
                const ny = e1.normal.ny + e2.normal.ny;
                const nl = Math.hypot(nx, ny);
                if (nl > EPS) addClean(final, {x:verts[i].x + nx/nl*radius, y:verts[i].y + ny/nl*radius});
                else addClean(final, {x:verts[i].x + e2.normal.nx*radius, y:verts[i].y + e2.normal.ny*radius});
            }
        }
        if (final.length > 1 && dist(final[0], final[final.length-1]) < CLEAN_EPS) final.pop();
        const cleanFinal = cleanMiterOnly(final);
        if (cleanFinal.length >= 3) {
            final.length = 0;
            cleanFinal.forEach(p => final.push(p));
        }
        if (final.length < 3) { result.push(...sp); continue; }

        // ---- 5) 90度外角に逃げ加工を追加 ----
        // 穴・スロット（内側オフセット）ではコーナー逃げ不要・有害なのでスキップ
        const lineCorners = isHoleContour ? [] : extractLineLineCorners(sp);
        const reliefFinal = isHoleContour ? final : insertCornerReliefs(final, lineCorners);

        // ---- 6) 結果セグメント生成 ----
        result.push({cmd:'M', x:reliefFinal[0].x, y:reliefFinal[0].y});
        for (let i = 1; i < reliefFinal.length; i++) result.push({cmd:'L', x:reliefFinal[i].x, y:reliefFinal[i].y});
        result.push({cmd:'Z', x:reliefFinal[0].x, y:reliefFinal[0].y});
    }
    return result;
}
/**
 * オフセット後の輪郭にタブマーカーをスナップし、
 * さらに「タブ全長(2*hw)が収まる直線部の中央」に再配置する。
 *
 * 処理の流れ:
 *   1. オフセット後輪郭をエッジ列(各エッジ=直線セグメント)に分解
 *   2. ユーザーのタブ位置から最近のエッジを特定
 *   3. そのエッジが TAB_LEN(=2*hw) 以上の長さなら、エッジ中央へ移動
 *   4. 短いエッジに置かれた場合は、隣接エッジを連結して
 *      「同方向の連続直線部」を構築し、その中央に再配置
 *   5. 最終的にタブ中心がオフセット輪郭線上に正確に乗る
 */
function snapTabsToOffsetOutline(tabSegments, segs) {
    if (!tabSegments || tabSegments.length === 0) return tabSegments;

    // ---- 1) オフセット後輪郭をエッジ列に分解 ----
    const edges = [];   // {x1, y1, x2, y2, len, ux, uy}
    let px = 0, py = 0, startX = 0, startY = 0;
    for (const seg of segs) {
        if (seg.cmd === 'M') {
            px = seg.x; py = seg.y;
            startX = seg.x; startY = seg.y;
        } else if (seg.cmd === 'L') {
            const len = Math.hypot(seg.x - px, seg.y - py);
            if (len > 0.01) {
                edges.push({
                    x1: px, y1: py, x2: seg.x, y2: seg.y,
                    len, ux: (seg.x-px)/len, uy: (seg.y-py)/len
                });
            }
            px = seg.x; py = seg.y;
        } else if (seg.cmd === 'Z') {
            const len = Math.hypot(startX - px, startY - py);
            if (len > 0.01) {
                edges.push({
                    x1: px, y1: py, x2: startX, y2: startY,
                    len, ux: (startX-px)/len, uy: (startY-py)/len
                });
            }
            px = startX; py = startY;
        }
    }
    if (edges.length === 0) return tabSegments;

    // ---- 2) 同方向の連続直線部をグループ化 ----
    // 以前は直線部の「中央」に強制移動していたため、同じ辺に複数タブを置くと
    // 全タブが同じ場所へ重なる可能性があった。ここではクリック位置に最も近い
    // 位置へスナップし、端部だけタブ半長ぶん内側へクランプする。
    const ANGLE_TOL = Math.cos(0.5 * Math.PI / 180); // 0.5度以内
    const groups = []; // {edgeIdxs:[], totalLen, startArcByEdge:Map}
    let currentGroup = null;
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (currentGroup === null) {
            currentGroup = { edgeIdxs:[i], totalLen: e.len };
        } else {
            const first = edges[currentGroup.edgeIdxs[0]];
            const dot = first.ux * e.ux + first.uy * e.uy;
            if (dot >= ANGLE_TOL) {
                currentGroup.edgeIdxs.push(i);
                currentGroup.totalLen += e.len;
            } else {
                groups.push(currentGroup);
                currentGroup = { edgeIdxs:[i], totalLen: e.len };
            }
        }
    }
    if (currentGroup) groups.push(currentGroup);

    // 閉路の継ぎ目に同方向の直線部がまたがる場合は統合する
    if (groups.length >= 2) {
        const first = groups[0];
        const last  = groups[groups.length-1];
        const ef = edges[first.edgeIdxs[0]];
        const el = edges[last.edgeIdxs[last.edgeIdxs.length-1]];
        const dot = ef.ux * el.ux + ef.uy * el.uy;
        if (dot >= ANGLE_TOL) {
            last.edgeIdxs = last.edgeIdxs.concat(first.edgeIdxs);
            last.totalLen += first.totalLen;
            groups.shift();
        }
    }

    // ---- 3) エッジから直線部グループへの逆引きとグループ内累積長 ----
    const edgeToGroup = new Array(edges.length);
    groups.forEach((g, gi) => {
        g.startArcByEdge = new Map();
        let acc = 0;
        g.edgeIdxs.forEach(ei => {
            edgeToGroup[ei] = gi;
            g.startArcByEdge.set(ei, acc);
            acc += edges[ei].len;
        });
        g.totalLen = acc;
    });

    function pointAtGroupArc(group, arc) {
        const a = Math.max(0, Math.min(group.totalLen, arc));
        for (const ei of group.edgeIdxs) {
            const e = edges[ei];
            const startArc = group.startArcByEdge.get(ei) || 0;
            if (a <= startArc + e.len + 1e-9) {
                const t = Math.max(0, Math.min(1, (a - startArc) / e.len));
                return { cx: e.x1 + (e.x2-e.x1)*t, cy: e.y1 + (e.y2-e.y1)*t, ux:e.ux, uy:e.uy };
            }
        }
        const e = edges[group.edgeIdxs[group.edgeIdxs.length - 1]];
        return { cx: e.x2, cy: e.y2, ux:e.ux, uy:e.uy };
    }

    // ---- 4) 各タブを最近エッジへスナップし、全長が入るよう端部を補正 ----
    return tabSegments.map(tab => {
        const TAB_LEN = tab.hw * 2;

        let bestDist = Infinity, bestEdge = -1, bestT = 0;
        for (let i = 0; i < edges.length; i++) {
            const e = edges[i];
            const t = Math.max(0, Math.min(1,
                ((tab.cx - e.x1)*(e.x2-e.x1) + (tab.cy - e.y1)*(e.y2-e.y1)) / (e.len*e.len)
            ));
            const qx = e.x1 + (e.x2-e.x1)*t;
            const qy = e.y1 + (e.y2-e.y1)*t;
            const d  = Math.hypot(tab.cx - qx, tab.cy - qy);
            if (d < bestDist) { bestDist = d; bestEdge = i; bestT = t; }
        }
        if (bestEdge < 0) return tab;

        const group = groups[edgeToGroup[bestEdge]];
        const edgeArc = (group.startArcByEdge.get(bestEdge) || 0) + edges[bestEdge].len * bestT;

        // 直線部がタブ全長より短い場合は最近点をそのまま使用する。
        // 弧長ベース挿入側で前後のセグメントへまたがるタブとして扱う。
        if (group.totalLen < TAB_LEN + 0.5) {
            const e = edges[bestEdge];
            return {
                cx: e.x1 + (e.x2-e.x1)*bestT,
                cy: e.y1 + (e.y2-e.y1)*bestT,
                hw: tab.hw, ux:e.ux, uy:e.uy
            };
        }

        // タブ全長が直線部からはみ出ないよう、中心を半長ぶん内側にクランプする。
        const clampedArc = Math.max(tab.hw, Math.min(group.totalLen - tab.hw, edgeArc));
        const p = pointAtGroupArc(group, clampedArc);
        return { cx: p.cx, cy: p.cy, hw: tab.hw, ux:p.ux, uy:p.uy };
    });
}

// ============================================================
// 加工後GLB用の2D輪郭・押し出しメッシュ生成
// ============================================================
function machiningSegmentsToLoops(segs, tolerance) {
    const loops = [];
    let points = null;
    const tol = Math.max(0.05, tolerance || 0.25);
    const pushPoint = p => {
        if (!points) points = [];
        const last = points[points.length - 1];
        if (!last || Math.hypot(last.x-p.x, last.y-p.y) > 1e-5) points.push({x:p.x, y:p.y});
    };
    const finish = () => {
        if (!points || points.length < 3) { points = null; return; }
        if (Math.hypot(points[0].x-points[points.length-1].x, points[0].y-points[points.length-1].y) < 1e-4) points.pop();
        if (points.length >= 3) {
            let clean=points;
            for(let pass=0;pass<2;pass++){
                const next=[];
                for(let i=0;i<clean.length;i++){
                    const prev=clean[(i-1+clean.length)%clean.length],cur=clean[i],after=clean[(i+1)%clean.length];
                    const a=Math.hypot(cur.x-prev.x,cur.y-prev.y),b=Math.hypot(after.x-cur.x,after.y-cur.y);
                    if(a<1e-4 || b<1e-4)continue;
                    const cross=(cur.x-prev.x)*(after.y-cur.y)-(cur.y-prev.y)*(after.x-cur.x);
                    if(Math.abs(cross)<=1e-7*a*b)continue;
                    next.push(cur);
                }
                if(next.length<3 || next.length===clean.length)break;
                clean=next;
            }
            if(clean.length>=3)loops.push(clean);
        }
        points = null;
    };
    for (const seg of segs || []) {
        if (seg.cmd === 'M') { finish(); points=[]; pushPoint(seg); }
        else if (seg.cmd === 'L') pushPoint(seg);
        else if (seg.cmd === 'C') {
            adaptiveSampleCubic(seg.x0,seg.y0,seg.x1,seg.y1,seg.x2,seg.y2,seg.x,seg.y,tol)
                .forEach(pushPoint);
        } else if (seg.cmd === 'A') {
            sampleSvgArc(seg.x0,seg.y0,seg.rx,seg.ry,seg.xRot,seg.largeArc,seg.sweep,seg.x,seg.y,tol,0)
                .slice(1).forEach(pushPoint);
        } else if (seg.cmd === 'Z') finish();
    }
    finish();
    return loops;
}

function machiningLoopArea(loop) {
    let area = 0;
    for (let i=0; i<loop.length; i++) {
        const p=loop[i], q=loop[(i+1)%loop.length];
        area += p.x*q.y-q.x*p.y;
    }
    return area/2;
}

function machiningLargestLoop(loops) {
    return (loops || []).reduce((best, loop) =>
        !best || Math.abs(machiningLoopArea(loop)) > Math.abs(machiningLoopArea(best)) ? loop : best, null);
}

function machiningPointInLoop(point, loop) {
    let inside=false;
    for(let i=0,j=loop.length-1;i<loop.length;j=i++){
        const a=loop[i],b=loop[j];
        if(((a.y>point.y)!==(b.y>point.y)) && point.x < (b.x-a.x)*(point.y-a.y)/((b.y-a.y)||1e-12)+a.x) inside=!inside;
    }
    return inside;
}

function machiningClipperPaths(loops, scale) {
    return (loops || []).filter(loop=>loop?.length>=3).map(loop=>{
        const path=loop.map(p=>({X:Math.round(p.x*scale),Y:Math.round(p.y*scale)}));
        if(!ClipperLib.Clipper.Orientation(path))path.reverse();
        return path;
    });
}

function machiningLoopsFromClipper(paths, scale) {
    return (paths || []).map(path=>path.map(p=>({x:p.X/scale,y:p.Y/scale}))).filter(loop=>loop.length>=3);
}

function offsetMachiningOuterLoops(loops, distance) {
    if(typeof ClipperLib==='undefined')throw new Error('切削幅の生成ライブラリを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください。');
    const scale=1000,paths=machiningClipperPaths(loops,scale),solution=new ClipperLib.Paths();
    if(!paths.length)return [];
    const offsetter=new ClipperLib.ClipperOffset(4,Math.max(1,.1*scale));
    offsetter.AddPaths(paths,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
    offsetter.Execute(solution,distance*scale);
    return machiningLoopsFromClipper(solution,scale);
}

function unionMachiningLoops(loops) {
    if(typeof ClipperLib==='undefined')return loops || [];
    const scale=1000,paths=machiningClipperPaths(loops,scale),solution=new ClipperLib.Paths();
    if(!paths.length)return [];
    const clipper=new ClipperLib.Clipper();
    clipper.AddPaths(paths,ClipperLib.PolyType.ptSubject,true);
    clipper.Execute(ClipperLib.ClipType.ctUnion,solution,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
    return machiningLoopsFromClipper(solution,scale);
}

function machiningClassifyLoops(loops) {
    const valid=(loops || []).filter(loop=>loop && loop.length>=3);
    const info=valid.map((loop,index)=>({loop,index,area:Math.abs(machiningLoopArea(loop)),parent:-1,level:0}));
    info.forEach(item=>{
        const probe=item.loop[0];let parent=null;
        info.forEach(candidate=>{
            if(candidate===item || candidate.area<=item.area || !machiningPointInLoop(probe,candidate.loop))return;
            if(!parent || candidate.area<parent.area)parent=candidate;
        });
        item.parent=parent?parent.index:-1;
    });
    const byIndex=new Map(info.map(item=>[item.index,item]));
    const levelOf=item=>item.parent<0?0:levelOf(byIndex.get(item.parent))+1;
    info.forEach(item=>item.level=levelOf(item));
    return info;
}

function createMachiningExtrusionFromLoops(loops, depth) {
    if(!(depth>0))return null;
    const info=machiningClassifyLoops(loops);
    if(!info.length)return null;
    const shapes=[];
    info.filter(item=>item.level%2===0).forEach(solid=>{
        const shape=new THREE.Shape(solid.loop.map(p=>new THREE.Vector2(p.x,p.y)));
        info.filter(h=>h.parent===solid.index && h.level===solid.level+1).forEach(h=>{
            shape.holes.push(new THREE.Path(h.loop.map(p=>new THREE.Vector2(p.x,p.y))));
        });
        shapes.push(shape);
    });
    if(!shapes.length)return null;
    const geo=new THREE.ExtrudeGeometry(shapes,{depth,steps:1,bevelEnabled:false,curveSegments:8});
    geo.applyMatrix4(new THREE.Matrix4().set(
        1,0,0,0,
        0,0,-1,0,
        0,1,0,0,
        0,0,0,1
    ));
    return machiningRemoveDegenerateTriangles(geo);
}

function machiningRemoveDegenerateTriangles(geometry) {
    const geo=geometry.index ? geometry.toNonIndexed() : geometry;
    const pos=geo.getAttribute('position'),kept=[];
    for(let i=0;i+2<pos.count;i+=3){
        const a=[pos.getX(i),pos.getY(i),pos.getZ(i)],b=[pos.getX(i+1),pos.getY(i+1),pos.getZ(i+1)],c=[pos.getX(i+2),pos.getY(i+2),pos.getZ(i+2)];
        const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
        const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
        if(Math.hypot(cross[0],cross[1],cross[2])<=1e-8)continue;
        kept.push(...a,...b,...c);
    }
    if(kept.length===pos.count*3){geo.computeVertexNormals();return geo;}
    const clean=new THREE.BufferGeometry();
    clean.setAttribute('position',new THREE.Float32BufferAttribute(kept,3));
    clean.computeVertexNormals();geo.dispose();return clean;
}

function createMachiningExtrusion(outer, holes, depth) {
    return createMachiningExtrusionFromLoops([outer].concat(holes || []),depth);
}

function createMachiningTabGeometry(tab, toolDiameter, tabHeight, materialThickness) {
    if (!tab || !(tabHeight > 0)) return null;
    const length = Math.max(0.1, (tab.hw || 0)*2);
    const width = Math.max(0.1, toolDiameter);
    const height = Math.min(materialThickness, tabHeight);
    const geo = new THREE.BoxGeometry(length,height,width);
    geo.rotateY(-Math.atan2(tab.uy || 0, tab.ux == null ? 1 : tab.ux));
    geo.translate(tab.cx, -materialThickness + height/2, tab.cy);
    return geo;
}

function applyMachiningBoardUVs(geometry, boardLength, boardWidth, materialThickness) {
    if(!geometry)return geometry;
    const pos=geometry.getAttribute('position');
    if(!pos)return geometry;
    if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
    const normal=geometry.getAttribute('normal'),uv=new Float32Array(pos.count*2);
    const length=Math.max(1e-6,boardLength),width=Math.max(1e-6,boardWidth),thickness=Math.max(1e-6,materialThickness);
    for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        const ax=Math.abs(normal.getX(i)),ay=Math.abs(normal.getY(i)),az=Math.abs(normal.getZ(i));
        let u,v;
        if(ay>=ax && ay>=az){
            // 天面・底面: 板の長手Xを木目(U)、板幅ZをVにする。
            u=x/length;v=z/width;
        }else if(az>=ax){
            // 長辺側面: 木目は天面と同じX方向、Vは板厚方向。
            u=x/length;v=(-y)/thickness;
        }else{
            // 木口面: 板幅方向と板厚方向で展開する。
            u=z/width;v=(-y)/thickness;
        }
        uv[i*2]=u;uv[i*2+1]=v;
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    return geometry;
}

function machiningColorForPart(partEl, fallbackIndex) {
    const raw = partEl?.dataset?.partColor || '';
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    const fallback = ['#dbeafe','#fde68a','#fecdd3','#d1fae5','#e9d5ff','#fed7aa'];
    return fallback[fallbackIndex % fallback.length];
}

function getMachiningLayoutSignature() {
    const svg=document.querySelector('#svg-container svg');
    if(!svg)return '';
    const parts=Array.from(svg.querySelectorAll('g[data-x][id^="part-"]')).map(part=>({
        id:part.id,x:part.dataset.x,y:part.dataset.y,angle:part.dataset.angle,w:part.dataset.partW,h:part.dataset.partH,
        paths:Array.from(part.querySelectorAll('.part-outline path')).map(p=>p.getAttribute('d') || ''),
        tabs:Array.from(part.querySelectorAll('.tab-marker')).map(t=>[t.getAttribute('data-tx'),t.getAttribute('data-ty')])
    }));
    const boards=getBoardsSpecSafe().map(b=>({length:b.length,width:b.width,xOffset:b.xOffset || 0}));
    return JSON.stringify({parts,boards,tool:document.getElementById('tool-diameter')?.value || '',tabHeight:document.getElementById('tab-height-input')?.value || ''});
}

// ============================================================
// === エンドミル径プリセット定義 ===
// 6mm:  2パス（Z-half→Z-材料厚）, S18000, F2000
// 12mm: 1パス（Z-材料厚）,         S17000, F1500
// ============================================================
const MILL_PRESETS = {
    '6': {
        label:      'End Mill {6 mm}',
        spindleRPM: 18000,
        feedRate:   2000,
        plungeRate: 2000,
        twoPass:    true,
    },
    '12': {
        label:      'End Mill {12 mm}',
        spindleRPM: 17000,
        feedRate:   1500,
        plungeRate: 1500,
        twoPass:    false,
    },
};

function generateAndDownloadGcode() {
    const svg = document.querySelector('#svg-container svg');
    if (!svg) { alert('SVGが見つかりません。先にSTLを読み込んでください。'); return; }

    const millSel  = document.getElementById('tool-diameter');
    const millKey  = millSel ? millSel.value : '6';
    const preset   = MILL_PRESETS[millKey] || MILL_PRESETS['6'];
    const millDiam = parseFloat(millKey) || 6;

    const safeMatZ = prompt('材料の厚さ (mm)', '12');
    if (safeMatZ === null) return;
    const matThick = parseFloat(safeMatZ) || 12;

    let pass1Depth = matThick;
    if (preset.twoPass) {
        const safePass1 = prompt('1パス目の切削深さ (mm)', (matThick / 2 * 1.125).toFixed(3));
        if (safePass1 === null) return;
        pass1Depth = parseFloat(safePass1) || matThick / 2;
    }

    const safeFeed = prompt('切削送り速度 (mm/min)', preset.feedRate.toFixed(1));
    if (safeFeed === null) return;
    const feedRate = parseFloat(safeFeed) || preset.feedRate;

    const safePlunge = prompt('切り込み速度 (mm/min)', preset.plungeRate.toFixed(1));
    if (safePlunge === null) return;
    const plungeRate = parseFloat(safePlunge) || preset.plungeRate;

    const safeSpindle = prompt('スピンドル回転数 (rpm)', String(preset.spindleRPM));
    if (safeSpindle === null) return;
    const spindleRPM = parseInt(safeSpindle) || preset.spindleRPM;

    const safeTool = prompt('工具番号', '1');
    if (safeTool === null) return;
    const toolNum = parseInt(safeTool) || 1;

    const safeClearance = prompt('安全高さ (mm)', '7');
    if (safeClearance === null) return;
    const clearH = parseFloat(safeClearance) || 7;

    const pass1Z = preset.twoPass ? -Math.abs(pass1Depth) : -Math.abs(matThick);
    const pass2Z = -Math.abs(matThick);

    const allParts = Array.from(svg.querySelectorAll('g[data-x][id^="part-"]'));
    if (allParts.length === 0) { alert('部品が見つかりません。'); return; }

    let svgH = 0;
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) { const vb = viewBox.trim().split(/[\s,]+/); svgH = parseFloat(vb[3]) || 0; }
    if (!svgH) { try { const bb = svg.getBBox(); svgH = bb.height + bb.y; } catch(e) { svgH = 1000; } }

    const stlBase = (currentStlFileName || '木取り図').replace(/\.stl$/i, '');
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const hh = now.getHours(), mm_t = now.getMinutes();
    const ampm = hh < 12 ? 'AM' : 'PM';
    const hh12 = hh % 12 === 0 ? 12 : hh % 12;
    const dateStr = `${days[now.getDay()]} ${months[now.getMonth()]} ${now.getDate()} ${now.getFullYear()} - ${String(hh12).padStart(2,'0')}:${String(mm_t).padStart(2,'0')} ${ampm}`;

    // ---- ミル径に応じたタブサイズ ----
    const TAB_LEN = millDiam <= 6 ? 16 : 20;

    const TAB_H   = parseFloat(document.getElementById('tab-height-input')?.value) || 8.0;  // タブ残し高さ（設定パネルの入力欄、既定 8mm）
    TAB_HEIGHT_Z  = -(matThick - TAB_H);

    // 板ごとに部品をグループ分け
    const specs = getBoardsSpecSafe();
    const boardPartMap = new Map();
    allParts.forEach(partEl => {
        const board = findBoardForPart(partEl, specs);
        const idx = board ? board.index : 0;
        if (!boardPartMap.has(idx)) boardPartMap.set(idx, []);
        boardPartMap.get(idx).push(partEl);
    });

    const boardIndices = Array.from(boardPartMap.keys()).sort((a, b) => a - b);
    const generatedGcodes = [];
    const machinedBoards = [];

    boardIndices.forEach(boardIdx => {
        const boardSpec = specs[boardIdx] || specs[0];
        const boardXOffset = boardSpec.xOffset || 0;
        const bLength = boardSpec.length;
        const bWidth = boardSpec.width;
        const parts = boardPartMap.get(boardIdx);
        if (!parts || parts.length === 0) return;

        // ---- 部品を左下原点から「左→右、下→上」順にソート ----
        const sortedParts = parts.slice().sort((a, b) => {
            const ax = (parseFloat(a.dataset.x || '0') || 0) - boardXOffset;
            const ay = parseFloat(a.dataset.y || '0') || 0;
            const bx = (parseFloat(b.dataset.x || '0') || 0) - boardXOffset;
            const by = parseFloat(b.dataset.y || '0') || 0;
            // Y座標が近い場合（50mm以内）は同じ行とみなしてXで比較
            if (Math.abs(ay - by) < 50) return ax - bx;
            return ay - by; // Yが小さい（下）から順
        });

        const gcodeStats = { tabMarkers: 0, tabUpEvents: 0, finalTabUpEvents: 0 };
        const machinedParts = [];
        const stockHoles = [];
        const machinedTabs = [];
        const addLine = makeLineAdder();
        const gcLines = [];

        const boardLabel = boardIndices.length > 1 ? `_板${boardIdx + 1}` : '';
        gcLines.push(`%`);
        gcLines.push(`(${stlBase}${boardLabel})`);
        gcLines.push(`( File created: ${dateStr})`);
        gcLines.push(`( Generated by きどりん for CNC - Mach2/3 format)`);
        gcLines.push(`( Material Size)`);
        gcLines.push(`( X= ${bLength.toFixed(3)}, Y= ${bWidth.toFixed(3)}, Z= ${matThick.toFixed(3)})`);
        gcLines.push(`()`);
        gcLines.push(`(Tools used in this file: )`);
        gcLines.push(`(${toolNum} = ${preset.label})`);
        gcLines.push(addLine(`G00G21G17G90G40G49G80`));
        gcLines.push(addLine(`G71G91.1`));
        // Mach2/3のCV制御で角が丸まるのを防ぐため、Exact Stopモードにする
        gcLines.push(addLine(`G61`));
        gcLines.push(addLine(`T${toolNum}M06`));
        gcLines.push(addLine(` (${preset.label})`));
        gcLines.push(addLine(`G00G43Z${f3(clearH)}H${toolNum}`));
        gcLines.push(addLine(`S${spindleRPM}M03`));
        gcLines.push(addLine(`(Toolpath:- ${stlBase}${boardLabel})`));
        gcLines.push(addLine(`()`));
        gcLines.push(addLine(`G94`));
        gcLines.push(addLine(`X0.000Y0.000F${feedRate.toFixed(1)}`));

        // 各部品のパス（ソート済み）
        sortedParts.forEach((partEl, sortedPartIndex) => {
            const offsetX = (parseFloat(partEl.dataset.x     || '0') || 0) - boardXOffset;
            const offsetY = parseFloat(partEl.dataset.y     || '0') || 0;
            const angle   = parseFloat(partEl.dataset.angle || '0') || 0;
            const partW   = parseFloat(partEl.dataset.partW || '0') || 0;
            const partH   = parseFloat(partEl.dataset.partH || '0') || 0;

            // タブマーカーをGコード座標（SVG座標系）に変換
            const tabSegments = [];
            const rotGroup = partEl.querySelector('.rot-group');
            if (rotGroup) {
                rotGroup.querySelectorAll('.tab-marker').forEach(m => {
                    const lx  = parseFloat(m.getAttribute('data-tx') || '0');
                    const ly  = parseFloat(m.getAttribute('data-ty') || '0');
                    const cx  = parseFloat(partEl.dataset.centerX) || partW / 2;
                    const cy  = parseFloat(partEl.dataset.centerY) || partH / 2;
                    const aRad = angle * Math.PI / 180;
                    const dx = lx - cx, dy = ly - cy;
                    const cosA = Math.cos(aRad), sinA = Math.sin(aRad);
                    const rx = cosA * dx - sinA * dy + cx;
                    const ry = sinA * dx + cosA * dy + cy;
                    const wx = offsetX + rx;
                    const wy = offsetY + ry;
                    tabSegments.push({ cx: wx, cy: wy, hw: TAB_LEN / 2 });
                    gcodeStats.tabMarkers += 1;
                });
            }

            let pathEls = partEl.querySelectorAll('.part-outline path');
            if (pathEls.length === 0) pathEls = partEl.querySelectorAll('path');
            if (pathEls.length === 0) return;

            // 部品全体のBBoxを事前計算（スロット/外周判定用）
            // 部品内の全pathの全サブパスから最外殻のBBoxを求める
            const allPathSegs = [];
            pathEls.forEach(pe => {
                const s = getTransformedSegments(pe, offsetX, offsetY, angle, partW, partH);
                allPathSegs.push(s);
            });
            const machiningContours = [];
            let partBBox = null;
            {
                let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
                let count = 0;
                for (const s of allPathSegs) {
                    for (const seg of s) {
                        if (seg.x === undefined || seg.y === undefined) continue;
                        if (seg.x < minX) minX = seg.x; if (seg.x > maxX) maxX = seg.x;
                        if (seg.y < minY) minY = seg.y; if (seg.y > maxY) maxY = seg.y;
                        count++;
                    }
                }
                if (count > 0) partBBox = {minX, minY, maxX, maxY, w: maxX-minX, h: maxY-minY};
            }

            pathEls.forEach((pe, peIdx) => {
                const segs = allPathSegs[peIdx];
                if (segs.length === 0) return;
                // 工具中心線を外側へミル半径分オフセットする。
                const offsetSegs = applyToolRadiusOffset(segs, millDiam / 2, partBBox);
                const offsetTabs = snapTabsToOffsetOutline(tabSegments, offsetSegs);
                machiningContours.push({segs, offsetSegs, offsetTabs});
                const tabbedSegs = insertTabsIntoSegments(offsetSegs, offsetTabs, pass2Z, TAB_HEIGHT_Z, svgH);
                segmentsToGcodeLines(tabbedSegs, svgH, feedRate, plungeRate, clearH, pass1Z, pass2Z, addLine, gcLines, gcodeStats);
            });

            // Gコードと同じ配置済み輪郭から、部品・残材・タブの独立メッシュを作る。
            const designLoopsByContour=machiningContours.map(c=>machiningSegmentsToLoops(c.segs));
            const designLoops=designLoopsByContour.flat();
            const classifiedDesignLoops=machiningClassifyLoops(designLoops);
            const outer = machiningLargestLoop(designLoops);
            if (outer) {
                const partNo = sortedPartIndex + 1;
                const partId = partEl.id || `part-${partNo}`;
                const partGeometry = createMachiningExtrusionFromLoops(designLoops, matThick);
                applyMachiningBoardUVs(partGeometry,bLength,bWidth,matThick);
                if (partGeometry) machinedParts.push({
                    geometry:partGeometry,
                    name:`Part_${String(partNo).padStart(3,'0')}`,
                    color:machiningColorForPart(partEl, sortedPartIndex),
                    extras:{role:'part',boardIndex:boardIdx,partIndex:sortedPartIndex,partId,units:'millimeters'}
                });

                // Stockから除去するのは各部品の最外周だけ。内側の穴・スロットまで
                // Stock輪郭へ渡すと、包含の偶奇判定で「廃材島」が全厚ソリッドとして
                // 復活し、ドリル切削部を塞いでしまう。内側加工は空間のまま残す。
                // 工具中心は部品外周から半径ぶん外側、残材境界はそこからさらに
                // 半径ぶん外側なので、設計外周を工具直径ぶん拡張すると実際の溝幅になる。
                // ClipperOffsetで凹角の自己交差を解消し、設計輪郭へのゼロ幅fallbackを避ける。
                const outerDesignLoops=classifiedDesignLoops.filter(info=>info.level===0).map(info=>info.loop);
                const stockSideLoops=offsetMachiningOuterLoops(outerDesignLoops,millDiam);
                if(!stockSideLoops.length)throw new Error(`残材境界を生成できませんでした: ${partId}`);
                stockHoles.push(...stockSideLoops);
                const allExportTabs=machiningContours.flatMap(contour=>contour.offsetTabs || []);
                allExportTabs.forEach((tab, tabIndex) => {
                    const tabGeometry=createMachiningTabGeometry(tab,millDiam,TAB_H,matThick);
                    if (!tabGeometry) return;
                    applyMachiningBoardUVs(tabGeometry,bLength,bWidth,matThick);
                    const tabName=`${String(partNo).padStart(3,'0')}_${String(tabIndex+1).padStart(2,'0')}`;
                    machinedTabs.push({
                        geometry:tabGeometry,
                        name:`Tab_${tabName}`,
                        color:'#ff2d95',
                        extras:{role:'tab',boardIndex:boardIdx,connectedPartId:partId,tabIndex,length:tab.hw*2,remainingHeight:Math.min(TAB_H,matThick),toolDiameter:millDiam,units:'millimeters'}
                    });
                });
            }
        });

        for (let i = gcLines.length - 2; i >= 0; i--) {
            const cur = gcLines[i] || '', next = gcLines[i+1] || '';
            const isG00Z = s => /^\x01?G00Z[\d.]+$/.test(s.trim());
            const getZ   = s => { const m = s.replace(/^\x01/,'').match(/^G00Z([\d.]+)$/); return m ? m[1] : null; };
            if (isG00Z(cur) && isG00Z(next) && getZ(cur) === getZ(next)) gcLines.splice(i, 1);
        }

        gcLines.push(addLine(`G00Z${f3(clearH)}`));
        gcLines.push(addLine(`G00X0.000Y0.000`));
        // 加工終了後はCVモードへ戻す
        gcLines.push(addLine(`G64`));
        gcLines.push(addLine(`M09`));
        gcLines.push(addLine(`M30`));
        gcLines.push(`%`);

        const gcLines_final = renumberGcLines(gcLines);
        const gcodeText = gcLines_final.join('\r\n');

        generatedGcodes.push({
            label: `板${boardIdx + 1}`,
            gcode: gcodeText,
            matThick: matThick,
            boardLength: bLength,
            boardWidth: bWidth,
            partCount: sortedParts.length,
            lineCount: gcLines_final.length,
            tabStats: { ...gcodeStats }
        });

        const stockOuter=[{x:0,y:0},{x:bLength,y:0},{x:bLength,y:bWidth},{x:0,y:bWidth}];
        const stockGeometry=createMachiningExtrusionFromLoops([stockOuter].concat(unionMachiningLoops(stockHoles)),matThick);
        applyMachiningBoardUVs(stockGeometry,bLength,bWidth,matThick);
        machinedBoards.push({
            boardIndex:boardIdx,
            name:`Board_${String(boardIdx+1).padStart(2,'0')}`,
            xOffset:boardXOffset,
            stock:stockGeometry ? [{geometry:stockGeometry,name:`Stock_${String(boardIdx+1).padStart(2,'0')}`,color:'#b98b5b',extras:{role:'stock',boardIndex:boardIdx,length:bLength,width:bWidth,thickness:matThick,units:'millimeters'}}] : [],
            parts:machinedParts,
            tabs:machinedTabs
        });

        // ダウンロード
        const blob = new Blob([gcodeText], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const suffix = boardIndices.length > 1 ? `_板${boardIdx + 1}` : '';
        const fileName = `${stlBase}${suffix}_mach23.txt`;
        const link = document.createElement('a');
        link.href = url; link.download = fileName;
        document.body.appendChild(link); link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // Gコードビュワー用にグローバルに保持（板ごとの配列）
    window.__lastGeneratedGcodes = generatedGcodes;
    window.__lastCncModel = {version:1,sourceFile:currentStlFileName || '',toolDiameter:millDiam,materialThickness:matThick,layoutSignature:getMachiningLayoutSignature(),boards:machinedBoards};
    window.__lastGcodeMatThick = matThick;
    // 後方互換
    window.__lastGeneratedGcode = generatedGcodes.length > 0 ? generatedGcodes[0].gcode : '';

    const summaryLines = generatedGcodes.map(g => {
        const tabMsg = g.tabStats.tabMarkers > 0
            ? `タブ: ${g.tabStats.tabMarkers}個 / 最終パスタブ: ${g.tabStats.finalTabUpEvents}${g.tabStats.finalTabUpEvents > 0 ? '(OK)' : '(警告)'}`
            : 'タブ: 0';
        return `  ${g.label}: 部品${g.partCount} / ${g.lineCount}行 / ${tabMsg}`;
    }).join('\n');
    alert(`Gコードを生成しました。\n工具: ${preset.label}\nファイル数: ${generatedGcodes.length}\n${summaryLines}`);
}

function colorHexToFactor(hex) {
    const m=String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    const n=m ? parseInt(m[1],16) : 0xcccccc;
    return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,1];
}

function buildMachinedGlb(model) {
    const accessors=[],bufferViews=[],meshDefs=[],materialDefs=[],nodes=[],binParts=[];
    let byteOffset=0;
    const appendBuffer=(typed,target) => {
        const bytes=new Uint8Array(typed.buffer,typed.byteOffset,typed.byteLength);
        const viewIndex=bufferViews.length;
        bufferViews.push({buffer:0,byteOffset,byteLength:bytes.byteLength,target});
        binParts.push(new Uint8Array(bytes));
        byteOffset+=bytes.byteLength;
        const pad=(4-byteOffset%4)%4;
        if(pad){binParts.push(new Uint8Array(pad));byteOffset+=pad;}
        return viewIndex;
    };
    const addAccessor=(typed,type,count,target,min,max) => {
        const bufferView=appendBuffer(typed,target);
        const componentType=typed instanceof Float32Array?5126:(typed instanceof Uint32Array?5125:5123);
        const a={bufferView,componentType,count,type};
        if(min)a.min=min;if(max)a.max=max;
        accessors.push(a);return accessors.length-1;
    };
    const addMeshNode=entry => {
        const geo=entry.geometry;
        const pos=geo?.getAttribute?.('position');
        if(!pos || !pos.count)return -1;
        const posArr=new Float32Array(pos.count*3),pMin=[Infinity,Infinity,Infinity],pMax=[-Infinity,-Infinity,-Infinity];
        for(let i=0;i<pos.count;i++){
            const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
            posArr.set([x,y,z],i*3);
            pMin[0]=Math.min(pMin[0],x);pMin[1]=Math.min(pMin[1],y);pMin[2]=Math.min(pMin[2],z);
            pMax[0]=Math.max(pMax[0],x);pMax[1]=Math.max(pMax[1],y);pMax[2]=Math.max(pMax[2],z);
        }
        const attributes={POSITION:addAccessor(posArr,'VEC3',pos.count,34962,pMin,pMax)};
        const norm=geo.getAttribute('normal');
        if(norm){
            const arr=new Float32Array(norm.count*3);
            for(let i=0;i<norm.count;i++)arr.set([norm.getX(i),norm.getY(i),norm.getZ(i)],i*3);
            attributes.NORMAL=addAccessor(arr,'VEC3',norm.count,34962);
        }
        const uv=geo.getAttribute('uv');
        if(uv){
            const arr=new Float32Array(uv.count*2);
            for(let i=0;i<uv.count;i++)arr.set([uv.getX(i),uv.getY(i)],i*2);
            attributes.TEXCOORD_0=addAccessor(arr,'VEC2',uv.count,34962);
        }
        const prim={attributes};
        if(geo.index){
            const use32=pos.count>65535||geo.index.count>65535;
            const arr=use32?new Uint32Array(geo.index.count):new Uint16Array(geo.index.count);
            for(let i=0;i<geo.index.count;i++)arr[i]=geo.index.getX(i);
            prim.indices=addAccessor(arr,'SCALAR',arr.length,34963);
        }
        prim.material=materialDefs.length;
        const baseColor=colorHexToFactor(entry.color);
        const materialDef={name:`${entry.name}_Material`,pbrMetallicRoughness:{baseColorFactor:baseColor,metallicFactor:0,roughnessFactor:.82},doubleSided:true};
        if(entry.extras?.role==='tab')materialDef.emissiveFactor=baseColor.slice(0,3).map(v=>Math.min(1,v*.35));
        materialDefs.push(materialDef);
        const meshIndex=meshDefs.length;
        meshDefs.push({name:entry.name,primitives:[prim]});
        nodes.push({name:entry.name,mesh:meshIndex,extras:entry.extras || {}});
        return nodes.length-1;
    };

    const boardNodeIndices=[];
    (model.boards || []).forEach(board => {
        const roleGroups=[];
        [['Stock',board.stock],['Parts',board.parts],['Tabs',board.tabs]].forEach(([name,entries]) => {
            const children=(entries || []).map(addMeshNode).filter(i=>i>=0);
            const group={name,extras:{role:name.toLowerCase(),boardIndex:board.boardIndex}};
            if(children.length)group.children=children;
            nodes.push(group);roleGroups.push(nodes.length-1);
        });
        nodes.push({name:board.name,children:roleGroups,translation:[board.xOffset || 0,0,0],extras:{role:'board',boardIndex:board.boardIndex,units:'millimeters'}});
        boardNodeIndices.push(nodes.length-1);
    });
    nodes.push({name:'CNC_Result',children:boardNodeIndices,scale:[.001,.001,.001],extras:{units:'millimeters',sourceFile:model.sourceFile || '',toolDiameter:model.toolDiameter,materialThickness:model.materialThickness,uvMapping:'board-planar',grainAxis:'board-x'}});
    const rootIndex=nodes.length-1;
    const gltf={asset:{version:'2.0',generator:'Kidorin for CNC'},scene:0,scenes:[{name:'CNC_Result',nodes:[rootIndex]}],nodes,meshes:meshDefs,materials:materialDefs,accessors,bufferViews,buffers:[{byteLength:byteOffset}]};
    let jsonBytes=new TextEncoder().encode(JSON.stringify(gltf));
    const jsonPad=(4-jsonBytes.byteLength%4)%4;
    if(jsonPad){const padded=new Uint8Array(jsonBytes.byteLength+jsonPad);padded.set(jsonBytes);padded.fill(0x20,jsonBytes.byteLength);jsonBytes=padded;}
    const total=12+8+jsonBytes.byteLength+8+byteOffset;
    const glb=new ArrayBuffer(total),dv=new DataView(glb);let o=0;
    dv.setUint32(o,0x46546c67,true);o+=4;dv.setUint32(o,2,true);o+=4;dv.setUint32(o,total,true);o+=4;
    dv.setUint32(o,jsonBytes.byteLength,true);o+=4;dv.setUint32(o,0x4e4f534a,true);o+=4;new Uint8Array(glb,o,jsonBytes.byteLength).set(jsonBytes);o+=jsonBytes.byteLength;
    dv.setUint32(o,byteOffset,true);o+=4;dv.setUint32(o,0x004e4942,true);o+=4;
    for(const part of binParts){new Uint8Array(glb,o,part.byteLength).set(part);o+=part.byteLength;}
    return glb;
}

window.kidorinExportMachinedGLB=async function(){
    const model=window.__lastCncModel;
    if(!model || !model.boards || model.boards.length===0){
        alert('先に「CNC Gコードを生成」を実行してください。そこで指定した材料厚・工具径・タブ設定を加工後モデルに使用します。');
        return {ok:false};
    }
    if(model.layoutSignature!==getMachiningLayoutSignature()){
        alert('配置・板寸法・工具径またはタブ設定がGコード生成後に変更されています。Gコードを再生成してから加工後GLBを出力してください。');
        return {ok:false};
    }
    const physicalTabCount=model.boards.reduce((sum,board)=>sum+(board.tabs?.length || 0),0);
    if(physicalTabCount===0 && !confirm('この加工後モデルにはタブが1個もありません。\n「タブ自動配置」または「タブ設定」を行い、Gコードを再生成すると物理タブが出力されます。\nタブなしで出力を続けますか？'))return {ok:false};
    try{
        const blob=new Blob([buildMachinedGlb(model)],{type:'model/gltf-binary'});
        const a=document.createElement('a');
        if(window.__machinedGlbDownload?.objectUrl)URL.revokeObjectURL(window.__machinedGlbDownload.objectUrl);
        const objectUrl=URL.createObjectURL(blob);
        const downloadId=`machined-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        a.href=objectUrl;
        const base=(currentStlFileName || 'kidorin').replace(/\.stl$/i,'').replace(/[^\w\u3000-\u9fff-]+/g,'_');
        a.download=`${base}_加工後.glb`;
        a.style.display='none';document.body.appendChild(a);a.click();a.remove();
        window.__machinedGlbDownload={downloadId,objectUrl,fileName:a.download};
        // 自動保存がブロックされた場合の再クリック用に、URLを1分間保持する。
        setTimeout(()=>{
            if(window.__machinedGlbDownload?.downloadId===downloadId){
                URL.revokeObjectURL(objectUrl);window.__machinedGlbDownload=null;
            }
        },60000);
        return {ok:true,downloadId,fileName:a.download,sizeMB:(blob.size/1024/1024).toFixed(1)};
    }catch(e){
        window.__lastMachinedExportError=String(e?.stack || e);
        console.error(e);alert(`加工後GLBの生成に失敗しました: ${e.message || e}`);
        return {ok:false,error:String(e?.message || e)};
    }
};

window.kidorinRetryMachinedGLBDownload=function(downloadId){
    const pending=window.__machinedGlbDownload;
    if(!pending || pending.downloadId!==downloadId){
        alert('保存データの有効期限が切れました。もう一度「加工後GLB」を押して生成してください。');
        return false;
    }
    const a=document.createElement('a');a.href=pending.objectUrl;a.download=pending.fileName;
    a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    return true;
};

// ================================================================
// タブ設定機能
// ================================================================
let tabModeActive = false;
let tabMarkerId   = 0;
const TAB_SIZE    = 10;

function toggleTabMode() {
    tabModeActive = !tabModeActive;
    const btn       = document.getElementById('tab-button');
    const container = document.getElementById('svg-container');
    if (tabModeActive) {
        btn.textContent = 'タブ設定中 (完了)';
        btn.classList.add('tab-mode-active');
        container.classList.add('tab-mode-cursor');
        disablePartDrag();
        container.addEventListener('mousedown', onTabMouseDown, true);
    } else {
        btn.textContent = 'タブ設定';
        btn.classList.remove('tab-mode-active');
        container.classList.remove('tab-mode-cursor');
        container.removeEventListener('mousedown', onTabMouseDown, true);
        enablePartDrag();
    }
}

function onTabMouseDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const marker = e.target.closest && e.target.closest('.tab-marker');
    if (marker) { marker.parentNode && marker.parentNode.removeChild(marker); return; }
    const outer = e.target.closest && e.target.closest('g[data-x]');
    if (!outer) return;
    placeTabAtClick(outer, e.clientX, e.clientY);
}

function placeTabAtClick(outer, screenX, screenY) {
    const rotGroup = outer.querySelector('.rot-group');
    if (!rotGroup) return;
    const svg = outer.ownerSVGElement;
    if (!svg) return;
    // flipGroup内の座標変換を正しく行うため、flipGroupのCTMを使用
    const flipG = svg.querySelector('#content-flip');
    const screenCTM = (flipG || svg).getScreenCTM();
    if (!screenCTM) return;
    const pt = svg.createSVGPoint();
    pt.x = screenX; pt.y = screenY;
    const svgPt = pt.matrixTransform(screenCTM.inverse());
    const outerX = parseFloat(outer.dataset.x) || 0;
    const outerY = parseFloat(outer.dataset.y) || 0;
    const localX = svgPt.x - outerX;
    const localY = svgPt.y - outerY;
    const angleDeg = parseFloat(outer.dataset.angle) || 0;
    const angleRad = angleDeg * Math.PI / 180;
    const cx = parseFloat(outer.dataset.centerX) || 0;
    const cy = parseFloat(outer.dataset.centerY) || 0;
    const dx = localX - cx, dy = localY - cy;
    const cosA = Math.cos(-angleRad), sinA = Math.sin(-angleRad);
    const tx = cosA * dx - sinA * dy + cx;
    const ty = sinA * dx + cosA * dy + cy;
    // 輪郭線スナップ
    const snap = findNearestPointOnOutline(rotGroup, tx, ty, 8);
    if (!snap) return;
    drawTabMarker(rotGroup, snap.x, snap.y);
}

function findNearestPointOnOutline(rotGroup, lx, ly, snapDist) {
    const paths = rotGroup.querySelectorAll('.part-outline path');
    let bestDist = snapDist, bestPt = null;
    paths.forEach(pathEl => {
        const totalLen = pathEl.getTotalLength ? pathEl.getTotalLength() : 0;
        if (totalLen <= 0) return;
        const steps = Math.min(2000, Math.ceil(totalLen / 0.5));
        for (let i = 0; i <= steps; i++) {
            const p = pathEl.getPointAtLength((i / steps) * totalLen);
            const d = Math.hypot(p.x - lx, p.y - ly);
            if (d < bestDist) { bestDist = d; bestPt = { x: p.x, y: p.y }; }
        }
    });
    return bestPt;
}

function drawTabMarker(rotGroup, tx, ty) {
    const ns = 'http://www.w3.org/2000/svg';
    const id = ++tabMarkerId;
    const half = TAB_SIZE / 2;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'tab-marker');
    g.setAttribute('data-tab-id', String(id));
    g.setAttribute('data-tx', String(tx));
    g.setAttribute('data-ty', String(ty));
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(tx-half)); rect.setAttribute('y', String(ty-half));
    rect.setAttribute('width', String(TAB_SIZE)); rect.setAttribute('height', String(TAB_SIZE));
    rect.setAttribute('fill', 'rgba(220,30,30,0.65)'); rect.setAttribute('stroke', '#c0392b');
    rect.setAttribute('stroke-width', '0.8'); rect.setAttribute('vector-effect', 'non-scaling-stroke');
    rect.setAttribute('rx', '1');
    const crossH = document.createElementNS(ns, 'line');
    crossH.setAttribute('x1', String(tx-half+2)); crossH.setAttribute('y1', String(ty));
    crossH.setAttribute('x2', String(tx+half-2)); crossH.setAttribute('y2', String(ty));
    crossH.setAttribute('stroke', '#fff'); crossH.setAttribute('stroke-width', '1.2');
    crossH.setAttribute('vector-effect', 'non-scaling-stroke'); crossH.setAttribute('pointer-events', 'none');
    const crossV = document.createElementNS(ns, 'line');
    crossV.setAttribute('x1', String(tx)); crossV.setAttribute('y1', String(ty-half+2));
    crossV.setAttribute('x2', String(tx)); crossV.setAttribute('y2', String(ty+half-2));
    crossV.setAttribute('stroke', '#fff'); crossV.setAttribute('stroke-width', '1.2');
    crossV.setAttribute('vector-effect', 'non-scaling-stroke'); crossV.setAttribute('pointer-events', 'none');
    g.appendChild(rect); g.appendChild(crossH); g.appendChild(crossV);
    g.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        g.parentNode && g.parentNode.removeChild(g);
    }, true);
    rotGroup.appendChild(g);
}

function clearAllTabMarkers() {
    const svg = document.querySelector('#svg-container svg');
    if (!svg) return;
    svg.querySelectorAll('.tab-marker').forEach(m => m.parentNode && m.parentNode.removeChild(m));
}

// ================================================================
// タブ自動配置機能
// ================================================================
// 要件定義: 「きどりん for CNC」タブ自動配置機能 要件定義（提案）に準拠。
// 外周輪郭・内側輪郭（ジョイントスロット等の穴）の両方を対象とし、
// 既存の手動タブ機能（tab-marker DOM構造）にそのまま統合される。

const AUTO_TAB_SLOT_SHORT_EDGE_LIMIT = 20; // 短辺20mm未満は穴・スロット確定（Gコード生成側と同じ基準）
const AUTO_TAB_EDGE_MARGIN = 5;             // 部品BBoxの端から5mm以内なら「端に接する」
const AUTO_TAB_ANGLE_TOL = Math.cos(0.5 * Math.PI / 180); // 0.5度以内は同一直線とみなす

/** 2点間距離 */
function _autoTabDist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/**
 * ポリゴン内包判定（レイキャスト法）。isHoleFlags 判定と同じロジック。
 */
function _autoTabPointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-10) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * SVGパスのサブパス（M〜Z区切り）を分解する。
 * getTransformedSegments と違い、変換（オフセット/回転）は適用しない
 * ＝ .part-outline path の生座標系（手動タブ配置と同じ座標系）のまま扱う。
 */
function _autoTabSplitSubpaths(segs) {
    const subpaths = [];
    let cur = null;
    for (const seg of segs) {
        if (seg.cmd === 'M') { cur = [seg]; subpaths.push(cur); }
        else if (cur) cur.push(seg);
    }
    return subpaths;
}

/**
 * サブパスから単純頂点列（BBox・内包判定用）を作る。
 * 曲線は始点終点のみを使う（安全側・簡易近似で十分）。
 */
function _autoTabSubpathVerts(sp) {
    const verts = [];
    for (const s of sp) {
        if (s.cmd === 'M' || s.cmd === 'L' || s.cmd === 'C' || s.cmd === 'A') {
            verts.push({ x: s.x, y: s.y });
        }
    }
    return verts;
}

function _autoTabBBox(verts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of verts) {
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function _autoTabCentroid(verts) {
    let cx = 0, cy = 0;
    for (const v of verts) { cx += v.x; cy += v.y; }
    return { x: cx / verts.length, y: cy / verts.length };
}

/**
 * 部品内の全サブパスについて「外周」か「内側輪郭（穴）」かを判定する。
 * Gコード生成側の isHoleFlags と同じ考え方（手がかり0〜3）を、
 * 生の .part-outline 座標系に対して適用する。
 * @returns {boolean[]} サブパスごとの isHole フラグ
 */
function _autoTabClassifySubpaths(subpaths, partBBox) {
    const vertsAll = subpaths.map(sp => _autoTabSubpathVerts(sp));
    const bboxAll = vertsAll.map(vs => vs.length ? _autoTabBBox(vs) : null);

    return subpaths.map((sp, i) => {
        const vs = vertsAll[i], bb = bboxAll[i];
        if (!vs || vs.length < 3 || !bb) return false;

        // 手がかり1（最優先・穴確定）: 短辺が板厚程度（20mm未満）
        if (Math.min(bb.w, bb.h) < AUTO_TAB_SLOT_SHORT_EDGE_LIMIT) return true;

        // 手がかり2（外周確定）: 部品BBoxの全端に接する
        if (partBBox) {
            const touchAll =
                Math.abs(bb.minX - partBBox.minX) < AUTO_TAB_EDGE_MARGIN &&
                Math.abs(bb.maxX - partBBox.maxX) < AUTO_TAB_EDGE_MARGIN &&
                Math.abs(bb.minY - partBBox.minY) < AUTO_TAB_EDGE_MARGIN &&
                Math.abs(bb.maxY - partBBox.maxY) < AUTO_TAB_EDGE_MARGIN;
            if (touchAll) return false;
        }

        // 手がかり3: 他のサブパスの内側にある
        const c = _autoTabCentroid(vs);
        for (let j = 0; j < subpaths.length; j++) {
            if (i === j) continue;
            const vs2 = vertsAll[j];
            if (!vs2 || vs2.length < 3) continue;
            const bb2 = bboxAll[j];
            if (bb2.w * bb2.h < bb.w * bb.h) continue;
            if (_autoTabPointInPoly(c.x, c.y, vs2)) return true;
        }

        // 手がかり4: 部品BBox端に接していない
        if (partBBox) {
            const touchAny =
                Math.abs(bb.minX - partBBox.minX) < AUTO_TAB_EDGE_MARGIN ||
                Math.abs(bb.maxX - partBBox.maxX) < AUTO_TAB_EDGE_MARGIN ||
                Math.abs(bb.minY - partBBox.minY) < AUTO_TAB_EDGE_MARGIN ||
                Math.abs(bb.maxY - partBBox.maxY) < AUTO_TAB_EDGE_MARGIN;
            if (!touchAny) return true;
        }

        return false;
    });
}

/**
 * サブパスを「直線エッジ」の列に分解する。
 * 曲線（C/A）は isCurve:true の区切りエッジとして扱い、
 * 直線グループの連結を断ち切る（曲線区間は自動配置の対象外）。
 */
function _autoTabBuildEdges(sp) {
    const edges = [];
    let px = 0, py = 0, sx = 0, sy = 0;
    for (const s of sp) {
        if (s.cmd === 'M') {
            px = sx = s.x; py = sy = s.y;
        } else if (s.cmd === 'L') {
            const len = _autoTabDist(px, py, s.x, s.y);
            if (len > 0.01) {
                edges.push({ x1: px, y1: py, x2: s.x, y2: s.y, len, ux: (s.x - px) / len, uy: (s.y - py) / len, isCurve: false });
            }
            px = s.x; py = s.y;
        } else if (s.cmd === 'C' || s.cmd === 'A') {
            const len = _autoTabDist(px, py, s.x, s.y);
            edges.push({ x1: px, y1: py, x2: s.x, y2: s.y, len, ux: 0, uy: 0, isCurve: true });
            px = s.x; py = s.y;
        } else if (s.cmd === 'Z') {
            const len = _autoTabDist(px, py, sx, sy);
            if (len > 0.01) {
                edges.push({ x1: px, y1: py, x2: sx, y2: sy, len, ux: (sx - px) / len, uy: (sy - py) / len, isCurve: false });
            }
            px = sx; py = sy;
        }
    }
    return edges;
}

/**
 * 直線エッジを「同一方向に連続する直線区間（辺）」へグループ化する。
 * snapTabsToOffsetOutline のグループ化ロジックと同じ考え方。
 * 曲線エッジは group を断ち切る（対象にしない）。
 */
function _autoTabGroupEdges(edges) {
    const groups = [];
    let current = null;
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.isCurve) { current = null; continue; }
        if (current === null) {
            current = { edgeIdxs: [i], totalLen: e.len };
            groups.push(current);
        } else {
            const first = edges[current.edgeIdxs[0]];
            const dot = first.ux * e.ux + first.uy * e.uy;
            if (dot >= AUTO_TAB_ANGLE_TOL) {
                current.edgeIdxs.push(i);
                current.totalLen += e.len;
            } else {
                current = { edgeIdxs: [i], totalLen: e.len };
                groups.push(current);
            }
        }
    }
    // 閉路の継ぎ目（最後のグループ→最初のグループ）が同方向なら統合する
    if (groups.length >= 2) {
        const first = groups[0], last = groups[groups.length - 1];
        const ef = edges[first.edgeIdxs[0]];
        const el = edges[last.edgeIdxs[last.edgeIdxs.length - 1]];
        if (!ef.isCurve && !el.isCurve) {
            const dot = ef.ux * el.ux + ef.uy * el.uy;
            if (dot >= AUTO_TAB_ANGLE_TOL) {
                last.edgeIdxs = last.edgeIdxs.concat(first.edgeIdxs);
                last.totalLen += first.totalLen;
                groups.shift();
            }
        }
    }
    // 弧長→座標変換用に group.startArcByEdge を用意
    groups.forEach(g => {
        g.startArcByEdge = new Map();
        let acc = 0;
        g.edgeIdxs.forEach(ei => {
            g.startArcByEdge.set(ei, acc);
            acc += edges[ei].len;
        });
    });
    return groups;
}

function _autoTabPointAtGroupArc(edges, group, arc) {
    const a = Math.max(0, Math.min(group.totalLen, arc));
    for (const ei of group.edgeIdxs) {
        const e = edges[ei];
        const startArc = group.startArcByEdge.get(ei) || 0;
        if (a <= startArc + e.len + 1e-9) {
            const t = e.len > 0 ? Math.max(0, Math.min(1, (a - startArc) / e.len)) : 0;
            return { x: e.x1 + (e.x2 - e.x1) * t, y: e.y1 + (e.y2 - e.y1) * t };
        }
    }
    const e = edges[group.edgeIdxs[group.edgeIdxs.length - 1]];
    return { x: e.x2, y: e.y2 };
}

/* ================================================================
 * タブ自動配置アルゴリズム v2（バランス配置）
 * ----------------------------------------------------------------
 * 【v1の問題】
 *   ・ジョイントの凹凸で分断された直線を1本ずつ「辺」とみなしていたため、
 *     指1本ごとにタブが付き、結果として片側に偏る／数が過剰になる。
 *   ・スロット（はめ込み穴）の対向2壁とも中央に置くため、タブが真正面で
 *     向かい合い、切り抜き片が最後まで残って弾け飛ぶ。
 *
 * 【v2の方針】
 *   ・「同一直線上にある区間」をまとめて1つの壁(wall)とし、さらに部品BBox
 *     の4辺へ割り当てて、1辺＝1つの論理的な辺として扱う。
 *   ・辺長 L に対し、基準位置は L の 25% / 75%（端から1/4内側）。
 *   ・L >= 300mm では 25%〜75% の内側へ等間隔で追加タブを入れる。
 *   ・理想位置が凹凸の隙間に落ちた場合は、実際に材料のある区間へスナップ。
 *   ・スロットは対向2壁のタブを辺方向に slotTabOffset だけずらして配置。
 * ================================================================ */

const AUTO_TAB_LINE_TOL = 0.6;   // 同一直線とみなす垂直距離(mm)
const AUTO_TAB_AXIS_TOL = 0.02;  // 軸平行判定（方向余弦の許容値）
const AUTO_TAB_LONG_SIDE = 300;  // この長さ以上の辺は内側に追加タブを入れる(mm)

/** サブパスから直線セグメントのみを取り出す（曲線は対象外） */
function _autoTabCollectStraightSegs(sp) {
    return _autoTabBuildEdges(sp).filter(e => !e.isCurve && e.len > 0.05);
}

/** 1次元区間列をマージする（[{a,b},...] → 重なり／隣接を結合） */
function _autoTabMergeIntervals(list, tol) {
    if (!list.length) return [];
    const s = list.slice().sort((p, q) => p.a - q.a);
    const out = [{ a: s[0].a, b: s[0].b }];
    for (let i = 1; i < s.length; i++) {
        const last = out[out.length - 1];
        if (s[i].a <= last.b + tol) last.b = Math.max(last.b, s[i].b);
        else out.push({ a: s[i].a, b: s[i].b });
    }
    return out;
}

/**
 * 直線セグメントを「同一直線上にある壁(wall)」へまとめる。
 * ジョイントの凹凸で分断されていても、同じ直線上なら1つの壁になる。
 * 壁は (方向ベクトル u, 法線 n, 原点からの符号付き距離 offset) で表し、
 * 各区間は u 方向のスカラー t で保持する（t = P・u）。
 */
function _autoTabGroupCollinearWalls(segs, lineTol) {
    const walls = [];
    segs.forEach(s => {
        // 方向を正規化（±180°を同一視 → 逆向きの同一直線も同じ壁になる）
        let ux = s.ux, uy = s.uy;
        if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
        const nx = -uy, ny = ux;
        const off = s.x1 * nx + s.y1 * ny;
        let w = null;
        for (const W of walls) {
            if (Math.abs(W.ux * ux + W.uy * uy) < AUTO_TAB_ANGLE_TOL) continue;
            if (Math.abs(W.offset - off) > lineTol) continue;
            w = W; break;
        }
        if (!w) { w = { ux, uy, nx, ny, offset: off, raw: [], matLen: 0 }; walls.push(w); }
        const t1 = s.x1 * w.ux + s.y1 * w.uy;
        const t2 = s.x2 * w.ux + s.y2 * w.uy;
        w.raw.push({ a: Math.min(t1, t2), b: Math.max(t1, t2) });
        w.matLen += s.len;
    });
    walls.forEach(w => {
        w.intervals = _autoTabMergeIntervals(w.raw, 0.2);
        w.spanMin = w.intervals[0].a;
        w.spanMax = w.intervals[w.intervals.length - 1].b;
        w.span = w.spanMax - w.spanMin;
        w.lineX = w.nx * w.offset;   // 縦壁ならこれが x 座標
        w.lineY = w.ny * w.offset;   // 横壁ならこれが y 座標
    });
    return walls;
}

/**
 * 壁の中で「タブ中心を置ける」区間を返す。
 * タブ全長(tabLen)が直線区間からはみ出さず、かつ端から segMargin 以上内側。
 */
function _autoTabHostable(w, halfNeed, win) {
    const out = [];
    for (const iv of w.intervals) {
        let lo = iv.a + halfNeed, hi = iv.b - halfNeed;
        if (win) { lo = Math.max(lo, win.lo); hi = Math.min(hi, win.hi); }
        if (hi >= lo) out.push({ lo, hi });
    }
    return out;
}

/** 壁上のスカラー位置 t を実座標へ戻す */
function _autoTabPointOnWall(w, t) {
    return { x: w.nx * w.offset + w.ux * t, y: w.ny * w.offset + w.uy * t };
}

/**
 * 理想位置 tIdeal に最も近い「置ける位置」を選ぶ。
 * ・材料のある区間（hostable）内のみ
 * ・すでに置いたタブから minGap 以上離す
 * ・主線（材料長が最大の直線）以外には linePenalty のコストを課す
 */
function _autoTabPickT(lines, tIdeal, linePenalty, usedTs, minGap) {
    let best = null;
    for (const ln of lines) {
        const pen = ln.isPrimary ? 0 : linePenalty;
        for (const h of ln.hostable) {
            const span = h.hi - h.lo;
            const cands = [Math.max(h.lo, Math.min(h.hi, tIdeal))];
            const steps = Math.min(400, Math.max(1, Math.ceil(span)));
            for (let k = 0; k <= steps; k++) cands.push(h.lo + span * (k / steps));
            for (const t of cands) {
                if (usedTs.some(u => Math.abs(u - t) < minGap)) continue;
                const cost = Math.abs(t - tIdeal) + pen;
                if (!best || cost < best.cost) best = { cost, t, line: ln };
            }
        }
    }
    return best;
}

/**
 * 辺長 L に対するタブの理想位置（0〜1の比率）。
 *   ・短い辺           : 中央1個
 *   ・L < 300mm        : 25% と 75%
 *   ・L >= 300mm       : 25% / 75% ＋ その内側に等間隔で追加
 * primary = 必ず置きたい両端側のタブ、secondary = 内側の追加タブ。
 */
function _autoTabIdealFractions(L, spacing, tabLen) {
    const minTwo = Math.max(80, tabLen * 4);
    if (L < minTwo) return { primary: [0.5], secondary: [] };
    const primary = [0.25, 0.75];
    if (L < AUTO_TAB_LONG_SIDE) return { primary, secondary: [] };
    // 25%〜75%（＝L/2）の区間を spacing 以下の間隔で分割する
    const inner = Math.max(1, Math.ceil((0.5 * L) / Math.max(50, spacing)) - 1);
    const secondary = [];
    for (let k = 1; k <= inner; k++) secondary.push(0.25 + 0.5 * k / (inner + 1));
    return { primary, secondary };
}

/**
 * 外周輪郭1本ぶんのタブ配置計画。
 * 部品BBoxの4辺（上下左右）へ壁を割り当て、1辺ごとに 25%/75%(+内側) を配置する。
 * @returns {{primary: Array<{x,y}>, secondary: Array<{x,y}>}}
 */
function _autoTabPlanOuter(sp, partBBox, o) {
    const segs = _autoTabCollectStraightSegs(sp);
    if (!segs.length || !partBBox) return { primary: [], secondary: [] };
    const walls = _autoTabGroupCollinearWalls(segs, AUTO_TAB_LINE_TOL);
    if (!walls.length) return { primary: [], secondary: [] };

    // BBox端からこの距離以内の平行直線は「その辺の一部」とみなす
    const bandH = Math.min(o.sideBand, Math.max(3, 0.30 * (partBBox.h || 0)));
    const bandV = Math.min(o.sideBand, Math.max(3, 0.30 * (partBBox.w || 0)));

    const sides = [
        { orient: 'h', edgeVal: partBBox.minY, tMin: partBBox.minX, tMax: partBBox.maxX, band: bandH, walls: [] },
        { orient: 'h', edgeVal: partBBox.maxY, tMin: partBBox.minX, tMax: partBBox.maxX, band: bandH, walls: [] },
        { orient: 'v', edgeVal: partBBox.minX, tMin: partBBox.minY, tMax: partBBox.maxY, band: bandV, walls: [] },
        { orient: 'v', edgeVal: partBBox.maxX, tMin: partBBox.minY, tMax: partBBox.maxY, band: bandV, walls: [] },
    ];

    const leftovers = [];
    walls.forEach(w => {
        const isH = Math.abs(w.uy) < AUTO_TAB_AXIS_TOL;
        const isV = Math.abs(w.ux) < AUTO_TAB_AXIS_TOL;
        let target = null, bestD = Infinity;
        if (isH || isV) {
            const orient = isH ? 'h' : 'v';
            const coord = isH ? w.lineY : w.lineX;
            sides.forEach(s => {
                if (s.orient !== orient) return;
                const d = Math.abs(coord - s.edgeVal);
                if (d <= s.band && d < bestD) { bestD = d; target = s; }
            });
        }
        if (target) target.walls.push(w); else leftovers.push(w);
    });

    // 4辺に属さない長い直線（L字部品・斜め辺など）は独立した辺として扱う
    leftovers.forEach(w => {
        if (w.span >= o.minSideLen) {
            sides.push({ orient: 'free', tMin: w.spanMin, tMax: w.spanMax, band: 0, walls: [w] });
        }
    });

    const halfNeed = o.tabLen / 2 + o.segMargin;
    const perSide = [];

    sides.forEach(side => {
        if (!side.walls.length) return;
        // 基準長は BBox ではなく「その辺に実際に材料がある範囲」を使う。
        // （隣の辺の突起が BBox を広げていても 25%/75% がずれないようにする）
        side.tMin = Math.min.apply(null, side.walls.map(w => w.spanMin));
        side.tMax = Math.max.apply(null, side.walls.map(w => w.spanMax));
        const L = side.tMax - side.tMin;
        if (L <= 0) return;

        let win = { lo: side.tMin + o.cornerMarginOuter, hi: side.tMax - o.cornerMarginOuter };
        if (win.hi <= win.lo) win = null;

        let lines = side.walls.map(w => ({ w, hostable: _autoTabHostable(w, halfNeed, win), matLen: w.matLen }));
        if (!lines.some(l => l.hostable.length)) {
            // コーナーマージンで全滅した場合はマージンを外して再試行
            lines = side.walls.map(w => ({ w, hostable: _autoTabHostable(w, halfNeed, null), matLen: w.matLen }));
        }
        lines = lines.filter(l => l.hostable.length);
        if (!lines.length) return;

        // 材料長が最大の直線を「主線」とし、そこを優先してタブを置く
        const maxMat = Math.max.apply(null, lines.map(l => l.matLen));
        lines.forEach(l => { l.isPrimary = (l.matLen >= maxMat - 1e-6); });

        const ideal = _autoTabIdealFractions(L, o.spacing, o.tabLen);
        const usedTs = [];
        const primary = [], secondary = [];
        const put = (f, arr) => {
            const tIdeal = side.tMin + L * f;
            const pick = _autoTabPickT(lines, tIdeal, o.linePenalty, usedTs, o.minTabGap);
            if (!pick) return;
            usedTs.push(pick.t);
            arr.push(_autoTabPointOnWall(pick.line.w, pick.t));
        };
        ideal.primary.forEach(f => put(f, primary));
        ideal.secondary.forEach(f => put(f, secondary));
        if (primary.length || secondary.length) perSide.push({ primary, secondary });
    });

    const primary = [];
    perSide.forEach(s => { primary.push.apply(primary, s.primary); });

    // 追加タブは辺をまたいでラウンドロビンで取り出す（上限で間引かれても偏らない）
    const secondary = [];
    for (let idx = 0; ; idx++) {
        let found = false;
        perSide.forEach(s => { if (s.secondary[idx]) { secondary.push(s.secondary[idx]); found = true; } });
        if (!found) break;
    }
    return { primary, secondary };
}

/**
 * 内側輪郭（はめ込みスロット／穴）1つぶんのタブ配置計画。
 * 対向する2壁を選び、辺方向へ slotTabOffset だけずらして配置することで、
 * タブが真正面で向かい合って切り抜き片が弾け飛ぶのを防ぐ。
 * @returns {Array<{x,y}>}
 */
function _autoTabPlanSlot(sp, o) {
    const segs = _autoTabCollectStraightSegs(sp);
    if (!segs.length) return [];
    const walls = _autoTabGroupCollinearWalls(segs, AUTO_TAB_LINE_TOL);
    const halfNeed = o.tabLen / 2 + o.slotSegMargin;
    walls.forEach(w => { w.hostable = _autoTabHostable(w, halfNeed, null); });

    const valid = walls.filter(w => w.hostable.length > 0);
    if (!valid.length) return [];
    valid.sort((a, b) => b.matLen - a.matLen);

    const A = valid[0];
    const rangeOf = w => ({ lo: w.hostable[0].lo, hi: w.hostable[w.hostable.length - 1].hi });
    const snap = (w, t) => {
        let best = null;
        w.hostable.forEach(h => {
            const c = Math.max(h.lo, Math.min(h.hi, t));
            const d = Math.abs(c - t);
            if (!best || d < best.d) best = { d, t: c };
        });
        return best ? best.t : t;
    };

    let B = null;
    if (o.preferOppositeWalls && o.maxTabsPerSlot >= 2) {
        B = valid.slice(1).find(w =>
            Math.abs(w.ux * A.ux + w.uy * A.uy) >= AUTO_TAB_ANGLE_TOL &&
            Math.abs(w.offset - A.offset) > 0.5
        ) || null;
    }

    const ra = rangeOf(A);
    if (!B) return [_autoTabPointOnWall(A, snap(A, (ra.lo + ra.hi) / 2))];

    const rb = rangeOf(B);
    const lo = Math.max(ra.lo, rb.lo), hi = Math.min(ra.hi, rb.hi);
    let tA, tB;
    if (hi > lo) {
        const mid = (lo + hi) / 2;
        const sep = Math.min(o.slotTabOffset, hi - lo);
        tA = mid - sep / 2;
        tB = mid + sep / 2;
    } else {
        tA = (ra.lo + ra.hi) / 2 - o.slotTabOffset / 2;
        tB = (rb.lo + rb.hi) / 2 + o.slotTabOffset / 2;
    }
    tA = snap(A, tA);
    tB = snap(B, tB);

    // ずらしきれず正面で向かい合うなら、片側1個だけにする（弾け防止を優先）
    if (Math.abs(tA - tB) < o.tabLen * 0.9) {
        return [_autoTabPointOnWall(A, snap(A, (ra.lo + ra.hi) / 2))];
    }
    return [_autoTabPointOnWall(A, tA), _autoTabPointOnWall(B, tB)];
}

/**
 * 1部品分のタブ自動配置。
 * @param {Element} partEl  g[data-x][id^="part-"] 要素
 * @param {Object} options  autoPlaceTabs() が組み立てる設定オブジェクト
 * @returns {Object} {outerCount, slotCount, skipped: boolean}
 */
function autoPlaceTabsForPart(partEl, options) {
    const rotGroup = partEl.querySelector('.rot-group');
    if (!rotGroup) return { outerCount: 0, slotCount: 0, skipped: true };

    let pathEls = rotGroup.querySelectorAll('.part-outline path');
    if (pathEls.length === 0) pathEls = rotGroup.querySelectorAll('path');
    if (pathEls.length === 0) return { outerCount: 0, slotCount: 0, skipped: true };

    // 全パス・全サブパスを収集（複数<path>要素にまたがる場合に対応）
    const allSubpaths = [];
    pathEls.forEach(pe => {
        const d = pe.getAttribute('d') || '';
        if (!d.trim()) return;
        const segs = parseSvgPathToSegments(d);
        _autoTabSplitSubpaths(segs).forEach(sp => allSubpaths.push(sp));
    });
    if (allSubpaths.length === 0) return { outerCount: 0, slotCount: 0, skipped: true };

    // 部品全体のBBox（外周/穴判定・辺割り当て用）
    let partBBox = null;
    {
        const allVerts = [];
        allSubpaths.forEach(sp => allVerts.push(..._autoTabSubpathVerts(sp)));
        if (allVerts.length > 0) partBBox = _autoTabBBox(allVerts);
    }

    const isHole = _autoTabClassifySubpaths(allSubpaths, partBBox);

    // 既存タブ（手動 or 既に配置済み）の位置を集めて重複回避に使う
    const placedPositions = [];
    rotGroup.querySelectorAll('.tab-marker').forEach(m => {
        placedPositions.push({
            x: parseFloat(m.getAttribute('data-tx') || '0'),
            y: parseFloat(m.getAttribute('data-ty') || '0')
        });
    });

    function tooCloseToExisting(x, y) {
        return placedPositions.some(p => _autoTabDist(p.x, p.y, x, y) < options.manualAvoidDist);
    }

    function placeIfFree(x, y) {
        if (tooCloseToExisting(x, y)) return false;
        drawTabMarker(rotGroup, x, y);
        placedPositions.push({ x, y });
        return true;
    }

    let outerCount = 0, slotCount = 0;

    // ---- 外周輪郭の処理（辺の25%/75%基準＋長辺は内側に追加）----
    allSubpaths.forEach((sp, spIdx) => {
        if (isHole[spIdx]) return;
        const plan = _autoTabPlanOuter(sp, partBBox, options);
        // 上限は「両端側(primary)を優先し、余った枠に内側(secondary)を入れる」
        const pts = plan.primary.slice(0, options.maxTabsPerPart);
        for (const p of plan.secondary) {
            if (pts.length >= options.maxTabsPerPart) break;
            pts.push(p);
        }
        pts.forEach(pt => { if (placeIfFree(pt.x, pt.y)) outerCount++; });
    });

    // ---- 内側輪郭（ジョイントスロット等）の処理 ----
    if (options.includeSlots) {
        allSubpaths.forEach((sp, spIdx) => {
            if (!isHole[spIdx]) return;
            const pts = _autoTabPlanSlot(sp, options);
            if (!pts.length) return;
            // 同一スロット内の対向壁同士はスロット幅ぶんしか離れていないため、
            // 相互の重複回避チェックは行わず、既存の他タブに対してのみ判定する。
            const accepted = pts.filter(pt => !tooCloseToExisting(pt.x, pt.y));
            accepted.forEach(pt => {
                drawTabMarker(rotGroup, pt.x, pt.y);
                placedPositions.push({ x: pt.x, y: pt.y });
                slotCount++;
            });
        });
    }

    return { outerCount, slotCount, skipped: (outerCount === 0 && slotCount === 0) };
}

/**
 * 全ボード・全部品に対するタブ一括自動配置のエントリポイント。
 * ジョイント生成ボタンと同じ体裁で、実行後に結果をアラート表示する。
 */
function autoPlaceTabs() {
    const svg = document.querySelector('#svg-container svg');
    if (!svg) { alert('SVGが見つかりません。先にSTLを読み込んでください。'); return; }

    const allParts = Array.from(svg.querySelectorAll('g[data-x][id^="part-"]'));
    if (allParts.length === 0) { alert('部品が見つかりません。'); return; }

    const millSel  = document.getElementById('tool-diameter');
    const millDiam = millSel ? (parseFloat(millSel.value) || 6) : 6;
    const tabLen   = millDiam <= 6 ? 16 : 20; // Gコード生成側と同じ TAB_LEN 基準

    const spacing = parseFloat(document.getElementById('tab-spacing-input')?.value) || 150;
    const cornerMarginOuter = parseFloat(document.getElementById('tab-margin-input')?.value) || 15;
    const cornerMarginSlot = Math.min(cornerMarginOuter, 5); // 要件4.4: スロットは既定5mm
    const maxTabsPerPart = parseInt(document.getElementById('tab-max-per-part-input')?.value, 10) || 8;
    const includeSlots = !!document.getElementById('tab-include-slots-checkbox')?.checked;
    const preferOppositeWalls = !!document.getElementById('tab-opposite-walls-checkbox')?.checked;
    const keepExisting = !!document.getElementById('tab-keep-existing-checkbox')?.checked;

    if (!keepExisting) clearAllTabMarkers();

    const options = {
        spacing,
        cornerMarginOuter,
        cornerMarginSlot,
        maxTabsPerPart,
        includeSlots,
        preferOppositeWalls,
        maxTabsPerSlot: 2,
        tabLen,
        manualAvoidDist: 20,

        // --- v2 バランス配置用パラメータ ---
        segMargin:     Math.max(3, tabLen * 0.25), // 直線区間の端からの最小逃げ(mm)
        sideBand:      Math.max(25, tabLen * 1.5), // BBox端からこの距離内の平行直線は同じ辺とみなす
        minSideLen:    Math.max(60, tabLen * 3.5), // 独立した辺として扱う最小長／25%-75%配置の最小長
        minTabGap:     tabLen * 1.5,               // 同一辺内でタブ同士を離す最小距離
        linePenalty:   8,                          // 主線以外へ置くときのコスト(mm相当)
        slotSegMargin: Math.min(cornerMarginSlot, 4), // スロット壁の端からの逃げ(mm)
        slotTabOffset: tabLen * 1.5,               // スロット対向2壁のタブをずらす量(mm)
    };

    let totalOuter = 0, totalSlot = 0, skippedParts = 0;
    allParts.forEach(partEl => {
        const result = autoPlaceTabsForPart(partEl, options);
        totalOuter += result.outerCount;
        totalSlot  += result.slotCount;
        if (result.skipped) skippedParts++;
    });

    const totalTabs = totalOuter + totalSlot;
    let msg = `${allParts.length}部品に対して合計 ${totalTabs} 個のタブを自動配置しました`;
    msg += `（外周${totalOuter}個`;
    if (includeSlots) msg += `／ジョイントスロット${totalSlot}個`;
    msg += `）。`;
    if (skippedParts > 0) {
        msg += `\nうち ${skippedParts} 部品は輪郭が短すぎるためタブなしで配置しました。`;
    }
    alert(msg);
}

// STL再読み込み時のタブリセット
const _origDisplayAsSvg = displayAsSvg;
window.displayAsSvg = function(geos) {
    if (tabModeActive) {
        tabModeActive = false;
        const btn = document.getElementById('tab-button');
        const container = document.getElementById('svg-container');
        if (btn) { btn.textContent = 'タブ設定'; btn.classList.remove('tab-mode-active'); }
        if (container) { container.classList.remove('tab-mode-cursor'); container.removeEventListener('mousedown', onTabMouseDown, true); }
        enablePartDrag();
    }
    return _origDisplayAsSvg(geos);
};

// ================================================================
// ボタンイベントリスナー登録
// ================================================================
const tabButton = document.getElementById('tab-button');
if (tabButton) tabButton.addEventListener('click', (e) => { e.preventDefault(); toggleTabMode(); });

const autoTabButton = document.getElementById('auto-tab-button');
if (autoTabButton) autoTabButton.addEventListener('click', (e) => { e.preventDefault(); autoPlaceTabs(); });

const gcodeButton = document.getElementById('gcode-button');
if (gcodeButton) gcodeButton.addEventListener('click', (e) => { e.preventDefault(); generateAndDownloadGcode(); });

// Gコードビュワー起動
const gcodeViewerButton = document.getElementById('gcode-viewer-button');
if (gcodeViewerButton) gcodeViewerButton.addEventListener('click', (e) => {
    e.preventDefault();
    const gcodes = window.__lastGeneratedGcodes;
    const overlay = document.getElementById('gcode-viewer-overlay');
    if (overlay) {
        overlay.style.display = 'block';
        if (typeof window.gvOpenWithMultiGcode === 'function' && gcodes && gcodes.length > 0) {
            window.gvOpenWithMultiGcode(gcodes);
        } else if (typeof window.gvOpenWithGcode === 'function' && window.__lastGeneratedGcode) {
            window.gvOpenWithGcode(window.__lastGeneratedGcode, window.__lastGcodeMatThick || 13.5);
        } else if (typeof window.gvOpenEmpty === 'function') {
            window.gvOpenEmpty();
        }
    }
});
