// ══════════════════════════════════════════
//  ANNONCES & ALERTES URGENCE (Chef)
// ── Extracted from index.html — VOLO SST V20.7
// ══════════════════════════════════════════
var voloAnnouncement=null;
var voloUrgencyAlert=null;
var _announcementListener=null;
var _urgencyListener=null;

function loadAnnouncement(){
  if(firebaseDB){
    if(!_announcementListener){
      _announcementListener=firebaseDB.ref('announcement').on('value',function(snap){
        voloAnnouncement=snap.val()||null;
        renderAnnouncementBanner();
      });
    }
    if(!_urgencyListener){
      _urgencyListener=firebaseDB.ref('urgency_alert').on('value',function(snap){
        voloUrgencyAlert=snap.val()||null;
        renderUrgencyBanner();
      });
    }
  } else {
    try{voloAnnouncement=JSON.parse(localStorage.getItem('volo_announcement')||'null');}catch(e){voloAnnouncement=null;}
    try{voloUrgencyAlert=JSON.parse(localStorage.getItem('volo_urgency_alert')||'null');}catch(e){voloUrgencyAlert=null;}
  }
}
function stopAnnouncementListeners(){
  if(firebaseDB&&_announcementListener){firebaseDB.ref('announcement').off('value',_announcementListener);_announcementListener=null;}
  if(firebaseDB&&_urgencyListener){firebaseDB.ref('urgency_alert').off('value',_urgencyListener);_urgencyListener=null;}
}

function showAnnouncementModal(){
  var existing=voloAnnouncement?voloAnnouncement.text:'';
  setState({showModal:'announcement',_announceDraft:existing});
}
function saveAnnouncement(){
  var el=document.getElementById('announce-text');
  var text=el?el.value.trim():'';
  if(!text){deleteAnnouncement();return;}
  var user=PERSONNEL.find(function(p){return p.volo==='V'+state.pin;});
  var data={text:text,author:user?user.name:'Chef',timestamp:Date.now()};
  if(firebaseDB){
    firebaseDB.ref('announcement').set(data);
  } else {
    localStorage.setItem('volo_announcement',JSON.stringify(data));
    voloAnnouncement=data;
  }
  showToast('Annonce publiée','ok');
  setState({showModal:null});
}
function deleteAnnouncement(){
  if(firebaseDB){
    firebaseDB.ref('announcement').remove();
  } else {
    localStorage.removeItem('volo_announcement');
    voloAnnouncement=null;
  }
  showToast('Annonce supprimée','ok');
  setState({showModal:null});
}

function triggerUrgencyAlert(){
  var user=PERSONNEL.find(function(p){return p.volo==='V'+state.pin;});
  var data={active:true,author:user?user.name:'Chef',timestamp:Date.now()};
  if(firebaseDB){
    firebaseDB.ref('urgency_alert').set(data);
    firebaseDB.ref('urgency_log').push({author:data.author,action:'DÉCLENCHÉE',timestamp:data.timestamp});
  } else {
    localStorage.setItem('volo_urgency_alert',JSON.stringify(data));
    voloUrgencyAlert=data;
  }
  // Push notification broadcast à toute l'équipe
  try{if(typeof VoloData!=='undefined'&&VoloData.notifyUrgencyAlert){VoloData.notifyUrgencyAlert(data);}}catch(e){}
  showToast('Alerte urgence déclenchée','err');
  setState({showModal:null});
}
function liftUrgencyAlert(){
  if(firebaseDB){
    firebaseDB.ref('urgency_alert').remove();
    var user=PERSONNEL.find(function(p){return p.volo==='V'+state.pin;});
    firebaseDB.ref('urgency_log').push({author:user?user.name:'Chef',action:'LEVÉE',timestamp:Date.now()});
  } else {
    localStorage.removeItem('volo_urgency_alert');
    voloUrgencyAlert=null;
  }
  showToast('Alerte levée','ok');
  render();
}

function getAnnouncementBannerHtml(){
  if(!voloAnnouncement||!voloAnnouncement.text) return '';
  var d=voloAnnouncement.timestamp?new Date(voloAnnouncement.timestamp).toLocaleString('fr-CA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  return '<div id="announceBanner" style="margin-bottom:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(212,160,23,.18),rgba(212,160,23,.06));border:2px solid var(--gold);border-radius:14px">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
      '<span style="font-size:22px"></span>'+
      '<span style="font-family:Oswald,sans-serif;font-size:14px;letter-spacing:2px;color:var(--gold);flex:1">ANNONCE</span>'+
      '<span style="font-size:10px;color:var(--muted)">'+d+'</span>'+
    '</div>'+
    '<div style="font-size:14px;color:var(--txt);line-height:1.5;white-space:pre-wrap">'+escapeHtml(voloAnnouncement.text)+'</div>'+
    '<div style="font-size:11px;color:var(--gold);margin-top:6px;text-align:right">— '+escapeHtml(voloAnnouncement.author||'')+'</div>'+
  '</div>';
}
function getUrgencyBannerHtml(){
  if(!voloUrgencyAlert||!voloUrgencyAlert.active) return '';
  var d=voloUrgencyAlert.timestamp?new Date(voloUrgencyAlert.timestamp).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'}):'';
  var chef=isUserChef();
  return '<div id="urgencyBanner" style="margin-bottom:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(192,57,43,.25),rgba(192,57,43,.08));border:2px solid var(--red);border-radius:14px;animation:pulse-border 1.5s infinite">'+
    '<div style="display:flex;align-items:center;gap:8px">'+
      '<span style="font-size:26px"></span>'+
      '<div style="flex:1">'+
        '<div style="font-family:Oswald,sans-serif;font-size:16px;letter-spacing:2px;color:var(--red);font-weight:700">ALERTE URGENCE</div>'+
        '<div style="font-size:13px;color:var(--txt);margin-top:3px">Contactez votre chef immédiatement — '+d+'</div>'+
      '</div>'+
    '</div>'+
    (chef?'<button onclick="liftUrgencyAlert()" style="margin-top:10px;width:100%;padding:10px;border-radius:10px;border:1px solid var(--green);background:rgba(39,174,96,.1);color:var(--green);font-family:Oswald,sans-serif;font-size:13px;letter-spacing:2px;cursor:pointer"><svg style="width:32px;height:32px;stroke:var(--green);stroke-width:2;fill:none" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> LEVER L\'ALERTE</button>':'')+
  '</div>';
}
function renderAnnouncementBanner(){
  var el=document.getElementById('announceBanner');
  if(el){
    if(voloAnnouncement&&voloAnnouncement.text){el.outerHTML=getAnnouncementBannerHtml();}
    else{el.remove();}
  } else if(voloAnnouncement&&voloAnnouncement.text&&state.step===0){render();}
}
function renderUrgencyBanner(){
  var el=document.getElementById('urgencyBanner');
  if(el){
    if(voloUrgencyAlert&&voloUrgencyAlert.active){el.outerHTML=getUrgencyBannerHtml();}
    else{el.remove();}
  } else if(voloUrgencyAlert&&voloUrgencyAlert.active&&state.step===0){render();}
}
