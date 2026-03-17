// ══════════════════════════════════════════════════════════
// ── MATERIAL USAGE TRACKING ──
// ── Extracted from index.html — VOLO SST V20.7
// ══════════════════════════════════════════════════════════

function goToUsageTracker(){ setState({step:16}); }

function getUsageLog(){
  try{ return JSON.parse(localStorage.getItem('volo_usage_log')||'{}'); }catch(e){ return {}; }
}
function saveUsageLog(log){
  safeSetLS('volo_usage_log',log);
}
function getActiveUsageSession(){
  try{ return JSON.parse(localStorage.getItem('volo_usage_active')||'null'); }catch(e){ return null; }
}
function saveActiveUsageSession(s){
  if(s) safeSetLS('volo_usage_active',s);
  else try{localStorage.removeItem('volo_usage_active');}catch(e){}
}

function getItemUsage(itemId){
  const log=getUsageLog();
  return log[itemId]&&log[itemId].total_hours?log[itemId].total_hours:0;
}

function startUsageSession(){
  const active=getActiveUsageSession();
  if(active){ showToast('Session déjà en cours','err'); return; }
  const selectedItems=window._usageSelectedItems||[];
  if(!selectedItems.length){ showToast('Sélectionne au moins un item','err'); return; }
  const typeEl=document.querySelector('.usage-type-btn.active');
  const type=typeEl?typeEl.dataset.type:'intervention';
  const user=PERSONNEL.find(p=>p.volo==='V'+state.pin);
  const session={
    id:'USG-'+Date.now(),
    items:selectedItems.map(i=>({id:i.id,name:i.name,icon:i.icon||''})),
    start:new Date().toISOString(),
    type:type,
    user:user?user.name:(_getSensitive('volo_last_user')||'Inconnu'),
    userId:user?user.id:''
  };
  saveActiveUsageSession(session);
  window._usageSelectedItems=[];
  showToast('Session démarrée — '+selectedItems.length+' items','ok');
  // Start live timer
  startUsageTimer();
  render();
}

// Conditions prédéfinies pour état matériel
const USAGE_CONDITIONS=[
  {key:'ok',label:'OK — Bon état',icon:'OK',color:'var(--green,#22C55E)'},
  {key:'sale',label:'Sale — Nettoyage requis',icon:'!',color:'var(--orange)'},
  {key:'use',label:'Usure visible',icon:'!',color:'var(--gold)'},
  {key:'endommage',label:'Endommagé',icon:'!!',color:'var(--red)'},
  {key:'inspecter',label:'À inspecter',icon:'?',color:'var(--blue)'}
];

function getItemConditions(){
  try{ return JSON.parse(localStorage.getItem('volo_item_conditions')||'{}'); }catch(e){ return {}; }
}
function saveItemCondition(itemId, condition, note){
  const c=getItemConditions();
  c[itemId]={condition,note,ts:tsNow()};
  safeSetLS('volo_item_conditions',c);
}

