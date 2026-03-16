// ══════════════════════════════════════════
//  FIREBASE INIT — utilise firebase-config.js (chargé dans <head>)
//  firebaseDB, firebaseFS, firebaseAuth sont initialisés par firebase-config.js
// ══════════════════════════════════════════
// ── Extracted from index.html — VOLO SST V20.7
// ══════════════════════════════════════════
var firebaseDB=window.firebaseDB||null;

// ══════════════════════════════════════════
//  CHAT MODULE — Firebase Realtime Database
// ══════════════════════════════════════════
var chatMessages=[], chatListener=null;
var chatMode='general'; // 'general' | 'sauveteur' | 'dm' | 'dm-list'
var chatDmTarget=null;
var chatUnreadCount=0;
var chatMentionDropdown=false, chatMentionFilter='', chatMentionIdx=0;
var chatNewMsgCount=0, chatIsAtBottom=true;
var chatDmCache={};
const CHAT_LS='volo_chat_';
const CHAT_LS_READ=CHAT_LS+'last_read';
const CHAT_MONTHS=['JAN','FÉV','MAR','AVR','MAI','JUN','JUL','AOÛ','SEP','OCT','NOV','DÉC'];
const CHAT_COLORS=['#E65100','#D4A017','#27AE60','#3B82F6','#8E44AD','#C0392B','#E67E22','#16A085','#2980B9','#8E44AD'];