function stopUsageSession(){
  const active=getActiveUsageSession();
  if(!active){ showToast('Aucune session active','err'); return; }
  const start=new Date(active.start);
  const end=new Date();
  const durationMin=Math.round((end-start)/60000);
  const hh=Math.floor(durationMin/60);
  const mm=durationMin%60;
  // Show confirmation modal with editable hours + condition
  window._usageStopData={active,start,end,durationMin};
  const overlay=document.createElement('div');
  overlay.id='usage-stop-modal';
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)';
  overlay.innerHTML=`
  <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto">
    <div style="font-family:Oswald,sans-serif;font-size:16px;letter-spacing:2px;color:var(--gold);text-align:center;margin-bottom:16px">FIN DE SESSION</div>
    <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:4px">${escapeHtml(active.type.toUpperCase())} — ${active.items.length} item${active.items.length>1?'s':''}</div>
    <div style="text-align:center;font-size:11px;color:var(--muted);margin-bottom:16px">${escapeHtml(active.user)}</div>

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">DURÉE (MODIFIABLE)</div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div style="flex:1">
        <label style="font-size:10px;color:var(--muted)">Heures</label>
        <input type="number" id="usage-stop-hh" value="${hh}" min="0" max="99" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center">
      </div>
      <div style="flex:1">
        <label style="font-size:10px;color:var(--muted)">Minutes</label>
        <input type="number" id="usage-stop-mm" value="${mm}" min="0" max="59" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center">
      </div>
    </div>

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">ÉTAT DU MATÉRIEL</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px" id="usage-cond-btns">
      ${USAGE_CONDITIONS.map(c=>'<button onclick="document.querySelectorAll(\'#usage-cond-btns button\').forEach(b=>b.style.border=\'1px solid var(--border)\');this.style.border=\'2px solid '+c.color+'\';window._usageStopCond=\''+c.key+'\'" style="flex:1;min-width:45%;padding:8px 6px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);cursor:pointer;font-size:12px;text-align:center">'+c.icon+' '+c.label+'</button>').join('')}
    </div>

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">NOTE (OPTIONNEL)</div>
    <textarea id="usage-stop-note" placeholder="Ex: Très sale, besoin nettoyage immédiat..." style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;font-family:Inter,sans-serif;resize:vertical;min-height:60px;margin-bottom:16px"></textarea>

    <div style="display:flex;gap:8px">
      <button class="btn btn-outline" onclick="document.getElementById('usage-stop-modal').remove()" style="flex:1">ANNULER</button>
      <button class="btn btn-gold" onclick="confirmStopUsage()" style="flex:1">CONFIRMER</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  window._usageStopCond='ok';
  // Pre-select OK
  const firstBtn=overlay.querySelector('#usage-cond-btns button');
  if(firstBtn) firstBtn.style.border='2px solid var(--green,#22C55E)';
}

function confirmStopUsage(){
  const data=window._usageStopData;
  if(!data) return;
  const hhVal=Math.min(99,Math.max(0,parseInt(document.getElementById('usage-stop-hh').value)||0));
  const mmVal=Math.min(59,Math.max(0,parseInt(document.getElementById('usage-stop-mm').value)||0));
  const finalMin=hhVal*60+mmVal;
  const finalHrs=finalMin/60;
  const cond=window._usageStopCond||'ok';
  const note=(document.getElementById('usage-stop-note').value||'').trim();

  const log=getUsageLog();
  data.active.items.forEach(item=>{
    if(!log[item.id]) log[item.id]={id:item.id,name:item.name,sessions:[],total_hours:0};
    log[item.id].sessions.push({
      start:data.active.start,
      end:data.end.toISOString(),
      duration_min:finalMin,
      type:data.active.type,
      user:data.active.user,
      condition:cond,
      note:note||undefined
    });
    log[item.id].total_hours=+(log[item.id].total_hours+finalHrs).toFixed(2);
    if(log[item.id].sessions.length>100) log[item.id].sessions=log[item.id].sessions.slice(-100);
    // Save condition per item
    if(cond!=='ok'||note) saveItemCondition(item.id,cond,note);
  });
  saveUsageLog(log);
  saveActiveUsageSession(null);
  if(window._usageTimerInterval){ clearInterval(window._usageTimerInterval); window._usageTimerInterval=null; }

  document.getElementById('usage-stop-modal').remove();
  const condObj=USAGE_CONDITIONS.find(c=>c.key===cond);
  showToast('Session — '+(hhVal>0?hhVal+'h ':'')+(mmVal)+'min · '+(condObj?condObj.icon:'')+(note?' · '+note:''),'ok');
  render();
}

// Entrée manuelle d'heures (sans timer)
function showManualUsageEntry(){
  window._manualUsageItems=window._usageSelectedItems||[];
  if(!window._manualUsageItems.length){ showToast('Sélectionne au moins un item','err'); return; }
  const user=PERSONNEL.find(p=>p.volo==='V'+state.pin);
  const overlay=document.createElement('div');
  overlay.id='usage-manual-modal';
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)';
  overlay.innerHTML=`
  <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto">
    <div style="font-family:Oswald,sans-serif;font-size:16px;letter-spacing:2px;color:var(--blue);text-align:center;margin-bottom:16px">ENTRÉE MANUELLE</div>
    <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:12px">${window._manualUsageItems.length} item${window._manualUsageItems.length>1?'s':''} sélectionné${window._manualUsageItems.length>1?'s':''}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-bottom:16px">
      ${window._manualUsageItems.map(i=>'<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(59,130,246,.1);color:var(--blue)">'+(i.icon||'')+' '+i.name+'</span>').join('')}
    </div>

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">TYPE</div>
    <select id="manual-usage-type" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;margin-bottom:12px">
      <option value="intervention">INTERVENTION</option>
      <option value="montage">MONTAGE</option>
      <option value="formation">FORMATION</option>
      <option value="exercice">EXERCICE</option>
    </select>

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">DATE</div>
    <input type="date" id="manual-usage-date" value="${new Date().toISOString().slice(0,10)}" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;margin-bottom:12px">

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">DURÉE</div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div style="flex:1">
        <label style="font-size:10px;color:var(--muted)">Heures</label>
        <input type="number" id="manual-usage-hh" value="0" min="0" max="99" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center">
      </div>
      <div style="flex:1">
        <label style="font-size:10px;color:var(--muted)">Minutes</label>
        <input type="number" id="manual-usage-mm" value="0" min="0" max="59" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center">
      </div>
    </div>

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">ÉTAT DU MATÉRIEL</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px" id="manual-cond-btns">
      ${USAGE_CONDITIONS.map(c=>'<button onclick="document.querySelectorAll(\'#manual-cond-btns button\').forEach(b=>b.style.border=\'1px solid var(--border)\');this.style.border=\'2px solid '+c.color+'\';window._manualUsageCond=\''+c.key+'\'" style="flex:1;min-width:45%;padding:8px 6px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);cursor:pointer;font-size:12px;text-align:center">'+c.icon+' '+c.label+'</button>').join('')}
    </div>

    <div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">NOTE (OPTIONNEL)</div>
    <textarea id="manual-usage-note" placeholder="Ex: Très sale, besoin nettoyage immédiat..." style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;font-family:Inter,sans-serif;resize:vertical;min-height:60px;margin-bottom:16px"></textarea>

    <div style="display:flex;gap:8px">
      <button class="btn btn-outline" onclick="document.getElementById('usage-manual-modal').remove()" style="flex:1">ANNULER</button>
      <button class="btn btn-blue" onclick="confirmManualUsage()" style="flex:1">AJOUTER</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  window._manualUsageCond='ok';
  const firstBtn=overlay.querySelector('#manual-cond-btns button');
  if(firstBtn) firstBtn.style.border='2px solid var(--green,#22C55E)';
}

function confirmManualUsage(){
  const items=window._manualUsageItems||[];
  if(!items.length) return;
  const hhVal=Math.min(99,Math.max(0,parseInt(document.getElementById('manual-usage-hh').value)||0));
  const mmVal=Math.min(59,Math.max(0,parseInt(document.getElementById('manual-usage-mm').value)||0));
  if(hhVal===0&&mmVal===0){ showToast('Entre une durée','err'); return; }
  const finalMin=hhVal*60+mmVal;
  const finalHrs=finalMin/60;
  const type=document.getElementById('manual-usage-type').value;
  const date=document.getElementById('manual-usage-date').value;
  const cond=window._manualUsageCond||'ok';
  const note=(document.getElementById('manual-usage-note').value||'').trim();
  const user=PERSONNEL.find(p=>p.volo==='V'+state.pin);
  const userName=user?user.name:(_getSensitive('volo_last_user')||'Inconnu');

  const startISO=new Date(date+'T08:00:00').toISOString();
  const endDate=new Date(new Date(date+'T08:00:00').getTime()+finalMin*60000);

  const log=getUsageLog();
  items.forEach(item=>{
    if(!log[item.id]) log[item.id]={id:item.id,name:item.name,sessions:[],total_hours:0};
    log[item.id].sessions.push({
      start:startISO,
      end:endDate.toISOString(),
      duration_min:finalMin,
      type:type,
      user:userName,
      condition:cond,
      note:note||undefined,
      manual:true
    });
    log[item.id].total_hours=+(log[item.id].total_hours+finalHrs).toFixed(2);
    if(log[item.id].sessions.length>100) log[item.id].sessions=log[item.id].sessions.slice(-100);
    if(cond!=='ok'||note) saveItemCondition(item.id,cond,note);
  });
  saveUsageLog(log);
  document.getElementById('usage-manual-modal').remove();
  window._usageSelectedItems=[];
  showToast('Ajouté — '+(hhVal>0?hhVal+'h ':'')+(mmVal)+'min pour '+items.length+' items','ok');
  render();
}

// Compter les missions (PICK-ON) par item depuis l'historique
function getItemMissionCount(itemId){
  try{
    const hist=JSON.parse(localStorage.getItem('volo_history')||'[]');
    let count=0;
    hist.forEach(h=>{
      if(h.mode==='PICK-ON'&&h.items){
        const items=typeof h.items==='string'?JSON.parse(h.items):h.items;
        if(Array.isArray(items)&&items.some(i=>(i.id||i)===itemId)) count++;
      }
    });
    return count;
  }catch(e){ return 0; }
}

function startUsageTimer(){
  if(window._usageTimerInterval) clearInterval(window._usageTimerInterval);
  window._usageTimerInterval=setInterval(()=>{
    const els=document.querySelectorAll('.usage-timer-display');
    const active=getActiveUsageSession();
    if(!active||!els.length){ clearInterval(window._usageTimerInterval); window._usageTimerInterval=null; return; }
    const elapsed=Math.floor((Date.now()-new Date(active.start).getTime())/1000);
    const hh=String(Math.floor(elapsed/3600)).padStart(2,'0');
    const mm=String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
    const ss=String(elapsed%60).padStart(2,'0');
    els.forEach(el=>el.textContent=hh+':'+mm+':'+ss);
  },1000);
}