function chatGetCurrentUser(){
  if(typeof PERSONNEL==='undefined'||!PERSONNEL.length) return null;
  const user=PERSONNEL.find(p=>p.volo==='V'+state.pin);
  if(!user) return null;
  return {id:user.id, name:user.name, role:user.role, type:user.type};
}
function chatColor(uid){
  let h=0;for(let i=0;i<uid.length;i++)h=uid.charCodeAt(i)+((h<<5)-h);
  return CHAT_COLORS[Math.abs(h)%CHAT_COLORS.length];
}
function chatInitials(name){
  const p=(name||'?').trim().split(' ');
  return (p[0][0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase();
}
function chatTimeAgo(ts){
  const now=Date.now(),diff=now-ts;
  if(diff<60000) return "à l'instant";
  if(diff<3600000) return Math.floor(diff/60000)+'min';
  if(diff<86400000){const d=new Date(ts);return d.getHours()+'h'+String(d.getMinutes()).padStart(2,'0');}
  if(diff<172800000){const d=new Date(ts);return 'hier '+d.getHours()+'h'+String(d.getMinutes()).padStart(2,'0');}
  const d=new Date(ts);return d.getDate()+'/'+(d.getMonth()+1)+' '+d.getHours()+'h'+String(d.getMinutes()).padStart(2,'0');
}
function chatDayLabel(ts){
  const d=new Date(ts),today=new Date();
  if(d.toDateString()===today.toDateString()) return "AUJOURD'HUI";
  const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
  if(d.toDateString()===yesterday.toDateString()) return 'HIER';
  return d.getDate()+' '+CHAT_MONTHS[d.getMonth()]+' '+d.getFullYear();
}
function chatDbPath(){
  if(chatMode==='dm'&&chatDmTarget){
    const cu=chatGetCurrentUser();
    if(!cu) return 'messages';
    const ids=[cu.id,chatDmTarget.id].sort();
    return 'private/'+ids[0]+'_'+ids[1];
  }
  if(chatMode==='sauveteur') return 'channels/sauveteur';
  return 'messages';
}
function chatGetDmUnread(targetId){
  const key=CHAT_LS+'dm_read_'+targetId;
  const lastRead=parseInt(localStorage.getItem(key)||'0');
  const cached=chatDmCache[targetId]||[];
  const cu=chatGetCurrentUser();
  if(!cu) return 0;
  return cached.filter(m=>m.authorId!==cu.id&&m.timestamp>lastRead).length;
}

// ── Load DM cache for unread badges ──
function chatLoadDmCache(){
  if(!firebaseDB) return;
  var cu=chatGetCurrentUser();
  if(!cu) return;
  PERSONNEL.forEach(function(p){
    if(p.id===cu.id) return;
    var ids=[cu.id,p.id].sort();
    var path='private/'+ids[0]+'_'+ids[1];
    firebaseDB.ref(path).orderByChild('timestamp').limitToLast(20).once('value',function(snap){
      var data=snap.val();
      if(data) chatDmCache[p.id]=Object.values(data).sort(function(a,b){return a.timestamp-b.timestamp;});
    });
  });
}

// ── Firebase listeners ──
function chatStartListening(){
  const cu=chatGetCurrentUser();
  if(!cu) return;
  if(!firebaseDB){chatLoadLocal();return;}
  chatStopListening();
  chatLoadDmCache();
  const ref=firebaseDB.ref(chatDbPath()).orderByChild('timestamp').limitToLast(200);
  chatListener=ref.on('value',snap=>{
    const data=snap.val()||{};
    chatMessages=Object.values(data).sort((a,b)=>a.timestamp-b.timestamp);
    if(state.step!==17){
      const lastRead=parseInt(localStorage.getItem(CHAT_LS_READ)||'0');
      chatUnreadCount=chatMessages.filter(m=>m.timestamp>lastRead&&m.authorId!==cu.id).length;
    }
    const lastRead2=parseInt(localStorage.getItem(CHAT_LS_READ)||'0');
    const newMentions=chatMessages.filter(m=>m.timestamp>lastRead2&&m.authorId!==cu.id&&m.text&&m.text.includes('@'+cu.name.split(' ')[0]));
    if(newMentions.length>0&&state.step!==17){
      showToast(''+newMentions[newMentions.length-1].authorName+' vous a mentionné','info');
    }
    if(state.step===17) chatRenderMessages();
  });
}
function chatStopListening(){
  if(chatListener&&firebaseDB){
    firebaseDB.ref(chatDbPath()).off('value',chatListener);
    chatListener=null;
  }
}
function chatLoadLocal(){
  try{chatMessages=JSON.parse(localStorage.getItem(CHAT_LS+'msgs_'+chatDbPath().replace(/\//g,'_'))||'[]');}catch(e){chatMessages=[];}
  if(state.step===17) chatRenderMessages();
}
function chatSaveLocal(){
  localStorage.setItem(CHAT_LS+'msgs_'+chatDbPath().replace(/\//g,'_'),JSON.stringify(chatMessages.slice(-200)));
}

// ── Send message ──
function chatSend(){
  var cu=chatGetCurrentUser();
  if(!cu) return;
  var input=document.getElementById('chatInput');
  if(!input)return;
  var text=input.value.trim();
  if(!text)return;
  var msg={
    id:'m'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    authorId:cu.id,
    authorName:cu.name,
    text:text,
    timestamp:Date.now(),
    pinned:false,
    reactions:{}
  };
  if(firebaseDB){
    firebaseDB.ref(chatDbPath()+'/'+msg.id).set(msg);
  } else {
    chatMessages.push(msg);
    chatSaveLocal();
    chatRenderMessages();
  }
  input.value='';
  input.style.height='36px';
  chatMentionDropdown=false;
  var dd=document.getElementById('chatMentionDD');
  if(dd)dd.classList.remove('visible');
}

// ── Reactions ──
function chatReact(msgId,emoji){
  var cu=chatGetCurrentUser();
  if(!cu) return;
  var path=chatDbPath()+'/'+msgId+'/reactions/'+emoji;
  if(firebaseDB){
    var ref=firebaseDB.ref(path);
    ref.once('value',snap=>{
      var arr=snap.val()||[];
      var idx=arr.indexOf(cu.id);
      if(idx>-1) arr.splice(idx,1); else arr.push(cu.id);
      ref.set(arr.length?arr:null);
    });
  } else {
    var msg=chatMessages.find(m=>m.id===msgId);
    if(!msg)return;
    if(!msg.reactions)msg.reactions={};
    if(!msg.reactions[emoji])msg.reactions[emoji]=[];
    var idx=msg.reactions[emoji].indexOf(cu.id);
    if(idx>-1) msg.reactions[emoji].splice(idx,1); else msg.reactions[emoji].push(cu.id);
    if(!msg.reactions[emoji].length) delete msg.reactions[emoji];
    chatSaveLocal();
    chatRenderMessages();
  }
}

// ── Pin ──
function chatPin(msgId){
  if(!isUserChef())return;
  var path=chatDbPath();
  if(firebaseDB){
    firebaseDB.ref(path).once('value',snap=>{
      var data=snap.val()||{};
      var updates={};
      Object.keys(data).forEach(k=>{
        if(data[k].pinned) updates[k+'/pinned']=false;
      });
      updates[msgId+'/pinned']=true;
      firebaseDB.ref(path).update(updates);
    });
  } else {
    chatMessages.forEach(m=>m.pinned=false);
    var msg=chatMessages.find(m=>m.id===msgId);
    if(msg)msg.pinned=true;
    chatSaveLocal();
    chatRenderMessages();
  }
}
function chatUnpin(msgId){
  if(firebaseDB){
    firebaseDB.ref(chatDbPath()+'/'+msgId+'/pinned').set(false);
  } else {
    var msg=chatMessages.find(m=>m.id===msgId);
    if(msg)msg.pinned=false;
    chatSaveLocal();
    chatRenderMessages();
  }
}

// ── Mention processing ──
function chatProcessMentions(text){
  var result=text;
  PERSONNEL.forEach(p=>{
    var firstName=p.name.split(' ')[0];
    var re=new RegExp('@'+firstName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
    result=result.replace(re,'<span class="chat-mention">@'+firstName+'</span>');
  });
  return result;
}

// ── Channel switch ──
function chatSwitchChannel(channel){
  if(chatMode===channel) return;
  // Surveillants cannot access sauveteur channel
  if(channel==='sauveteur'&&isUserSurv()) return;
  chatStopListening();
  chatMode=channel;
  chatMessages=[];
  chatStartListening();
  chatRenderFull();
}

// ── DM navigation ──
function chatOpenDM(targetId,targetName){
  chatStopListening();
  chatLastChannel=chatMode==='dm'?chatLastChannel:chatMode;
  chatMode='dm';
  chatDmTarget={id:targetId,name:targetName};
  chatMessages=[];
  localStorage.setItem(CHAT_LS+'dm_read_'+targetId,Date.now().toString());
  chatStartListening();
  chatRenderFull();
}
var chatLastChannel='general'; // remember last channel before DM
function chatBackToGeneral(){
  chatStopListening();
  chatMode=chatLastChannel||'general';
  chatDmTarget=null;
  chatMessages=[];
  chatStartListening();
  chatRenderFull();
}

// ── Render ──
function renderMainChat(){
  // Mark as read when entering
  chatUnreadCount=0;
  localStorage.setItem(CHAT_LS_READ,Date.now().toString());
  // Start listening if not already
  chatStartListening();
  return `<button class="top-back" onclick="chatStopListening();setState({step:typeof window._chatPrevStep==='number'?window._chatPrevStep:0})"><svg style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none;vertical-align:middle" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> RETOUR</button>
    <h2>CHAT ÉQUIPE</h2>
    <div id="chatContainer" style="margin-top:10px"></div>`;
}
function initMainChatUI(){
  chatRenderFull();
}
function chatRenderFull(){
  var container=document.getElementById('chatContainer');
  if(!container)return;
  var cu=chatGetCurrentUser();
  if(!cu){container.innerHTML='<p style="text-align:center;color:var(--muted);padding:40px">Connectez-vous pour accéder au chat</p>';return;}

  var pinned=chatMessages.find(m=>m.pinned);
  var isDM=chatMode==='dm';
  var isSauv=chatMode==='sauveteur';
  var isSurvUser=isUserSurv();
  var sauvCount=PERSONNEL.filter(function(p){return p.type==='SAUVETEUR';}).length;

  var html='<div class="chat-wrap">';
  // Header
  html+='<div class="chat-header">';
  if(isDM){
    html+='<button onclick="chatBackToGeneral()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:2px 6px" aria-label="Retour au canal général">‹</button>';
    html+='<div class="chat-header-title">'+escapeHtml(chatDmTarget.name)+'</div>';
    html+='<div class="chat-header-sub">MESSAGE PRIVÉ</div>';
  } else {
    html+='<span style="font-size:16px">'+(isSauv?'<svg style="width:16px;height:16px;stroke:var(--gold);stroke-width:1.5;fill:none" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>':'<svg style="width:16px;height:16px;stroke:var(--blue);stroke-width:1.5;fill:none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>')+'</span>';
    html+='<div class="chat-header-title">'+(isSauv?'SAUVETEURS':'TOUS')+'</div>';
    html+='<div class="chat-header-sub">'+(isSauv?sauvCount+' sauveteurs':PERSONNEL.length+' membres')+'</div>';
    if(isUserChef()){
      html+='<button onclick="chatShowDMList()" style="background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);color:var(--gold);border-radius:8px;padding:5px 10px;font-family:Oswald,sans-serif;font-size:9px;letter-spacing:1px;cursor:pointer"><svg style="width:14px;height:14px;stroke:var(--gold);stroke-width:1.5;fill:none;vertical-align:middle" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg> DM</button>';
    }
  }
  html+='</div>';
  // Channel tabs (not shown in DM mode)
  if(!isDM){
    html+='<div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--card);flex-shrink:0">';
    html+='<button onclick="chatSwitchChannel(\'general\')" style="flex:1;padding:9px 0;font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;border:none;cursor:pointer;background:none;color:'+(chatMode==='general'?'var(--rescue)':'var(--muted)')+';border-bottom:2px solid '+(chatMode==='general'?'var(--rescue)':'transparent')+';transition:all .15s">TOUS</button>';
    if(!isSurvUser){
      html+='<button onclick="chatSwitchChannel(\'sauveteur\')" style="flex:1;padding:9px 0;font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;border:none;cursor:pointer;background:none;color:'+(chatMode==='sauveteur'?'var(--rescue)':'var(--muted)')+';border-bottom:2px solid '+(chatMode==='sauveteur'?'var(--rescue)':'transparent')+';transition:all .15s">SAUVETEURS</button>';
    }
    html+='</div>';
  }
  if(pinned){
    html+='<div class="chat-pinned"><span class="cp-icon"><svg style="width:14px;height:14px;stroke:var(--gold);stroke-width:2;fill:none;vertical-align:middle" viewBox="0 0 24 24"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z"/></svg></span><span class="cp-text"><strong>'+escapeHtml(pinned.authorName.split(' ')[0])+'</strong> : '+escapeHtml(pinned.text)+'</span>';
    if(isUserChef()) html+='<button class="cp-close" onclick="chatUnpin(\''+pinned.id+'\')" aria-label="Désépingler le message"><svg style="width:10px;height:10px;stroke:currentColor;stroke-width:2.5;fill:none" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
    html+='</div>';
  }
  html+='<div class="chat-messages" id="chatMsgArea"></div>';
  html+='<div id="chatNewBtn" style="display:none;text-align:center;padding:4px"><button class="chat-new-msg-btn" onclick="chatScrollBottom()">↓ Nouveaux messages</button></div>';
  html+='<div class="chat-input-wrap" style="position:relative">';
  html+='<div id="chatMentionDD" class="chat-mention-dd"></div>';
  var chatPlaceholder=isDM?'Message à '+escapeHtml(chatDmTarget.name.split(' ')[0])+'…':isSauv?'Message aux sauveteurs…':'Message à tous…';
  html+='<textarea class="chat-input" id="chatInput" placeholder="'+chatPlaceholder+'" rows="1" oninput="chatOnInput(this)" onkeydown="chatOnKeydown(event)"></textarea>';
  html+='<button class="chat-send" id="chatSendBtn" onclick="chatSend()" aria-label="Envoyer le message"><svg style="width:18px;height:18px;stroke:currentColor;stroke-width:2;fill:none" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>';
  html+='</div></div>';

  container.innerHTML=html;
  chatRenderMessages();

  var area=document.getElementById('chatMsgArea');
  if(area){
    area.addEventListener('scroll',function(){
      var atBottom=area.scrollHeight-area.scrollTop-area.clientHeight<60;
      chatIsAtBottom=atBottom;
      if(atBottom){
        chatNewMsgCount=0;
        var btn=document.getElementById('chatNewBtn');
        if(btn)btn.style.display='none';
      }
    });
  }
}

function chatRenderMessages(){
  var area=document.getElementById('chatMsgArea');
  if(!area)return;
  var cu=chatGetCurrentUser();
  if(!cu) return;
  if(!chatMessages.length){
    var emptyIcon=chatMode==='sauveteur'?'<svg style="width:32px;height:32px;stroke:var(--rescue);stroke-width:1.5;fill:none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>':'<svg style="width:32px;height:32px;stroke:var(--muted);stroke-width:1.5;fill:none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var emptyLabel=chatMode==='sauveteur'?'CANAL SAUVETEURS':'AUCUN MESSAGE';
    var emptySub=chatMode==='sauveteur'?'Premier message entre sauveteurs':'Soyez le premier à écrire';
    area.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--muted)"><div style="font-size:32px;margin-bottom:10px">'+emptyIcon+'</div><div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px">'+emptyLabel+'</div><div style="font-size:11px;margin-top:4px">'+emptySub+'</div></div>';
    return;
  }
  var html='';
  var lastAuthor=null, lastTime=0, lastDay='';
  chatMessages.forEach(function(msg){
    var isMine=msg.authorId===cu.id;
    var sameAuthor=msg.authorId===lastAuthor;
    var closeInTime=msg.timestamp-lastTime<120000;
    var grouped=sameAuthor&&closeInTime;
    var day=chatDayLabel(msg.timestamp);
    if(day!==lastDay){
      html+='<div class="chat-day-sep">'+day+'</div>';
      lastDay=day;
    }
    if(!grouped){
      if(lastAuthor!==null) html+='</div></div>';
      var color=chatColor(msg.authorId);
      html+='<div class="chat-group'+(isMine?' mine':'')+'">';
      html+='<div class="chat-avatar-chat" style="background:'+color+'">'+escapeHtml(chatInitials(msg.authorName))+'</div>';
      html+='<div class="chat-bubbles">';
      if(!isMine) html+='<div class="chat-author">'+escapeHtml(msg.authorName.split(' ')[0])+'</div>';
    }
    var processedText=chatProcessMentions(msg.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
    html+='<div class="chat-bubble'+(isMine?' mine':' other')+'" data-msgid="'+msg.id+'">';
    html+='<div class="chat-hover-actions">';
    html+='<button onclick="chatReact(\''+msg.id+'\',\'ok\')" title="OK">+1</button>';
    html+='<button onclick="chatReact(\''+msg.id+'\',\'oui\')" title="Oui">oui</button>';
    html+='<button onclick="chatReact(\''+msg.id+'\',\'non\')" title="Non">non</button>';
    if(isUserChef()&&!msg.pinned) html+='<button onclick="chatPin(\''+msg.id+'\')" title="Épingler"><svg style="width:14px;height:14px;stroke:var(--gold);stroke-width:2;fill:none" viewBox="0 0 24 24"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z"/></svg></button>';
    html+='</div>';
    html+=processedText;
    html+='<span class="cb-time">'+chatTimeAgo(msg.timestamp)+'</span>';
    html+='</div>';
    if(msg.reactions&&Object.keys(msg.reactions).length){
      html+='<div class="chat-reactions">';
      Object.entries(msg.reactions).forEach(function(entry){
        var emoji=entry[0], uids=entry[1];
        if(!uids||!uids.length)return;
        var active=uids.includes(cu.id);
        html+='<button class="chat-react-btn'+(active?' active':'')+'" onclick="chatReact(\''+msg.id+'\',\''+emoji+'\')">'+emoji+' <span class="cr-count">'+uids.length+'</span></button>';
      });
      html+='</div>';
    }
    lastAuthor=msg.authorId;
    lastTime=msg.timestamp;
  });
  if(lastAuthor!==null) html+='</div></div>';
  area.innerHTML=html;
  if(chatIsAtBottom){
    area.scrollTop=area.scrollHeight;
  } else {
    chatNewMsgCount++;
    var btn=document.getElementById('chatNewBtn');
    if(btn&&chatNewMsgCount>0) btn.style.display='block';
  }
}

function chatScrollBottom(){
  var area=document.getElementById('chatMsgArea');
  if(area){area.scrollTop=area.scrollHeight;chatIsAtBottom=true;}
  chatNewMsgCount=0;
  var btn=document.getElementById('chatNewBtn');
  if(btn)btn.style.display='none';
}

// ── Mention autocomplete ──
function chatOnInput(el){
  el.style.height='36px';
  el.style.height=Math.min(80,el.scrollHeight)+'px';
  var val=el.value;
  var cursor=el.selectionStart;
  var before=val.substring(0,cursor);
  var atMatch=before.match(/@(\w*)$/);
  var dd=document.getElementById('chatMentionDD');
  if(atMatch){
    chatMentionFilter=atMatch[1].toLowerCase();
    var people=PERSONNEL.filter(function(p){
      var fn=p.name.split(' ')[0].toLowerCase();
      return fn.startsWith(chatMentionFilter)||p.name.toLowerCase().includes(chatMentionFilter);
    }).slice(0,8);
    if(people.length){
      chatMentionIdx=0;
      var ddHtml='';
      people.forEach(function(p,i){
        var roleColor=p.type==='SAUVETEUR'?'var(--rescue)':'var(--blue)';
        ddHtml+='<div class="chat-mention-dd-item'+(i===0?' selected':'')+'" onclick="chatInsertMention(\''+escapeHtml(p.name.split(' ')[0])+'\')" data-idx="'+i+'"><div class="chat-avatar-chat" style="width:24px;height:24px;font-size:9px;background:'+chatColor(p.id)+'">'+escapeHtml(chatInitials(p.name))+'</div><span>'+escapeHtml(p.name)+'</span><span class="cmdi-role" style="color:'+roleColor+'">'+escapeHtml(p.role)+'</span></div>';
      });
      dd.innerHTML=ddHtml;
      dd.classList.add('visible');
      chatMentionDropdown=true;
    } else {
      dd.classList.remove('visible');
      chatMentionDropdown=false;
    }
  } else {
    if(dd) dd.classList.remove('visible');
    chatMentionDropdown=false;
  }
}

function chatInsertMention(firstName){
  var input=document.getElementById('chatInput');
  if(!input)return;
  var val=input.value;
  var cursor=input.selectionStart;
  var before=val.substring(0,cursor);
  var after=val.substring(cursor);
  var newBefore=before.replace(/@\w*$/,'@'+firstName+' ');
  input.value=newBefore+after;
  input.selectionStart=input.selectionEnd=newBefore.length;
  input.focus();
  chatMentionDropdown=false;
  var dd=document.getElementById('chatMentionDD');
  if(dd)dd.classList.remove('visible');
}

function chatOnKeydown(e){
  if(chatMentionDropdown){
    var dd=document.getElementById('chatMentionDD');
    var items=dd?dd.querySelectorAll('.chat-mention-dd-item'):[];
    if(e.key==='ArrowDown'){
      e.preventDefault();
      chatMentionIdx=Math.min(chatMentionIdx+1,items.length-1);
      items.forEach(function(it,i){it.classList.toggle('selected',i===chatMentionIdx);});
    } else if(e.key==='ArrowUp'){
      e.preventDefault();
      chatMentionIdx=Math.max(chatMentionIdx-1,0);
      items.forEach(function(it,i){it.classList.toggle('selected',i===chatMentionIdx);});
    } else if(e.key==='Enter'||e.key==='Tab'){
      e.preventDefault();
      if(items[chatMentionIdx]) items[chatMentionIdx].click();
      return;
    } else if(e.key==='Escape'){
      e.preventDefault();
      chatMentionDropdown=false;
      if(dd) dd.classList.remove('visible');
      return;
    }
    return;
  }
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    chatSend();
  }
}

// ── DM list ──
function chatShowDMList(){
  chatStopListening();
  chatLastChannel=chatMode;
  chatMode='dm-list';
  chatRenderDMList();
}
function chatRenderDMList(){
  var container=document.getElementById('chatContainer');
  if(!container)return;
  var cu=chatGetCurrentUser();
  if(!cu) return;
  var people=PERSONNEL.slice().sort(function(a,b){return (a.name||'').localeCompare(b.name||'');});
  var html='<div class="chat-wrap"><div class="chat-header"><button onclick="chatBackToGeneral()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:2px 6px" aria-label="Retour au canal général">‹</button><div class="chat-header-title">MESSAGES PRIVÉS</div><div class="chat-header-sub">'+people.length+' membres</div></div>';
  html+='<div style="padding:8px 14px"><input type="text" class="chat-input" placeholder="Rechercher…" style="border-radius:10px;padding:8px 12px" oninput="chatFilterDM(this.value)"></div>';
  html+='<div class="chat-dm-list" id="chatDMList">';
  people.forEach(function(p){
    if(p.id===cu.id)return;
    var color=chatColor(p.id);
    var roleColor=p.type==='SAUVETEUR'?'var(--rescue)':'var(--blue)';
    var unread=chatGetDmUnread(p.id);
    html+='<div class="chat-dm-item" onclick="chatOpenDM(\''+p.id+'\',\''+p.name.replace(/'/g,"\\'")+'\')" data-name="'+p.name.toLowerCase()+'"><div class="chat-avatar-chat" style="width:28px;height:28px;font-size:10px;background:'+color+'">'+escapeHtml(chatInitials(p.name))+'</div><div class="dmi-name">'+escapeHtml(p.name)+' <span style="font-family:Oswald,sans-serif;font-size:9px;letter-spacing:1px;color:'+roleColor+';margin-left:4px">'+(p.type==='SAUVETEUR'?'SAUV':'SURV')+'</span></div>'+(unread>0?'<div class="dmi-badge"></div>':'')+'</div>';
  });
  html+='</div></div>';
  container.innerHTML=html;
}
function chatFilterDM(val){
  var items=document.querySelectorAll('#chatDMList .chat-dm-item');
  var q=val.toLowerCase();
  items.forEach(function(it){
    it.style.display=it.dataset.name.includes(q)?'':'none';
  });
}

// ── Chat FAB (floating bubble on accueil) ──
var chatFabToastTimer=null;
var chatLastNotifiedId='';

function renderChatFab(){
  if(state.step===17||!state.loggedIn) return '';
  if(!chatMessages) return ''; // not yet initialized
  var cu=chatGetCurrentUser();
  if(!cu) return '';
  var unread=chatUnreadCount||0;
  var lastMsg=chatMessages.length?chatMessages[chatMessages.length-1]:null;
  var showToastPreview=lastMsg&&lastMsg.id!==chatLastNotifiedId&&lastMsg.authorId!==cu.id&&unread>0;

  var html='<div class="chat-fab" onclick="window._chatPrevStep=state.step;setState({step:17})">';
  html+='<button class="chat-fab-btn"><svg style="width:18px;height:18px;stroke:currentColor;stroke-width:2;fill:none;vertical-align:middle" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>';
  if(unread>0) html+='<div class="chat-fab-badge">'+unread+'</div>';
  if(showToastPreview){
    html+='<div class="chat-fab-toast" id="chatFabToast">';
    html+='<div class="chat-fab-toast-name">'+lastMsg.authorName.split(' ')[0]+'</div>';
    html+='<div class="chat-fab-toast-text">'+lastMsg.text.substring(0,60)+(lastMsg.text.length>60?'…':'')+'</div>';
    html+='<div class="chat-fab-toast-time">'+chatTimeAgo(lastMsg.timestamp)+'</div>';
    html+='</div>';
    chatLastNotifiedId=lastMsg.id;
    // Auto-dismiss toast after 4s
    clearTimeout(chatFabToastTimer);
    chatFabToastTimer=setTimeout(function(){
      var t=document.getElementById('chatFabToast');
      if(t) t.style.display='none';
    },4000);
  }
  html+='</div>';
  return html;
}

// Start background listener for chat even when not on chat page
function chatStartBackgroundListener(){
  var cu=chatGetCurrentUser();
  if(!cu) return;
  if(chatListener) return; // already listening
  if(!firebaseDB){
    // localStorage fallback — load messages and update FAB
    chatLoadLocal();
    var lastRead=parseInt(localStorage.getItem(CHAT_LS_READ)||'0');
    chatUnreadCount=chatMessages.filter(function(m){return m.timestamp>lastRead&&m.authorId!==cu.id;}).length;
    updateChatFab();
    return;
  }
  var bgRef=firebaseDB.ref('messages').orderByChild('timestamp').limitToLast(50);
  chatListener=bgRef.on('value',function(snap){
    var data=snap.val()||{};
    var bgMessages=Object.values(data).sort(function(a,b){return a.timestamp-b.timestamp;});
    if(state.step!==17){
      // Only update chatMessages when NOT on chat page (chat page manages its own listener)
      chatMessages=bgMessages;
      var lastRead=parseInt(localStorage.getItem(CHAT_LS_READ)||'0');
      chatUnreadCount=bgMessages.filter(function(m){return m.timestamp>lastRead&&m.authorId!==cu.id;}).length;
      updateChatFab();
    } else if(chatMode==='general'){
      // On chat page in general mode — update messages
      chatMessages=bgMessages;
      chatRenderMessages();
    }
    // If on chat page in DM or sauveteur mode, don't overwrite chatMessages
  });
}

function updateChatFab(){
  var existing=document.getElementById('chatFabWrap');
  if(existing) existing.innerHTML=renderChatFab();
}