// Init timer on load if session active
(function(){
  const a=getActiveUsageSession();
  if(a) setTimeout(()=>startUsageTimer(),500);
})();

function renderUsageIndicator(){
  const active=getActiveUsageSession();
  if(!active) return '';
  const elapsed=Math.floor((Date.now()-new Date(active.start).getTime())/1000);
  const hh=String(Math.floor(elapsed/3600)).padStart(2,'0');
  const mm=String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
  const ss=String(elapsed%60).padStart(2,'0');
  return '<div onclick="goToUsageTracker()" style="position:fixed;top:68px;right:12px;z-index:9997;display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:20px;background:rgba(192,57,43,.92);color:#fff;cursor:pointer;font-family:JetBrains Mono,monospace;font-size:13px;font-weight:600;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(192,57,43,.3);animation:pulse 2s infinite">'+
    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff4444;animation:pulse 1s infinite"></span>'+
    '<span class="usage-timer-display">'+hh+':'+mm+':'+ss+'</span>'+
    '<span style="font-size:10px;font-family:Oswald,sans-serif;letter-spacing:1px;opacity:.8">EN COURS</span>'+
  '</div>';
}

function toggleUsageItem(itemId){
  if(!window._usageSelectedItems) window._usageSelectedItems=[];
  const idx=window._usageSelectedItems.findIndex(i=>i.id===itemId);
  if(idx>=0){
    window._usageSelectedItems.splice(idx,1);
  } else {
    const item=ITEMS.find(i=>i.id===itemId);
    if(item) window._usageSelectedItems.push({id:item.id,name:item.name,icon:getItemIcon(item,14)});
  }
  render();
}

function selectAllUsageCategory(cat){
  if(!window._usageSelectedItems) window._usageSelectedItems=[];
  const catItems=ITEMS.filter(i=>i.cat===cat);
  const allSelected=catItems.every(ci=>window._usageSelectedItems.some(si=>si.id===ci.id));
  if(allSelected){
    // Deselect all from this category
    catItems.forEach(ci=>{
      const idx=window._usageSelectedItems.findIndex(si=>si.id===ci.id);
      if(idx>=0) window._usageSelectedItems.splice(idx,1);
    });
  } else {
    // Select all from this category
    catItems.forEach(ci=>{
      if(!window._usageSelectedItems.some(si=>si.id===ci.id)){
        window._usageSelectedItems.push({id:ci.id,name:ci.name,icon:getItemIcon(ci,14)});
      }
    });
  }
  render();
}

function _refreshUsageCatList(){
  const container=document.getElementById('usage-cat-list');
  if(!container) return render();
  if(!window._usageSelectedItems) window._usageSelectedItems=[];
  const selectedIds=window._usageSelectedItems.map(i=>i.id);
  const q=(window._usageSearchQ||'').toLowerCase();
  const _prioCats=['Cordages','Sac Manoeuvre #1','Sac Manoeuvre #2','Sauveteur 1','Sauveteur 2','Harnais sauveteur','Premier de cordée'];
  const categories=[...new Set(ITEMS.map(i=>i.cat).filter(c=>c))].sort((a,b)=>{
    const pa=_prioCats.indexOf(a),pb=_prioCats.indexOf(b);
    if(pa!==-1&&pb!==-1) return pa-pb;
    if(pa!==-1) return -1;
    if(pb!==-1) return 1;
    return a.localeCompare(b);
  });
  let filteredCats=categories;
  if(q){
    filteredCats=categories.filter(cat=>{
      if(cat.toLowerCase().includes(q)) return true;
      return ITEMS.filter(i=>i.cat===cat).some(i=>i.name.toLowerCase().includes(q)||i.id.toLowerCase().includes(q));
    });
  }
  container.innerHTML=filteredCats.map(cat=>{
    const catItems=ITEMS.filter(i=>i.cat===cat);
    let filtItems=catItems;
    if(q) filtItems=catItems.filter(i=>i.cat.toLowerCase().includes(q)||i.name.toLowerCase().includes(q)||i.id.toLowerCase().includes(q));
    const selCount=filtItems.filter(i=>selectedIds.includes(i.id)).length;
    const allSel=selCount===filtItems.length&&filtItems.length>0;
    const icon=filtItems[0]?getItemIcon(filtItems[0],20):'';
    const isExp=window._usageExpandedCat===cat;
    return '<div style="border:1px solid '+(allSel?'var(--blue)':selCount>0?'rgba(59,130,246,.4)':'var(--border)')+';border-radius:12px;margin-bottom:8px;overflow:hidden;'+(selCount>0?'background:rgba(59,130,246,.04)':'')+'">'+
      '<div style="display:flex;align-items:center;padding:12px 14px;cursor:pointer;gap:8px" onclick="window._usageExpandedCat='+(isExp?'null':"'"+cat.replace(/'/g,"\\'")+"'")+';render()">'+
        '<span style="display:inline-flex;align-items:center">'+icon+'</span>'+
        '<div style="flex:1">'+
          '<div style="font-size:14px;font-weight:700;color:'+(allSel?'var(--blue)':'var(--txt)')+'">'+escapeHtml(cat)+'</div>'+
          '<div style="font-size:11px;color:var(--muted)">'+filtItems.length+' items'+(selCount?' — <span style="color:var(--blue)">'+selCount+' sélectionné'+(selCount>1?'s':'')+'</span>':'')+'</div>'+
        '</div>'+
        '<button onclick="event.stopPropagation();selectAllUsageCategory(\''+cat.replace(/'/g,"\\'")+'\')" style="padding:4px 10px;border-radius:8px;border:1px solid '+(allSel?'var(--blue)':'var(--border)')+';background:'+(allSel?'rgba(59,130,246,.15)':'var(--card)')+';color:'+(allSel?'var(--blue)':'var(--muted)')+';font-size:11px;cursor:pointer;font-family:Oswald,sans-serif;letter-spacing:1px">'+(allSel?'TOUT':'TOUT')+'</button>'+
        '<span style="font-size:12px;color:var(--muted);transition:transform .2s;transform:rotate('+(isExp?'180':'0')+'deg)">▼</span>'+
      '</div>'+
      (isExp?'<div style="padding:0 10px 10px;border-top:1px solid var(--border)">'+
        filtItems.map(item=>{
          const sel=selectedIds.includes(item.id);
          const hrs=getItemUsage(item.id);
          const _ic=getItemConditions()[item.id];
          const _icObj=_ic?USAGE_CONDITIONS.find(x=>x.key===_ic.condition):null;
          const _icBadge=_icObj&&_icObj.key!=='ok'?' <span style="font-size:9px;color:'+_icObj.color+'">'+_icObj.icon+'</span>':'';
          return '<div onclick="toggleUsageItem(\''+item.id+'\')" style="display:flex;align-items:center;gap:8px;padding:8px 6px;cursor:pointer;border-bottom:1px solid rgba(59,130,246,.05)">'+
            '<span style="width:20px;height:20px;border-radius:6px;border:2px solid '+(sel?'var(--blue)':'var(--border)')+';background:'+(sel?'var(--blue)':'transparent')+';display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0">'+(sel?'<svg style="width:11px;height:11px;stroke:#fff;stroke-width:3;fill:none" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>':'')+'</span>'+
            '<span style="font-size:14px;display:inline-flex;align-items:center">'+getItemIcon(item,14)+'</span>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:13px;font-weight:600;color:'+(sel?'var(--blue)':'var(--txt)')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escapeHtml(item.name)+_icBadge+'</div>'+
              '<div style="font-size:10px;color:var(--muted);font-family:JetBrains Mono,monospace">'+escapeHtml(item.id)+(hrs>0?' — <span style="color:var(--blue)">'+hrs.toFixed(1)+'h</span>':'')+'</div>'+
            '</div>'+
          '</div>';
        }).join('')+
      '</div>':'')+
    '</div>';
  }).join('');
}

function renderUsageTracker(){
  if(!window._usageSelectedItems) window._usageSelectedItems=[];
  if(!window._usageType) window._usageType='intervention';
  if(!window._usageSearchQ) window._usageSearchQ='';
  const active=getActiveUsageSession();
  const log=getUsageLog();
  const user=PERSONNEL.find(p=>p.volo==='V'+state.pin);
  const selectedIds=window._usageSelectedItems.map(i=>i.id);
  const q=window._usageSearchQ.toLowerCase();

  // Active session display
  let activeHtml='';
  if(active){
    const elapsed=Math.floor((Date.now()-new Date(active.start).getTime())/1000);
    const hh=String(Math.floor(elapsed/3600)).padStart(2,'0');
    const mm=String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
    const ss=String(elapsed%60).padStart(2,'0');
    activeHtml=`
    <div style="background:linear-gradient(135deg,rgba(192,57,43,.15),rgba(192,57,43,.08));border:2px solid var(--red);border-radius:14px;padding:16px;margin-bottom:16px;animation:pulse-border 2s infinite">
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-family:Oswald,sans-serif;font-size:14px;letter-spacing:3px;color:var(--red);margin-bottom:4px">SESSION EN COURS</div>
        <div style="font-family:JetBrains Mono,monospace;font-size:36px;font-weight:700;color:var(--txt)" class="usage-timer-display">${hh}:${mm}:${ss}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${active.type.toUpperCase()} — ${active.user}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Débuté à ${new Date(active.start).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-bottom:12px">
        ${active.items.map(i=>'<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(192,57,43,.12);color:var(--red)">'+(i.icon||'')+' '+i.name+'</span>').join('')}
      </div>
      <div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:10px">${active.items.length} item${active.items.length>1?'s':''}</div>
      <button class="btn btn-red" onclick="stopUsageSession()">FIN UTILISATION</button>
    </div>`;
  }

  // Usage type selector
  const types=[{key:'intervention',label:'INTERVENTION',icon:''},{key:'montage',label:'MONTAGE',icon:''},{key:'formation',label:'FORMATION',icon:''},{key:'exercice',label:'EXERCICE',icon:''}];
  const typeHtml=active?'':`
  <div style="margin-bottom:14px">
    <div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:6px;text-align:center">TYPE D'UTILISATION</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${types.map(t=>'<button class="usage-type-btn btn-filter'+(window._usageType===t.key?' active':'')+'" data-type="'+t.key+'" onclick="window._usageType=\''+t.key+'\';document.querySelectorAll(\'.usage-type-btn\').forEach(b=>b.classList.remove(\'active\'));this.classList.add(\'active\')" style="flex:1;min-width:70px;text-align:center;padding:10px 4px;font-size:11px">'+t.icon+'<br>'+t.label+'</button>').join('')}
    </div>
  </div>`;

  // Item selection (by category) — priorité cordes, sacs, harnais
  const _prioCats=['Cordages','Sac Manoeuvre #1','Sac Manoeuvre #2','Sauveteur 1','Sauveteur 2','Harnais sauveteur','Premier de cordée'];
  const categories=[...new Set(ITEMS.map(i=>i.cat).filter(c=>c))].sort((a,b)=>{
    const pa=_prioCats.indexOf(a),pb=_prioCats.indexOf(b);
    if(pa!==-1&&pb!==-1) return pa-pb;
    if(pa!==-1) return -1;
    if(pb!==-1) return 1;
    return a.localeCompare(b);
  });
  let catHtml='';
  if(!active){
    let filteredCats=categories;
    if(q){
      filteredCats=categories.filter(cat=>{
        if(cat.toLowerCase().includes(q)) return true;
        return ITEMS.filter(i=>i.cat===cat).some(i=>i.name.toLowerCase().includes(q)||i.id.toLowerCase().includes(q));
      });
    }
    catHtml=`
    <div style="margin-bottom:14px">
      <div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:6px;text-align:center">SÉLECTION ITEMS</div>
      <input type="text" placeholder="Rechercher item, catégorie, ID..." value="${window._usageSearchQ}" oninput="window._usageSearchQ=this.value;_refreshUsageCatList()" style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:14px;font-family:Inter,sans-serif;margin-bottom:10px;outline:none">
      <div id="usage-cat-list" style="max-height:50vh;overflow-y:auto;-webkit-overflow-scrolling:touch">
      ${filteredCats.map(cat=>{
        const catItems=ITEMS.filter(i=>i.cat===cat);
        let filtItems=catItems;
        if(q) filtItems=catItems.filter(i=>i.cat.toLowerCase().includes(q)||i.name.toLowerCase().includes(q)||i.id.toLowerCase().includes(q));
        const selCount=filtItems.filter(i=>selectedIds.includes(i.id)).length;
        const allSel=selCount===filtItems.length&&filtItems.length>0;
        const icon=filtItems[0]?getItemIcon(filtItems[0],20):'';
        const isExp=window._usageExpandedCat===cat;
        const _usc=typeof SAC_COLORS!=='undefined'?SAC_COLORS[cat]:null;
        const _uscDot=_usc?'<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+_usc.hex+';margin-right:5px;vertical-align:middle;box-shadow:0 0 5px '+_usc.hex+'60"></span>':'';
        return '<div style="border:1px solid '+(allSel?'var(--blue)':selCount>0?'rgba(59,130,246,.4)':'var(--border)')+';border-radius:12px;margin-bottom:8px;overflow:hidden;'+(_usc?'border-left:3px solid '+_usc.hex+';':'')+(selCount>0?'background:rgba(59,130,246,.04)':'')+'">'+
          '<div style="display:flex;align-items:center;padding:12px 14px;cursor:pointer;gap:8px" onclick="window._usageExpandedCat='+(isExp?'null':"'"+cat.replace(/'/g,"\\'")+"'")+';render()">'+
            '<span style="display:inline-flex;align-items:center">'+icon+'</span>'+
            '<div style="flex:1">'+
              '<div style="font-size:14px;font-weight:700;color:'+(allSel?'var(--blue)':'var(--txt)')+'">'+_uscDot+cat+'</div>'+
              '<div style="font-size:11px;color:var(--muted)">'+filtItems.length+' items'+(selCount?' — <span style="color:var(--blue)">'+selCount+' sélectionné'+(selCount>1?'s':'')+'</span>':'')+'</div>'+
            '</div>'+
            '<button onclick="event.stopPropagation();selectAllUsageCategory(\''+cat.replace(/'/g,"\\'")+'\')" style="padding:4px 10px;border-radius:8px;border:1px solid '+(allSel?'var(--blue)':'var(--border)')+';background:'+(allSel?'rgba(59,130,246,.15)':'var(--card)')+';color:'+(allSel?'var(--blue)':'var(--muted)')+';font-size:11px;cursor:pointer;font-family:Oswald,sans-serif;letter-spacing:1px">'+(allSel?'TOUT':'TOUT')+'</button>'+
            '<span style="font-size:12px;color:var(--muted);transition:transform .2s;transform:rotate('+(isExp?'180':'0')+'deg)">▼</span>'+
          '</div>'+
          (isExp?'<div style="padding:0 10px 10px;border-top:1px solid var(--border)">'+
            filtItems.map(item=>{
              const sel=selectedIds.includes(item.id);
              const hrs=getItemUsage(item.id);
              const _ic=getItemConditions()[item.id];
              const _icObj=_ic?USAGE_CONDITIONS.find(x=>x.key===_ic.condition):null;
              const _icBadge=_icObj&&_icObj.key!=='ok'?' <span style="font-size:9px;color:'+_icObj.color+'">'+_icObj.icon+'</span>':'';
              return '<div onclick="toggleUsageItem(\''+item.id+'\')" style="display:flex;align-items:center;gap:8px;padding:8px 6px;cursor:pointer;border-bottom:1px solid rgba(59,130,246,.05)">'+
                '<span style="width:20px;height:20px;border-radius:6px;border:2px solid '+(sel?'var(--blue)':'var(--border)')+';background:'+(sel?'var(--blue)':'transparent')+';display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0">'+(sel?'<svg style="width:11px;height:11px;stroke:#fff;stroke-width:3;fill:none" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>':'')+'</span>'+
                '<span style="font-size:14px;display:inline-flex;align-items:center">'+getItemIcon(item,14)+'</span>'+
                '<div style="flex:1;min-width:0">'+
                  '<div style="font-size:13px;font-weight:600;color:'+(sel?'var(--blue)':'var(--txt)')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+item.name+_icBadge+'</div>'+
                  '<div style="font-size:10px;color:var(--muted);font-family:JetBrains Mono,monospace">'+item.id+(hrs>0?' — <span style="color:var(--blue)">'+hrs.toFixed(1)+'h</span>':'')+'</div>'+
                '</div>'+
              '</div>';
            }).join('')+
          '</div>':'')+
        '</div>';
      }).join('')}
      </div>
    </div>`;
  }

  // Selected items summary
  let selSummary='';
  if(!active&&selectedIds.length>0){
    selSummary=`
    <div style="background:var(--card);border:1px solid var(--blue);border-radius:12px;padding:12px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-family:Oswald,sans-serif;font-size:13px;letter-spacing:2px;color:var(--blue)">ITEMS SÉLECTIONNÉS</div>
        <div style="font-family:JetBrains Mono,monospace;font-size:12px;color:var(--blue);font-weight:700">${selectedIds.length}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
        ${window._usageSelectedItems.map(i=>'<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(59,130,246,.1);color:var(--blue)">'+(i.icon||'')+' '+i.name+'</span>').join('')}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-blue" onclick="startUsageSession()" style="flex:1"><svg style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none;vertical-align:middle" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> DÉBUT UTILISATION</button>
        <button class="btn btn-outline" onclick="showManualUsageEntry()" style="flex:1">ENTRÉE MANUELLE</button>
      </div>
    </div>`;
  }

  // Usage history
  const allItems=Object.values(log);
  const totalHrs=allItems.reduce((s,item)=>s+item.total_hours,0);
  const recentSessions=[];
  allItems.forEach(item=>{
    (item.sessions||[]).forEach(sess=>{
      recentSessions.push({...sess,itemId:item.id,itemName:item.name});
    });
  });
  recentSessions.sort((a,b)=>new Date(b.end||b.start)-new Date(a.end||a.start));
  const last10=recentSessions.slice(0,10);

  // Count total missions from PICK-ON history
  let totalMissions=0;
  try{
    const hist=JSON.parse(localStorage.getItem('volo_history')||'[]');
    totalMissions=hist.filter(h=>h.mode==='PICK-ON').length;
  }catch(e){}

  // Items with condition alerts
  const itemConds=getItemConditions();
  const alertItems=Object.entries(itemConds).filter(([id,c])=>c.condition&&c.condition!=='ok');

  let alertsHtml='';
  if(alertItems.length>0){
    alertsHtml=`
    <div style="margin-bottom:14px">
      <div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--red);margin-bottom:6px;text-align:center">ALERTES CONDITION</div>
      ${alertItems.map(([id,c])=>{
        const condObj=USAGE_CONDITIONS.find(x=>x.key===c.condition);
        const item=ITEMS.find(i=>i.id===id);
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid '+(condObj?condObj.color:'var(--border)')+';border-radius:10px;margin-bottom:6px;background:var(--card)">'+
          '<span style="font-size:16px">'+(condObj?condObj.icon:'')+'</span>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(item?item.name:id)+'</div>'+
            '<div style="font-size:10px;color:'+(condObj?condObj.color:'var(--muted)')+'">'+(condObj?condObj.label:'')+(c.note?' — '+c.note:'')+'</div>'+
            '<div style="font-size:9px;color:var(--muted)">'+c.ts+'</div>'+
          '</div>'+
          '<button onclick="saveItemCondition(\''+id+'\',\'ok\',\'\');render()" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--green,#22C55E);font-size:10px;cursor:pointer">RÉSOLU</button>'+
        '</div>';
      }).join('')}
    </div>`;
  }

  let historyHtml='';
  if(last10.length>0||totalMissions>0){
    historyHtml=`
    <div style="margin-top:16px">
      <div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:8px;text-align:center">HISTORIQUE UTILISATION</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center">
          <div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--blue)">${totalHrs.toFixed(1)}</div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px">HEURES</div>
        </div>
        <div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center">
          <div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--gold)">${recentSessions.length}</div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px">SESSIONS</div>
        </div>
        <div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center">
          <div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--rescue)">${totalMissions}</div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px">MISSIONS</div>
        </div>
        <div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center">
          <div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--txt)">${allItems.length}</div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px">ITEMS</div>
        </div>
      </div>
      ${alertsHtml}
      ${last10.length>0?`<div style="max-height:300px;overflow-y:auto">
        ${last10.map(s=>{
          const d=new Date(s.end||s.start);
          const hh=Math.floor((s.duration_min||0)/60);
          const mm=(s.duration_min||0)%60;
          const typeColors={intervention:'var(--red)',montage:'var(--orange)',formation:'var(--gold)',exercice:'var(--blue)'};
          const condObj=s.condition?USAGE_CONDITIONS.find(c=>c.key===s.condition):null;
          const condBadge=condObj&&condObj.key!=='ok'?'<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.08);color:'+condObj.color+'">'+condObj.icon+' '+condObj.label.split('—')[0].trim()+'</span>':'';
          const noteBadge=s.note?'<div style="font-size:10px;color:var(--gold);margin-top:2px">'+s.note+'</div>':'';
          const manualBadge=s.manual?'<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(59,130,246,.1);color:var(--blue)">MANUEL</span>':'';
          return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">'+
            '<div style="width:6px;height:6px;border-radius:50%;background:'+(typeColors[s.type]||'var(--muted)')+';flex-shrink:0;margin-top:6px"></div>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+s.itemName+'</div>'+
              '<div style="font-size:10px;color:var(--muted)">'+d.toLocaleDateString('fr-CA')+' — '+(s.type||'').toUpperCase()+' — '+s.user+'</div>'+
              (condBadge||manualBadge?'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">'+condBadge+manualBadge+'</div>':'')+
              noteBadge+
            '</div>'+
            '<div style="font-family:JetBrains Mono,monospace;font-size:12px;color:var(--blue);font-weight:600;flex-shrink:0">'+(hh>0?hh+'h ':'')+mm+'m</div>'+
          '</div>';
        }).join('')}
      </div>`:''}`+`
    </div>`;
  }

  return `
    <button class="top-back" onclick="setState({step:0})"><svg style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none;vertical-align:middle" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> RETOUR</button>
    <h2>SUIVI MATERIEL</h2>
    <p style="text-align:center;font-size:13px;color:var(--muted);margin-bottom:16px">Heures & etat du materiel</p>

    ${activeHtml}
    ${selSummary}
    ${typeHtml}
    ${catHtml}
    ${historyHtml}

  `;
}
