// Clean rebuilt frontend logic
// Features: auth, issue CRUD, filters, multi-vehicle selection, comments, modals

// --- Helpers ---
const $ = id => document.getElementById(id);
const q = sel => document.querySelector(sel);
const qa = sel => Array.from(document.querySelectorAll(sel));

async function jfetch(url, opts){
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error(await r.text());
  const ct = r.headers.get('content-type')||'';
  return ct.includes('application/json') ? r.json() : r.text();
}

function esc(str=''){ return str.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function fmt(str=''){ return esc(str).replace(/\n/g,'<br/>'); }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

// --- Elements ---
const issueForm = $('issue-form');
const issuesDiv = $('issues');
const filterBrand = $('filter-brand');
const filterModel = $('filter-model');
const filterIssueType = $('filter-issue-type');
const searchInput = $('search');
const refreshBtn = $('refresh');
const brandSelect = $('brand-select');
const modelSelect = $('model-select');
const issueTypeSelect = $('issue-type-select');
const issueTypeCustom = $('issue-type-custom');
// Hotspot (issue location) elements
const hotspotImg = $('hotspot-base');
const hotspotLayer = $('hotspot-layer');
const hotspotCategory = $('hotspot-category');
const hotspotHidden = $('issue-location');
let hotspotState = { currentView: '', views: {} }; // {currentView:string, views: {viewName: {points:[{x,y,category}]}}}

// Araç görünüm tanımları
const vehicleViews = {
  'exterior-front': {
    image: '/img/vehicle-exterior-front.jpg',
    name: 'Dış - Önü',
    categories: ['far', 'tampon-on', 'kaput', 'cam-on', 'plaka', 'izgara', 'logo']
  },
  'exterior-right': {
    image: '/img/vehicle-exterior-right.jpg', 
    name: 'Dış - Sağ',
    categories: ['kapi-surucu', 'kapi-yolcu-on', 'ayna-dis-sag', 'tekerlek-on-sag', 'tekerlek-arka-sag', 'cam-yan']
  },
  'exterior-left': {
    image: '/img/vehicle-exterior-left.jpg',
    name: 'Dış - Sol', 
    categories: ['kapi-yolcu', 'kapi-surucu-yan', 'ayna-dis-sol', 'tekerlek-on-sol', 'tekerlek-arka-sol', 'sarj-kapagi']
  },
  'exterior-rear': {
    image: '/img/vehicle-exterior-rear.jpg',
    name: 'Dış - Arka',
    categories: ['tampon-arka', 'bagaj-kapagi', 'stop-lambasi', 'plaka-arka', 'cam-arka']
  },
  'interior-front': {
    image: '/img/cabin-wireframe.jpg',
    name: 'İç - Ön Panel',
    categories: ['direksiyon', 'ekran', 'koltuk-surucu', 'koltuk-yolcu', 'pedallar', 'havalandirma', 'ayna-ic']
  },
  'interior-rear': {
    image: '/img/vehicle-interior-rear.jpg',
    name: 'İç - Arka Kısım', 
    categories: ['koltuk-arka-sol', 'koltuk-arka-sag', 'koltuk-arka-orta', 'cam-tavan', 'klima-arka', 'bagaj-ici']
  }
};
const myVehicleCombo = $('my-vehicle-combo');
const addVehicleForm = $('add-vehicle-form');
const addVehBrand = $('add-veh-brand');
const addVehModel = $('add-veh-model');
const addVehYear = $('add-veh-year');
const addVehKm = $('add-veh-km');
const myVehiclesList = $('my-vehicles-list');
const loginForm = $('login-form');
const registerForm = $('register-form');
const logoutBtn = $('logout-btn');
const currentUserSpan = $('current-user');
const openAuthBtn = $('open-auth');
const authPanel = $('auth-panel');
const authLoggedOut = $('auth-when-logged-out');
const authLoggedIn = $('auth-when-logged-in');
const tabs = qa('.tabs button');
const loginMsg = $('login-msg');
const registerMsg = $('register-msg');
const pwStrength = $('pw-strength');
const newIssueBtn = $('new-issue-btn');
const myIssuesBtn = $('my-issues-btn');
const profileModal = $('profile-modal');
const issueModal = $('issue-modal');
const profileAutoClose = $('profile-auto-close');
const issueAutoClose = $('issue-auto-close');
const profileForm = $('profile-form');
const userIssuesModal = $('user-issues-modal');
const userIssuesTitle = $('user-issues-title');
const userIssuesContent = $('user-issues-content');
// Similar issues modal: follow/unfollow event delegation
const similarModal = document.getElementById('similar-modal');
const similarContent = document.getElementById('similar-content');
similarContent?.addEventListener('click', async e=>{
  console.log("similarContent click", e.target);
  const btn = e.target.closest('.follow-btn');
  if(btn){
    if(!currentUser){ toast('Takip için giriş yapmalısınız','warn'); return; }
    const id = btn.dataset.id;
    if(!id) return;
    btn.disabled = true;
    toast('Takip isteği gönderiliyor','info');
    console.log('Takip isteği gönderiliyor', id);
    try {
      const res = await jfetch(`/api/issues/${id}/follow`, { method:'POST' });
      console.log('Takip isteği sonucu', res);
      // Takip durumunu tekrar kontrol et ve butonu güncelle
      try {
        const check = await jfetch(`/api/issues/${id}/follow`);
        if(check.followed){
          btn.textContent = 'Takipten Çık';
          btn.classList.add('following','unfollow-btn');
          btn.classList.remove('follow-btn');
        } else {
          btn.textContent = 'Takip Et';
          btn.classList.remove('following','unfollow-btn');
          btn.classList.add('follow-btn');
        }
      } catch{}
      toast('Takip edildi','success');
    } catch(err){
      console.error('Takip edilemedi', err);
      toast('Takip edilemedi','error');
    }
    finally { btn.disabled = false; }
  }
  const unf = e.target.closest('.unfollow-btn');
  if(unf){
    console.log("unfollow-btn clicked", unf);
    if(!currentUser){ toast('Takipten çıkmak için giriş yapmalısınız','warn'); return; }
    const id = unf.dataset.id;
    if(!id) return;
    unf.disabled = true;
    toast('Takipten çıkma isteği gönderiliyor','info');
    console.log('Takipten çıkma isteği gönderiliyor', id);
    try {
      const res = await jfetch(`/api/issues/${id}/follow`, { method:'DELETE' });
      console.log('Takipten çıkma sonucu', res);
      // Takip durumunu tekrar kontrol et ve butonu güncelle
      try {
        const check = await jfetch(`/api/issues/${id}/follow`);
        if(check.followed){
          unf.textContent = 'Takipten Çık';
          unf.classList.add('following','unfollow-btn');
          unf.classList.remove('follow-btn');
        } else {
          unf.textContent = 'Takip Et';
          unf.classList.remove('following','unfollow-btn');
          unf.classList.add('follow-btn');
        }
      } catch{}
      toast('Takipten çıkıldı','success');
    } catch(err){
      console.error('Takipten çıkılamadı', err);
      toast('Takipten çıkılamadı','error');
    }
    finally { unf.disabled = false; }
  }
});
// Pagination elements
const pagePrev = $('page-prev');
const pageNext = $('page-next');
const pageInfo = $('page-info');
const pageSizeSel = $('page-size');
const brandLogoFilterDiv = $('brand-logo-filter');
const fabNewIssue = $('fab-new-issue');
const scrollSentinel = $('scroll-sentinel');
const toggleFiltersBtn = $('toggle-filters');
const filtersWrap = $('filters-wrap');
// Notifications UI elements
const notifBell = document.getElementById('notif-bell');
const notifCount = document.getElementById('notif-count');
const notifPanel = document.getElementById('notif-panel');
const notifList = document.getElementById('notif-list');
const notifMarkAll = document.getElementById('notif-markall');

let notifPollTimer = null;
async function renderNotifications(items){
  if(!notifList) return;
  
  // Eksik problem başlıklarını çek
  const issueIds = [...new Set(items.map(n => n.issue_id))];
  const issueTitles = {};
  
  try {
    for(const issueId of issueIds) {
      const issue = await jfetch(`/api/issues/${issueId}`);
      issueTitles[issueId] = issue.title;
    }
  } catch(e) {
    console.warn('Problem başlıkları alınamadı:', e);
  }
  
  notifList.innerHTML = items.map(n=>{
    const payload = (()=>{ try{ return n.payload ? JSON.parse(n.payload):{}; }catch{ return {}; } })();
    console.log('Notification payload:', payload); // Debug için
    let title = 'Bildirim';
    let detail = '';
    
    // Problem başlığını payload'dan veya API'den al
    const issueTitle = payload.issue_title || issueTitles[n.issue_id] || `Problem #${n.issue_id}`;
    
    if(n.type==='comment') {
      const content = payload.content ? payload.content.slice(0, 50) + (payload.content.length > 50 ? '...' : '') : '';
      title = `Yorum: "${content}"`;
      detail = `@${payload.by || 'Kullanıcı'} • ${issueTitle}`;
    }
    else if(n.type==='update') {
      if(payload.title) {
        title = `Gelişme: "${payload.title}"`;
      } else if(payload.content) {
        const content = payload.content.slice(0, 60) + (payload.content.length > 60 ? '...' : '');
        title = `Gelişme: "${content}"`;
      } else {
        title = 'Yeni gelişme eklendi';
      }
      detail = `@${payload.by || 'Kullanıcı'} • ${issueTitle}`;
    }
    else if(n.type==='media') {
      title = `Medya eklendi (${payload.count || 1} dosya)`;
      detail = `@${payload.by || 'Kullanıcı'} • ${issueTitle}`;
    }
    else if(n.type==='status') {
      title = `Durum değişti → ${payload.to}`;
      detail = `@${payload.by || 'Kullanıcı'} • ${issueTitle}`;
    }
    else if(n.type==='update_edit') {
      title = 'Gelişme düzenlendi';
      detail = `@${payload.by || 'Kullanıcı'} • ${issueTitle}`;
    }
    else if(n.type==='update_delete') {
      title = 'Gelişme silindi';
      detail = `@${payload.by || 'Kullanıcı'} • ${issueTitle}`;
    }
    
    return `<div class="notif-item ${n.read_at? '':'unread'}" data-issue-id="${n.issue_id}">
      <div>
        <div class="title">${esc(title)}</div>
        <div class="meta">${esc(detail)}</div>
        <div class="time">${new Date(n.created_at).toLocaleString('tr-TR')}</div>
      </div>
      <button class="btn btn-link notif-goto" data-issue-id="${n.issue_id}">Git</button>
    </div>`;
  }).join('');
}
async function fetchUnreadNotifications(){
  try {
    const rows = await jfetch('/api/me/notifications?unread=1');
    const cnt = rows.length;
    if(notifCount){ if(cnt>0){ notifCount.textContent=String(cnt); notifCount.hidden=false; } else { notifCount.hidden=true; } }
    if(notifPanel && !notifPanel.hidden){
      const allRows = await jfetch('/api/me/notifications');
      await renderNotifications(allRows);
    }
  } catch{}
}
function startNotifPolling(){
  if(notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(fetchUnreadNotifications, 20000);
  fetchUnreadNotifications();
}
notifBell?.addEventListener('click', async ()=>{
  if(!notifPanel) return;
  const isOpen = !notifPanel.hidden;
  if(isOpen){ notifPanel.hidden = true; }
  else {
    try { const rows = await jfetch('/api/me/notifications'); await renderNotifications(rows); } catch{}
    notifPanel.hidden = false;
  }
});

// Bildirim "Git" butonuna tıklayınca probleme git
notifList?.addEventListener('click', e => {
  const gotoBtn = e.target.closest('.notif-goto');
  if(gotoBtn) {
    const issueId = gotoBtn.dataset.issueId;
    if(issueId) {
      // Paneli kapat
      notifPanel.hidden = true;
      // Problemi bul ve scroll yap
      const card = document.querySelector(`.issue[data-id='${issueId}']`);
      if(card) {
        card.scrollIntoView({behavior: 'smooth', block: 'start'});
        card.classList.add('highlight');
        setTimeout(() => card.classList.remove('highlight'), 1600);
      } else {
        // Problem listede yoksa filtreleri temizle ve yeniden yükle
        filterBrand.value = '';
        filterModel.value = '';
        filterIssueType.value = '';
        searchInput.value = '';
        showMine = false;
        myIssuesBtn.classList.remove('active');
        fillFilterModels();
        pagination.page = 1;
        loadIssues().then(() => {
          // Yeniden yüklendikten sonra tekrar dene
          setTimeout(() => {
            const card = document.querySelector(`.issue[data-id='${issueId}']`);
            if(card) {
              card.scrollIntoView({behavior: 'smooth', block: 'start'});
              card.classList.add('highlight');
              setTimeout(() => card.classList.remove('highlight'), 1600);
            } else {
              toast('Problem bulunamadı', 'warn');
            }
          }, 500);
        });
      }
    }
  }
});

notifMarkAll?.addEventListener('click', async ()=>{
  try { await jfetch('/api/me/notifications/read', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) }); fetchUnreadNotifications(); } catch{}
});
// Dynamic update modal (created if not present)
let updateModal = document.getElementById('update-modal');
        if(!updateModal){
          updateModal = document.createElement('div');
          updateModal.id='update-modal';
          // Match existing pattern: outer overlay container
          updateModal.className='modal-overlay hidden';
          updateModal.setAttribute('aria-hidden','true');
          updateModal.innerHTML=`<div class="modal">\n    <button class="close" data-close="update-modal">×</button>\n    <h2>Gelişme Ekle</h2>\n    <form id="update-form" class="update-form" autocomplete="off">\n      <textarea id="update-content" placeholder="Gelişme açıklamasını yazın" required maxlength="4000" style="min-height:260px;"></textarea>\n      <div class="update-drop" id="update-drop">\n        <div class="u-dz-text">Medya sürükleyip bırakın veya tıklayın (max 5)</div>\n        <input type="file" id="update-files" hidden multiple accept="image/*,audio/*,video/*"/>\n      </div>\n      <div id="update-file-preview" class="u-preview"></div>\n      <div class="actions-row">\n        <button type="submit">Kaydet</button>\n        <button type="button" data-close="update-modal" class="secondary">İptal</button>\n      </div>\n    </form>\n  </div>`;
          document.body.appendChild(updateModal);
        }
let updateTargetIssueId = null;

// Update modal media handling
const updDz = ()=>document.getElementById('update-drop');
const updInput = ()=>document.getElementById('update-files');
const updPreview = ()=>document.getElementById('update-file-preview');
function updateUpdPreview(){ const pv=updPreview(); const inp=updInput(); if(!pv||!inp) return; pv.innerHTML=''; Array.from(inp.files).forEach((f,i)=>{ const kind=f.type.startsWith('image/')?'image':f.type.startsWith('audio/')?'audio':f.type.startsWith('video/')?'video':'other'; const div=document.createElement('div'); div.className='u-chip kind-'+kind; div.innerHTML=`<span class="rm" data-i="${i}">×</span><span class="nm" title="${esc(f.name)}">${esc(f.name)}</span>`; pv.appendChild(div); }); }
function updReplace(list){ const dt=new DataTransfer(); list.forEach(f=> dt.items.add(f)); updInput().files=dt.files; updateUpdPreview(); }
function updAddFiles(fs){ const inp=updInput(); let cur=Array.from(inp.files); for(const f of fs){ if(cur.length>=5){ toast('En fazla 5 dosya','warn'); break; } if(f.size>15*1024*1024){ toast('Çok büyük: '+f.name,'warn'); continue; } const ok= /^(image|audio|video)\//.test(f.type); if(!ok){ toast('Tür desteklenmiyor: '+f.name,'warn'); continue; } cur.push(f); } updReplace(cur); }
updDz()?.addEventListener('click', e=>{ if(e.target===updDz() || e.target.classList.contains('u-dz-text')) updInput().click(); });
updDz()?.addEventListener('dragover', e=>{ e.preventDefault(); updDz().classList.add('drag'); });
updDz()?.addEventListener('dragleave', e=>{ if(e.relatedTarget && updDz().contains(e.relatedTarget)) return; updDz().classList.remove('drag'); });
updDz()?.addEventListener('drop', e=>{ e.preventDefault(); updDz().classList.remove('drag'); updAddFiles(e.dataTransfer.files); });
updInput()?.addEventListener('change', ()=> updateUpdPreview());
updPreview()?.addEventListener('click', e=>{ const rm=e.target.closest('.rm'); if(!rm) return; const i=parseInt(rm.dataset.i,10); let cur=Array.from(updInput().files); cur.splice(i,1); updReplace(cur); });

// Submit update form
document.addEventListener('submit', async e=>{
  if(e.target && e.target.id==='update-form'){
    e.preventDefault(); if(!updateTargetIssueId) return; const txt = document.getElementById('update-content').value.trim(); if(!txt){ toast('Metin gerekli','warn'); return; }
  const fdata=new FormData(); fdata.append('content', txt); const inp=updInput(); Array.from(inp.files).slice(0,5).forEach(f=> fdata.append('attachments', f));
    e.target.querySelector('button[type=submit]').disabled=true;
    try { const res = await fetch(`/api/issues/${updateTargetIssueId}/updates`,{ method:'POST', body:fdata }); if(!res.ok){ throw new Error(await res.text()); }
      const json = await res.json(); toast('Gelişme eklendi','success'); closeModal(updateModal); document.getElementById('update-content').value=''; updReplace([]); // refresh issue card
      const detail = await jfetch('/api/issues/'+updateTargetIssueId); updateIssueCard(detail);
    } catch(err){ toast('Hata: '+err.message,'error'); }
    finally { e.target.querySelector('button[type=submit]').disabled=false; }
  }
});

// Fetch and toggle update list inside issue card
async function toggleUpdatesList(card, issueId){
  let wrap = card.querySelector('.updates-wrap');
  if(!wrap){ wrap=document.createElement('div'); wrap.className='updates-wrap hidden'; card.insertBefore(wrap, card.querySelector('.desc')); }
  const badge = card.querySelector('.update-badge');
  const open = wrap.classList.contains('hidden');
  if(!open){ wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden'); wrap.innerHTML='<div class="empty">Yükleniyor...</div>';
  try { const list = await jfetch(`/api/issues/${issueId}/updates`); if(!list.length){ wrap.innerHTML='<div class="empty">Gelişme yok</div>'; return; }
    wrap.innerHTML = '<div class="updates-timeline">'+ list.map(u=>{
  const atts = (u.attachments||[]).map(a=>{
        if(a.kind==='image') return `<figure class='u-att image'><img loading='lazy' src='${esc(a.url)}' alt='${esc(a.original_name||'görsel')}'/></figure>`;
        if(a.kind==='audio') return `<figure class='u-att audio'><audio controls preload='none' src='${esc(a.url)}'></audio></figure>`;
        if(a.kind==='video') return `<figure class='u-att video'><video controls preload='metadata' src='${esc(a.url)}'></video></figure>`;
        return `<figure class='u-att other'><a target='_blank' rel='noopener' href='${esc(a.url)}'>${esc(a.original_name||'Dosya')}</a></figure>`;
      }).join('');
      const ownerActions = currentUser && card.getAttribute('data-owner')==='1' ? `<div class='u-actions'><button class='u-edit' data-update='${u.id}'>Düzenle</button><button class='u-del' data-update='${u.id}' style='background:#5f1d2d'>Sil</button></div>`:'';
  return `<div class='u-item' data-update-id='${u.id}'><div class='u-meta'><span class='u-user'>@${esc(u.username)}</span> • <span class='u-time'>${new Date(u.created_at).toLocaleString()}</span></div><div class='u-content'>${fmt(u.content)}</div>${atts?`<div class='u-atts'>${atts}</div>`:''}${ownerActions}</div>`;
    }).join('') + '</div>';
  } catch(err){ wrap.innerHTML='<div class="empty">Alınamadı</div>'; }
}

// --- State ---
let currentUser = null;
let userVehicles = [];
let showMine = false;
let brandModelList = [];
let issueTypes = [];
let pagination = { page:1, pageSize: parseInt(pageSizeSel?.value||'20',10), total:0 };
let infiniteLoading = false;
let infiniteDone = false;
const userIssuesCache = new Map(); // username -> issues array
let logoObserver;
// offline banner removed
// Status display mapping (backend values kept as 'open' | 'resolved')
function statusLabel(s){ return s==='open'?'Açık': (s==='resolved'?'Çözüldü': s); }
// Logo URL map left empty intentionally (we use local placeholder SVGs to avoid trademark assets hotlinking)
const brandLogoUrls = {};

// --- Toast Helper ---
function toast(msg, type='info', opts={}){
  let box = document.getElementById('toast-container');
  if(!box){ box=document.createElement('div'); box.id='toast-container'; box.className='toast-container'; document.body.appendChild(box); }
  const id='t_'+Date.now()+Math.random().toString(16).slice(2);
  const div=document.createElement('div');
  div.className='toast '+(type==='error'?'err':type==='success'?'ok':type==='warn'?'warn':'');
  div.setAttribute('role','alert');
  div.innerHTML=`<div class="t-msg">${esc(msg)}</div><button class="t-close" aria-label="Kapat">×</button>`;
  box.appendChild(div);
  const ttl = opts.ttl ?? (type==='error'?6000:4000);
  let closing=false;
  function close(){ if(closing) return; closing=true; div.style.animation='toastOut .35s ease forwards'; setTimeout(()=>div.remove(),350); }
  div.querySelector('.t-close').addEventListener('click', close);
  if(ttl>0) setTimeout(close, ttl);
  return { close, el:div };
}

// --- Auth/UI ---
async function refreshMe(){ try{ currentUser=(await jfetch('/api/auth/me')).user; }catch{ currentUser=null; } updateAuthUI(); if(currentUser) await loadMyVehicles(); fillVehicleCombo(); }
function updateAuthUI(){
  if(currentUser){
    authLoggedOut.classList.add('hidden');
    authLoggedIn.classList.remove('hidden');
    currentUserSpan.textContent='@'+currentUser.username;
    newIssueBtn.style.display='inline-block';
  const bulkBtn = document.getElementById('bulk-delete-my-issues'); if(bulkBtn) bulkBtn.style.display='inline-block';
    // start notifications polling when logged in
    startNotifPolling();
  } else {
    authLoggedOut.classList.remove('hidden');
    authLoggedIn.classList.add('hidden');
    newIssueBtn.style.display='none';
    showMine=false; myIssuesBtn.classList.remove('active');
  const bulkBtn = document.getElementById('bulk-delete-my-issues'); if(bulkBtn) bulkBtn.style.display='none';
    // Clear & re-enable auth forms for new login
    if(loginForm){ loginForm.reset(); loginForm.querySelectorAll('input,button').forEach(el=> el.disabled=false); }
    if(registerForm){ registerForm.reset(); registerForm.querySelectorAll('input,button').forEach(el=> el.disabled=false); }
    // stop polling when logged out
    if(notifPollTimer){ clearInterval(notifPollTimer); notifPollTimer=null; }
  }
}
openAuthBtn?.addEventListener('click', ()=> authPanel.classList.toggle('hidden'));

document.addEventListener('click', e=>{ if(!authPanel.classList.contains('hidden') && !authPanel.contains(e.target) && e.target!==openAuthBtn) authPanel.classList.add('hidden'); });

tabs.forEach(b=> b.addEventListener('click', ()=>{ tabs.forEach(x=>x.classList.remove('active')); b.classList.add('active'); if(b.dataset.tab==='login'){ loginForm.classList.remove('hidden'); registerForm.classList.add('hidden'); } else { loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); }}));

registerForm?.password?.addEventListener('input', ()=>{ const v=registerForm.password.value; let s=0; if(v.length>=8)s++; if(/[A-Z]/.test(v))s++; if(/[0-9]/.test(v))s++; if(/[^A-Za-z0-9]/.test(v))s++; pwStrength.textContent='Şifre Gücü: '+['Zayıf','Orta','İyi','Güçlü'][Math.min(s,3)]; });

loginForm?.addEventListener('submit', async e=>{ e.preventDefault(); loginMsg.textContent=''; const fd=Object.fromEntries(new FormData(loginForm)); try{ await jfetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fd)}); authPanel.classList.add('hidden'); loginForm.reset(); await refreshMe(); loadIssues(); }catch{ loginMsg.textContent='Hatalı kullanıcı veya şifre'; }});

registerForm?.addEventListener('submit', async e=>{ e.preventDefault(); registerMsg.textContent=''; const fd=Object.fromEntries(new FormData(registerForm)); if(fd.password!==fd.password2){ registerMsg.textContent='Şifreler uyuşmuyor'; return;} try{ await jfetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fd.username,password:fd.password})}); registerForm.reset(); authPanel.classList.add('hidden'); await refreshMe(); openModal(profileModal); }catch{ registerMsg.textContent='Kayıt başarısız'; }});

logoutBtn?.addEventListener('click', async ()=>{ try{ await jfetch('/api/auth/logout',{method:'POST'});}catch{} currentUser=null; updateAuthUI(); loadIssues(); });

currentUserSpan?.addEventListener('click', ()=>{ if(currentUser) openModal(profileModal); });
newIssueBtn?.addEventListener('click', ()=>{ if(!currentUser){ toast('Giriş yapın','warn'); return;} openModal(issueModal); });
myIssuesBtn?.addEventListener('click', ()=>{ if(!currentUser){ toast('Giriş yapın','warn'); return;} showMine=!showMine; myIssuesBtn.classList.toggle('active',showMine); loadIssues(); });
profileForm?.addEventListener('submit', e=> e.preventDefault()); // no-op retained

// --- Brand/Model & Issue Types ---
async function loadBrandModels(){ brandModelList = await jfetch('/api/brand-models'); renderBrandModelSelectors(); }
function renderBrandModelSelectors(){
  brandSelect.innerHTML='<option value="" disabled selected>Seçiniz</option>' + brandModelList.map(b=>`<option value="${b.brand}">${b.brand}</option>`).join('') + '<option value="__custom">(Listede yok)</option>';
  filterBrand.innerHTML='<option value="">Marka</option>' + brandModelList.map(b=>`<option value="${b.brand}">${b.brand}</option>`).join('');
  addVehBrand.innerHTML='<option value="" disabled selected>Marka</option>' + brandModelList.map(b=>`<option value="${b.brand}">${b.brand}</option>`).join('');
  fillModelSelect();
  renderBrandLogoQuickFilter();
}
function fillModelSelect(){
  const brand=brandSelect.value; const entry=brandModelList.find(b=>b.brand===brand);
  const models=entry?entry.models:[];
  modelSelect.innerHTML='<option value="" disabled selected>Seçiniz</option>' + models.map(m=>`<option value="${m}">${m}</option>`).join('') + '<option value="__custom">(Listede yok)</option>';
}
function fillFilterModels(){ const brand=filterBrand.value; const entry=brandModelList.find(b=>b.brand===brand); const models=entry?entry.models:[]; filterModel.innerHTML='<option value="">Model</option>'+models.map(m=>`<option value="${m}">${m}</option>`).join(''); }
function fillAddVehModels(){ const brand=addVehBrand.value; const entry=brandModelList.find(b=>b.brand===brand); const models=entry?entry.models:[]; addVehModel.innerHTML='<option value="" disabled selected>Model</option>'+models.map(m=>`<option value="${m}">${m}</option>`).join(''); }

function renderBrandLogoQuickFilter(){
  if(!brandLogoFilterDiv) return;
  const topBrands = brandModelList.slice(0,12); // first 12
  brandLogoFilterDiv.innerHTML = topBrands.map(b=>{
    const slug=b.brand.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const initial=esc(b.brand[0]);
    const logoPath = `/img/brands/${slug}.svg`;
    return `<button class="brand-chip" data-brand="${esc(b.brand)}" title="${esc(b.brand)}"><span class="ic"><img src="${logoPath}" alt="${esc(b.brand)}" onerror="this.closest('span').classList.add('no-img');this.remove();"/></span><span class="lbl">${esc(b.brand)}</span></button>`;
  }).join('');
}

brandLogoFilterDiv?.addEventListener('click', e=>{
  const btn=e.target.closest('.brand-chip'); if(!btn) return;
  const brand=btn.getAttribute('data-brand');
  // toggle selection
  const active = btn.classList.contains('active');
  qa('.brand-chip.active').forEach(b=> b.classList.remove('active'));
  if(!active){ btn.classList.add('active'); filterBrand.value=brand; }
  else { filterBrand.value=''; }
  fillFilterModels(); pagination.page=1; loadIssues();
});

brandSelect?.addEventListener('change', ()=>{ if(brandSelect.value==='__custom'){ const b=prompt('Marka girin:'); if(b){ const opt=document.createElement('option'); opt.value=b; opt.textContent=b; brandSelect.appendChild(opt); brandSelect.value=b; } else { brandSelect.value=''; } } fillModelSelect(); myVehicleCombo.value=''; });
modelSelect?.addEventListener('change', ()=>{ if(modelSelect.value==='__custom'){ const m=prompt('Model girin:'); if(m){ const opt=document.createElement('option'); opt.value=m; opt.textContent=m; modelSelect.appendChild(opt); modelSelect.value=m; } else { modelSelect.value=''; } }});
filterBrand?.addEventListener('change', ()=>{ fillFilterModels(); loadIssues(); });
addVehBrand?.addEventListener('change', fillAddVehModels);

async function loadIssueTypes(){ issueTypes = await jfetch('/api/issue-types'); issueTypeSelect.innerHTML='<option value="" selected>Seçiniz</option>'+issueTypes.map(t=>`<option value="${t}">${t}</option>`).join('')+'<option value="__custom">(Listede yok)</option>'; filterIssueType.innerHTML='<option value="">Arıza Türü</option>'+issueTypes.map(t=>`<option value="${t}">${t}</option>`).join(''); }
issueTypeSelect?.addEventListener('change', ()=>{ if(issueTypeSelect.value==='__custom') issueTypeCustom.focus(); });

// --- Vehicles ---
async function loadMyVehicles(){ if(!currentUser){ userVehicles=[]; myVehiclesList.innerHTML=''; return;} try{ userVehicles = await jfetch('/api/my/vehicles'); }catch{ userVehicles=[]; }
  if(!userVehicles.length){ myVehiclesList.innerHTML='<span class="empty">Araç yok</span>'; } else { myVehiclesList.innerHTML=userVehicles.map(v=>{
    let text = `${esc(v.brand)} / ${esc(v.model)}`;
    if(v.model_year || v.km) {
      const details = [];
      if(v.model_year) details.push(v.model_year);
      if(v.km) details.push(v.km + ' km');
      text += ` (${details.join(', ')})`;
    }
    return `<div class="veh-item" data-id="${v.id}"><div class="meta"><span>${text}</span></div><div class="actions"><button class="del" style="background:#5f1d2d">Sil</button></div></div>`;
  }).join(''); }
  fillVehicleCombo();
}
function fillVehicleCombo(){ if(!myVehicleCombo) return; myVehicleCombo.innerHTML='<option value="">(Seç veya manuel gir)</option>' + userVehicles.map(v=>{
  let text = `${esc(v.brand)} / ${esc(v.model)}`;
  if(v.model_year || v.km) {
    const details = [];
    if(v.model_year) details.push(v.model_year);
    if(v.km) details.push(v.km + ' km');
    text += ` (${details.join(', ')})`;
  }
  return `<option value="${v.id}" data-brand="${esc(v.brand)}" data-model="${esc(v.model)}">${text}</option>`;
}).join(''); }

addVehicleForm?.addEventListener('submit', async e=>{ e.preventDefault(); const body={ brand:addVehBrand.value, model:addVehModel.value }; if(addVehYear.value) body.model_year = parseInt(addVehYear.value); if(addVehKm.value) body.km = parseInt(addVehKm.value); if(!body.brand||!body.model) return; try{ await jfetch('/api/my/vehicles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); addVehicleForm.reset(); await loadMyVehicles(); toast('Araç eklendi','success'); setTimeout(()=>closeModal(profileModal),200); }catch{ toast('Araç eklenemedi','error'); }});

myVehiclesList?.addEventListener('click', async e=>{ const item=e.target.closest('.veh-item'); if(!item) return; const id=item.dataset.id; if(e.target.classList.contains('del')){ if(!confirm('Silinsin mi?')) return; try{ await jfetch('/api/my/vehicles/'+id,{method:'DELETE'});}catch{} loadMyVehicles(); }});

myVehicleCombo?.addEventListener('change', ()=>{ const opt=myVehicleCombo.selectedOptions[0]; if(!opt||!opt.dataset.brand) return; brandSelect.value=opt.dataset.brand; brandSelect.dispatchEvent(new Event('change')); setTimeout(()=>{ modelSelect.value=opt.dataset.model; },0); });

// --- Issues ---
async function loadIssues(){
  // skeletons for first page only
  if(pagination.page===1){ issuesDiv.innerHTML = '<div class="skeleton-list">'+Array.from({length:6}).map(()=>'<div class="issue skeleton"><div class="sk-line w40"></div><div class="sk-line w70"></div><div class="sk-line w55"></div></div>').join('')+'</div>'; }
  const params = new URLSearchParams();
  if(filterBrand.value) params.append('brand',filterBrand.value);
  if(filterModel.value) params.append('model',filterModel.value);
  if(filterIssueType.value) params.append('issue_type',filterIssueType.value);
  const qv=searchInput.value.trim(); if(qv) params.append('q',qv);
  if(showMine && currentUser) params.append('user', currentUser.username);
  params.append('page', pagination.page);
  params.append('pageSize', pagination.pageSize);
  let raw;
  try{ raw = await jfetch('/api/issues?'+params.toString()); }catch(err){ console.error('Issues load error', err); raw = []; }
  // API eski biçim (dizi) veya yeni biçim (obj) olabilir
  let items = [];
  if(Array.isArray(raw)){
    items = raw;
    pagination.total = raw.length; // tahmini
    pagination.page = 1;
  } else if(raw && typeof raw === 'object') {
    items = Array.isArray(raw.items)? raw.items : [];
    pagination.total = raw.total??items.length;
    pagination.page = raw.page??pagination.page;
    pagination.pageSize = raw.pageSize??pagination.pageSize;
  }
  if(pagination.page===1){
    if(!items.length){ issuesDiv.innerHTML='<p class="empty">Kayıt yok</p>'; }
    else { issuesDiv.innerHTML = items.map(issueCardHTML).join(''); }
  } else {
    if(!items.length){ infiniteDone = true; }
    else { issuesDiv.insertAdjacentHTML('beforeend', items.map(issueCardHTML).join('')); }
  }
  updatePaginationUI();
  infiniteLoading = false;
  // Re-attach lazy observer for any new logos (guard if function missing)
  if(document.querySelector('img.brand-logo[data-src]') && typeof setupLogoObserver === 'function'){
    setupLogoObserver();
  }
}

function updatePaginationUI(){
  if(!pageInfo) return;
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  if(pagination.page>totalPages){ pagination.page = totalPages; }
  pageInfo.textContent = `Sayfa ${pagination.page} / ${totalPages} (${pagination.total} kayıt)`;
  pagePrev.disabled = pagination.page<=1;
  pageNext.disabled = pagination.page>=totalPages;
  pageSizeSel.value = String(pagination.pageSize);
}

// Infinite scroll observer
if(scrollSentinel){
  const obs = new IntersectionObserver(entries=>{
    const first = entries[0];
    if(first.isIntersecting && !infiniteLoading && !infiniteDone){
      const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
      if(pagination.page < totalPages){
        infiniteLoading = true;
        pagination.page++;
        loadIssues();
      }
    }
  }, { rootMargin: '200px 0px 400px 0px' });
  obs.observe(scrollSentinel);
}

function issueCardHTML(it){
  const owner = currentUser && currentUser.username===it.username;
  const ownerBtns = owner ? `<button class="add-update">Gelişme Ekle</button><button class="add-solution">Çözüm Ekle/Düzenle</button><button class="add-service">Servis Deneyimi</button><button class="toggle-status">Durum: ${it.status==='open'?'Kapat':'Aç'}</button><button class="delete" style="background:#5f1d2d">Sil</button>` : '';
  // Follow button (not for owner)
  const followBtn = !owner && currentUser ? `<button class="follow-btn" data-id="${it.id}">Takip Et</button>` : '';
  const brandSlug=(it.brand||'generic').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const brandInitial = esc((it.brand||'?')[0]||'?');
  const logoPath = brandLogoUrls[brandSlug] || `/img/brands/${brandSlug}.svg`;
  const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const logoHtml = `<span class="brand-icon-wrap" data-fallback="${brandInitial}"><img class="brand-logo" data-src="${logoPath}" src="${placeholder}" alt="${esc(it.brand)} logo" onerror="this.closest('span').classList.add('fallback');this.remove();"></span>`;
  const issueTypeBadge = it.issue_type?`<span class="badge filter-issue-type" data-issue-type="${esc(it.issue_type)}" style="background:#342b52">${esc(it.issue_type)}</span>`:'';
  // Location badge and mini preview
  let locBadge = '';
  let locPreview = '';
  if(it.issue_location){
    try {
      const loc = JSON.parse(it.issue_location);
      
      // Yeni yapıya göre points'leri al
      let allPoints = [];
      let viewName = 'Bilinmeyen Görünüm';
      
      if (Array.isArray(loc?.points)) {
        // Eski yapı desteği
        allPoints = loc.points;
        viewName = vehicleViews[loc.view]?.name || 'Bilinmeyen Görünüm';
      } else if (loc?.views) {
        // Yeni yapı - tüm görünümlerden noktaları topla
        Object.entries(loc.views).forEach(([viewKey, viewData]) => {
          if (viewData.points) {
            allPoints = allPoints.concat(viewData.points.map(p => ({ ...p, viewKey })));
          }
        });
        viewName = vehicleViews[loc.currentView]?.name || 'Çoklu Görünüm';
      }
      
      const cnt = allPoints.length;
      if(cnt > 0){
        const categories = allPoints.map(p => p.category).filter(Boolean);
        const uniqueCategories = [...new Set(categories)];
        const categoryText = uniqueCategories.length > 0 ? uniqueCategories.join(', ') : 'belirtilmedi';
        locBadge = `<span class="badge location-badge" data-issue-id="${it.id}" title="Konum: ${esc(categoryText)} • ${cnt} nokta • ${viewName}" style="background:#2b4b52; cursor:pointer;">Konum (${cnt})</span>`;
        
        // Mini preview overlay - ana görünümün resmini kullan
        const mainViewKey = loc.currentView || loc.view || Object.keys(loc.views || {})[0];
        const viewConfig = vehicleViews[mainViewKey];
        const imageSrc = viewConfig?.image || '/img/cabin-wireframe.jpg';
        const mainViewPoints = loc.views?.[mainViewKey]?.points || allPoints.slice(0, 5); // İlk 5 nokta
        
        const dots = mainViewPoints.map(p=>`<span class='mini-dot' style='left:${(p.x*100).toFixed(1)}%;top:${(p.y*100).toFixed(1)}%'></span>`).join('');
        locPreview = `<div class='mini-loc-preview'><img src="${imageSrc}" alt="Konum önizleme"/><div class='mini-dot-layer'>${dots}</div></div>`;
      }
    } catch(_) {}
  }
  const updateBadge = it.update_count>0 ? `<span class="badge update-badge" title="${it.update_count} gelişme">Gelişme (${it.update_count})</span>` : '';
  // Vehicle detail badges
  const yearBadge = it.model_year ? `<span class="badge" style="background:#4a5568" title="Model yılı">${it.model_year}</span>` : '';
  const kmBadge = it.km ? `<span class="badge" style="background:#2d5a5a" title="Kilometre">${it.km.toLocaleString()} km</span>` : '';
  const dateStr = new Date(it.created_at).toLocaleString();
  return `<div class="issue" data-id="${it.id}" data-owner="${owner?1:0}">`
    + `<div class="issue-head"><h3>${esc(it.title)}</h3></div>`
    + `<div class="meta-lines">`
      + `<div class="meta-row row-top">`
        + `<div class="left-group">`
          + `<span class="badge filter-brand" data-brand="${esc(it.brand)}" data-model="${esc(it.model)}">${logoHtml}${esc(it.brand)} / ${esc(it.model)}</span>`
          + yearBadge + kmBadge + issueTypeBadge + locBadge + updateBadge
        + `</div>`
        + `<div class="right-group"><span class="status" data-status="${it.status}">${statusLabel(it.status)}</span></div>`
      + `</div>`
      + `<div class="meta-row row-bottom">`
        + `<div class="user-time"><span class="user-ref" data-user="${esc(it.username)}">@${esc(it.username)}</span><span class="dot">•</span><span class="ts">${dateStr}</span></div>`
      + `</div>`
    + `</div>`
    + `<div class="desc">${fmt(it.description)}</div>`
    + `<div class="sol"><strong>Çözüm:</strong><br/>${it.solution?fmt(it.solution):'<span class="empty">Çözüm yok</span>'}</div>`
    + `<div class="svc"><strong>Servis Deneyimi:</strong><br/>${it.service_experience?fmt(it.service_experience):'<span class="empty">Servis deneyimi yok</span>'}</div>`
    + `${(it.media_count||it.photo_count)>0?`<div class="photos-toggle-row"><button class="toggle-photos" data-open="0">Medya (${it.media_count||it.photo_count})</button><div class="photos-wrap hidden" aria-hidden="true"></div></div>`:''}`
    + `<div class="comments-wrap hidden gap-block"><div class="comments-list"></div>${currentUser?'<div class="comment-form"><textarea class="new-comment" placeholder="Yorum yaz"></textarea><button class="add-comment">Ekle</button></div>':'<div class="empty" style="margin-top:.2rem;">Yorum eklemek için giriş yapın</div>'}</div>`
    + `<div class="actions">${ownerBtns}${followBtn}<button class="view-comments" data-open="0">Yorumlar (${it.comment_count||0})</button></div>`
  + `</div>`;
}

// After rendering issues, update follow button state
async function updateFollowButtons(){
  if(!currentUser) return;
  const btns = qa('.follow-btn, .unfollow-btn');
  for(const btn of btns){
    const id = btn.dataset.id;
    if(!id) continue;
    try {
      const res = await jfetch(`/api/issues/${id}/follow`);
      if(res.followed){
        btn.textContent = 'Takipten Çık';
        btn.classList.add('following','unfollow-btn');
        btn.classList.remove('follow-btn');
      } else {
        btn.textContent = 'Takip Et';
        btn.classList.remove('following','unfollow-btn');
        btn.classList.add('follow-btn');
      }
    } catch{}
  }
}

// Patch loadIssues to call updateFollowButtons after rendering
const origLoadIssues = loadIssues;
loadIssues = async function(...args){
  await origLoadIssues.apply(this, args);
  updateFollowButtons();
}

issueForm?.addEventListener('submit', async e=>{ 
  e.preventDefault(); 
  if(!currentUser){ toast('Giriş yapın','warn'); return;}
  const formDataAll = new FormData(issueForm);
  const fd = Object.fromEntries([...formDataAll.entries()].filter(([k])=> k!=='attachments'));
  // include hotspot location JSON if available
  if(hotspotHidden && hotspotHidden.value){ fd.issue_location = hotspotHidden.value; }
  if(fd.issue_type==='__custom') fd.issue_type = issueTypeCustom.value.trim()||null; 
  delete fd.issue_type_custom; if(!fd.issue_type) delete fd.issue_type;
  // 1) Benzer problemleri kontrol et
  try {
    const probe = await jfetch('/api/issues/similar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ brand: fd.brand, model: fd.model, title: fd.title, description: fd.description, issue_type: fd.issue_type||'' }) });
    if(probe && Array.isArray(probe.items) && probe.items.length){
      // Listeyi doldur ve kullanıcıya göster
      similarContent.innerHTML = probe.items.map(x=>{
        // Sadece başka kullanıcıların problemleri için takip et butonu göster
        const isOwnIssue = currentUser && currentUser.username === x.username;
        const followButton = !isOwnIssue && currentUser ? `<button class="follow-btn" data-id="${x.id}">Takip Et</button>` : '';
        return `<div class="sim-item" data-id="${x.id}">
          <div class="sim-head"><strong>${esc(x.title)}</strong> <span class="badge" style="background:#2b4b52">${esc(x.status||'')}</span></div>
          <div class="sim-meta">@${esc(x.username)} • ${new Date(x.created_at).toLocaleDateString()} • ${esc(x.brand)} / ${esc(x.model)}</div>
          <div class="sim-body">${esc(x.snippet)}</div>
          ${followButton}
        </div>`;
      }).join('');
      // Update follow state for each button (her zaman güncelle)
      setTimeout(async ()=>{
        const btns = similarContent.querySelectorAll('.follow-btn, .unfollow-btn');
        for(const btn of btns){
          const id = btn.dataset.id;
          if(!id) continue;
          try {
            const res = await jfetch(`/api/issues/${id}/follow`);
            if(res.followed){
              btn.textContent = 'Takipten Çık';
              btn.classList.add('following','unfollow-btn');
              btn.classList.remove('follow-btn');
            } else {
              btn.textContent = 'Takip Et';
              btn.classList.remove('following','unfollow-btn');
              btn.classList.add('follow-btn');
            }
          } catch{}
        }
      }, 0);
      openModal(similarModal);
      // benzer problem kutularına tıklayınca ilgili karta git
      similarContent.querySelectorAll('.sim-item').forEach(div=>{
        div.addEventListener('click', ()=>{
          closeModal(similarModal);
          closeModal(issueModal);
          const targetId = div.getAttribute('data-id');
          const el = document.querySelector(`.issue[data-id='${targetId}']`);
          if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); el.classList.add('highlight'); setTimeout(()=> el.classList.remove('highlight'), 1600); }
          else { toast('Listede değilse filtreleri temizleyip tekrar deneyin','info'); }
        });
      });
      const btn = document.getElementById('similar-continue');
      const onCont = async ()=>{
        btn.disabled = true;
        closeModal(similarModal);
        try { await actuallyCreateIssue(fd); } finally { btn.disabled=false; btn.removeEventListener('click', onCont); }
      };
      btn.addEventListener('click', onCont, { once:false });
      return; // Kullanıcı kararı bekleniyor
    }
  } catch(_) { /* bağlantı hatasını yoksay ve devam et */ }
  // 2) Benzer bulunmadı -> doğrudan oluştur
  try { await actuallyCreateIssue(fd); } catch(err){ toast('Hata: '+err.message,'error'); }
});

async function actuallyCreateIssue(fd){
  const created = await jfetch('/api/issues',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fd)});
  const attachInput = document.getElementById('issue-attachments');
  if(attachInput && attachInput.files.length){
    const formData2 = new FormData();
    Array.from(attachInput.files).slice(0,5).forEach(f=> formData2.append('attachments', f));
    try { const pr2 = await fetch('/api/issues/'+created.id+'/attachments',{ method:'POST', body: formData2 }); if(!pr2.ok){ const t2=await pr2.text(); toast('Medya hata: '+t2,'warn'); } } catch(err){ toast('Medya yüklenemedi: '+err.message,'warn'); }
  }
  issueForm.reset(); if(attachInput) attachInput.value='';
  // reset hotspot state and UI
  hotspotState = { currentView: '', views: {} };
  if(hotspotCategory) hotspotCategory.value='';
  if(hotspotHidden) hotspotHidden.value = JSON.stringify(hotspotState);
  if(hotspotLayer) hotspotLayer.innerHTML='';
  clearMediaPreview();
  pagination.page = 1; pagination.total +=1;
  await loadIssues();
  if(issueAutoClose?.checked) closeModal(issueModal);
  loadBrandModels(); loadIssueTypes();
}

// --- Modern Media Dropzone ---
const dz = document.getElementById('media-dropzone');
const dzInput = document.getElementById('issue-attachments');
const dzBrowseBtn = document.getElementById('media-browse-btn');
const dzPreview = document.getElementById('media-preview');
const MAX_FILES = 5; const MAX_SIZE = 15 * 1024 * 1024; // 15MB

function human(n){ if(n>1024*1024) return (n/1024/1024).toFixed(1)+'MB'; if(n>1024) return (n/1024).toFixed(1)+'KB'; return n+'B'; }
function fileKind(f){ if(f.type.startsWith('image/')) return 'image'; if(f.type.startsWith('audio/')) return 'audio'; if(f.type.startsWith('video/')) return 'video'; return 'other'; }
function clearMediaPreview(){ if(dzPreview) dzPreview.innerHTML=''; }
function updatePreview(){ if(!dzInput || !dzPreview) return; dzPreview.innerHTML=''; Array.from(dzInput.files).forEach((f,idx)=>{ const kind=fileKind(f); const chip=document.createElement('div'); chip.className='media-chip kind-'+kind; chip.innerHTML=`<div class="thumb">${kind==='image'?'<img alt="" />': kind==='video'?'<span>🎬</span>': kind==='audio'?'<span>🎵</span>':'<span>📄</span>'}</div><div class="meta"><span class="name" title="${esc(f.name)}">${esc(f.name)}</span><span class="info">${kind.toUpperCase()} • ${human(f.size)}</span></div><button type="button" class="remove" aria-label="Kaldır" data-idx="${idx}">×</button><div class="progress" data-bar></div>`; dzPreview.appendChild(chip); if(kind==='image'){ const img=chip.querySelector('img'); if(img){ const reader=new FileReader(); reader.onload=e=> img.src=e.target.result; reader.readAsDataURL(f); } } }); }
function replaceFileList(newFiles){ // create DataTransfer to reset input
  const dt = new DataTransfer(); newFiles.forEach(f=> dt.items.add(f)); dzInput.files = dt.files; }
function addFiles(list){ if(!dzInput) return; let files = Array.from(dzInput.files); for(const f of list){ if(files.length>=MAX_FILES){ dz.classList.add('too-many'); setTimeout(()=>dz.classList.remove('too-many'),400); break; } if(f.size>MAX_SIZE){ toast('Dosya büyük: '+f.name,'warn'); continue; } const kind=fileKind(f); if(kind==='other'){ toast('Desteklenmeyen tür: '+f.name,'warn'); continue; } files.push(f); } replaceFileList(files); updatePreview(); }

if(dz && dzInput){
  dz.addEventListener('click', e=>{ if(e.target===dz || e.target.classList.contains('dz-text')) dzInput.click(); });
  dzBrowseBtn?.addEventListener('click', ()=> dzInput.click());
  dzInput.addEventListener('change', ()=> updatePreview());
  dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', e=>{ if(e.relatedTarget && dz.contains(e.relatedTarget)) return; dz.classList.remove('dragover'); });
  dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('dragover'); const items = e.dataTransfer.files; if(items?.length) addFiles(items); });
  dzPreview.addEventListener('click', e=>{ const btn=e.target.closest('button.remove'); if(!btn) return; const idx=parseInt(btn.dataset.idx,10); let files=Array.from(dzInput.files); files.splice(idx,1); replaceFileList(files); updatePreview(); });
  dz.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); dzInput.click(); } });
}

// Prefetch user issues on hover
issuesDiv?.addEventListener('mouseover', e=>{
  const userEl = e.target.closest('.user-ref');
  if(!userEl) return;
  const uname = userEl.getAttribute('data-user');
  if(!uname || userIssuesCache.has(uname)) return;
  // small debounce
  userEl.dataset.prefetching='1';
  setTimeout(async ()=>{
    if(!userEl.isConnected) return;
    try{ const list = await jfetch('/api/users/'+encodeURIComponent(uname)+'/issues'); userIssuesCache.set(uname,list); }
    catch{}
    finally{ delete userEl.dataset.prefetching; }
  }, 150);
});

// Override openUserIssues to use cache
const _openUserIssuesOriginal = openUserIssues;
openUserIssues = async function(username){
  if(userIssuesCache.has(username)){
    if(!userIssuesModal) return;
    userIssuesTitle.textContent='@'+username+' Problemleri';
    const issues = userIssuesCache.get(username);
    if(!issues.length){ userIssuesContent.innerHTML='<div class="empty">Problem yok</div>'; openModal(userIssuesModal); return; }
    userIssuesContent.innerHTML = issues.map(u=>`<div class=\"mini-issue\" data-id=\"${u.id}\"><div class=\"mi-head\"><strong>${esc(u.title)}</strong><span class=\"mi-meta\">${esc(u.brand)} / ${esc(u.model)} • ${new Date(u.created_at).toLocaleDateString()}</span></div><div class=\"mi-body\">${esc(u.description).slice(0,140)}${u.description.length>140?'...':''}</div></div>`).join('');
    openModal(userIssuesModal);
    userIssuesContent.querySelectorAll('.mini-issue').forEach(div=> div.addEventListener('click', ()=>{
      const targetId=div.getAttribute('data-id'); closeModal(userIssuesModal); const el=document.querySelector(`.issue[data-id='${targetId}']`); if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); el.classList.add('highlight'); setTimeout(()=>el.classList.remove('highlight'),1600); }
    }));
    return;
  }
  return _openUserIssuesOriginal(username);
}

// offline banner logic removed per request

// Keyboard shortcuts (N = new issue, / focus search, Esc closes top modal)
document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
  if(e.key==='n' || e.key==='N'){ if(currentUser){ openModal(issueModal); } }
  if(e.key==='/'){ e.preventDefault(); searchInput?.focus(); }
});

// Collapse / expand filters
toggleFiltersBtn?.addEventListener('click', ()=>{
  const collapsed = filtersWrap.classList.toggle('collapsed');
  toggleFiltersBtn.setAttribute('aria-expanded', collapsed? 'false':'true');
  toggleFiltersBtn.textContent = collapsed? 'Genişlet':'Daralt';
  localStorage.setItem('filtersCollapsed', collapsed?'1':'0');
});

// Persist filters to localStorage
const filterKeys = ['filterBrand','filterModel','filterIssueType','searchQuery','pageSize'];
function saveFilters(){
  const data={
    brand: filterBrand.value,
    model: filterModel.value,
    issue: filterIssueType.value,
    q: searchInput.value,
    pageSize: pageSizeSel.value
  };
  localStorage.setItem('filtersState', JSON.stringify(data));
}
function restoreFilters(){
  try{ const raw=localStorage.getItem('filtersState'); if(!raw) return; const d=JSON.parse(raw);
    if(d.brand){ filterBrand.value=d.brand; fillFilterModels(); }
    if(d.model){ filterModel.value=d.model; }
    if(d.issue){ filterIssueType.value=d.issue; }
    if(d.q){ searchInput.value=d.q; }
    if(d.pageSize){ pageSizeSel.value=d.pageSize; pagination.pageSize=parseInt(d.pageSize,10)||20; }
  }catch{}
  const fc = localStorage.getItem('filtersCollapsed');
  if(fc==='1'){ filtersWrap.classList.add('collapsed'); toggleFiltersBtn.textContent='Genişlet'; toggleFiltersBtn.setAttribute('aria-expanded','false'); }
}

[filterBrand, filterModel, filterIssueType, searchInput, pageSizeSel].forEach(el=> el?.addEventListener('change', saveFilters));
searchInput?.addEventListener('input', debounce(saveFilters, 400));

// Pagination controls
pagePrev?.addEventListener('click', ()=>{ if(pagination.page>1){ pagination.page--; loadIssues(); window.scrollTo({top:0,behavior:'smooth'}); }});
pageNext?.addEventListener('click', ()=>{ const totalPages=Math.ceil(pagination.total/pagination.pageSize)||1; if(pagination.page<totalPages){ pagination.page++; loadIssues(); window.scrollTo({top:0,behavior:'smooth'}); }});
pageSizeSel?.addEventListener('change', ()=>{ pagination.pageSize=parseInt(pageSizeSel.value,10)||20; pagination.page=1; loadIssues(); });

// --- Comments ---
function renderComment(c){
  const owner = currentUser && currentUser.username===c.username;
  const actions = owner ? `<div class="c-actions"><button class="comment-edit" data-id="${c.id}">Düzenle</button><button class="comment-delete" data-id="${c.id}" style="background:#5f1d2d">Sil</button></div>`:'';
  return `<div class=\"comment-item\" data-id=\"${c.id}\">`+
    `<span class=\"c-meta\">@${esc(c.username)} • ${new Date(c.created_at).toLocaleString()}</span>`+
    `<div class=\"c-body\">${fmt(c.content)}</div>${actions}</div>`;
}
function incCommentCount(card){ const btn=card.querySelector('.view-comments'); const m=btn.textContent.match(/Yorumlar \((\d+)\)/); if(!m) return; btn.textContent=`Yorumlar (${parseInt(m[1],10)+1})`; }
function decCommentCount(card){ const btn=card.querySelector('.view-comments'); const m=btn.textContent.match(/Yorumlar \((\d+)\)/); if(!m) return; btn.textContent=`Yorumlar (${Math.max(0,parseInt(m[1],10)-1)})`; }
async function toggleComments(card,id){
  const wrap=card.querySelector('.comments-wrap'); const btn=card.querySelector('.view-comments');
  const open=btn.getAttribute('data-open')==='1';
  if(open){ wrap.classList.add('hidden'); btn.setAttribute('data-open','0'); return; }
  wrap.classList.remove('hidden'); btn.setAttribute('data-open','1');
  const listDiv=wrap.querySelector('.comments-list');
  listDiv.innerHTML='<div class="empty">Yükleniyor...</div>';
  // Ön kontrol: issue gerçekten var mı?
  try {
    await jfetch(`/api/issues/${id}`);
  } catch (err) {
    if(/Issue not found/i.test(err.message)) { toast('Problem artık yok (yenileniyor)','warn'); handleStaleIssue(card); return; }
    toast('Problem alınamadı','error'); handleStaleIssue(card); return;
  }
  try{
    const list=await jfetch(`/api/issues/${id}/comments`);
    listDiv.innerHTML=list.length?list.map(renderComment).join(''):'<div class="empty">Yorum yok</div>';
  }catch(err){
    if(/Issue not found/i.test(err.message)){
      listDiv.innerHTML='<div class="empty">Problem silinmiş • yenileniyor...</div>';
      handleStaleIssue(card);
    } else {
  console.warn('Yorumlar alınamadı', { issueId:id, error:err.message });
      listDiv.innerHTML='<div class="empty">Hata</div>';
    }
  }
}
// Photos toggle
async function togglePhotos(card,id){
  const btn = card.querySelector('.toggle-photos');
  const wrap = card.querySelector('.photos-wrap');
  if(!btn||!wrap) return;
  const open = btn.getAttribute('data-open')==='1';
  if(open){ wrap.classList.add('hidden'); wrap.setAttribute('aria-hidden','true'); btn.setAttribute('data-open','0'); return; }
  wrap.classList.remove('hidden'); wrap.setAttribute('aria-hidden','false'); btn.setAttribute('data-open','1');
  if(!wrap.dataset.loaded){
    wrap.innerHTML='<div class="empty">Yükleniyor...</div>';
    try {
      const bust = 'cb=' + Date.now();
      const [photos, attachments] = await Promise.all([
        jfetch('/api/issues/'+id+'/photos?'+bust).catch(()=>[]),
        jfetch('/api/issues/'+id+'/attachments?'+bust).catch(()=>[])
      ]);
      const mediaItems=[];
      photos.forEach(p=> mediaItems.push({kind:'image', url:p.url + (p.url.includes('?')?'&':'?')+bust, original_name:p.original_name}));
      attachments.forEach(a=> mediaItems.push({kind:a.kind || (a.mime||'').split('/')[0], url:a.url + (a.url.includes('?')?'&':'?')+bust, original_name:a.original_name, mime:a.mime}));
      if(!mediaItems.length){ wrap.innerHTML='<div class="empty">Medya yok</div>'; wrap.dataset.loaded='1'; return; }
      const html = mediaItems.map(m=>{
        if(m.kind==='image') return `<figure class="m-item image"><img loading="lazy" src="${esc(m.url)}" alt="${esc(m.original_name||'görsel')}"/><figcaption>${esc(m.original_name||'')}</figcaption></figure>`;
        if(m.kind==='audio') return `<figure class="m-item audio"><audio controls preload="none" src="${esc(m.url)}"></audio><figcaption>${esc(m.original_name||'Ses')}</figcaption></figure>`;
        if(m.kind==='video') return `<figure class="m-item video"><video controls preload="metadata" src="${esc(m.url)}"></video><figcaption>${esc(m.original_name||'Video')}</figcaption></figure>`;
        return `<figure class="m-item other"><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.original_name||'Dosya')}</a></figure>`;
      }).join('');
      wrap.innerHTML = '<div class="media-grid">'+html+'</div>';
      wrap.dataset.loaded='1';
    } catch { wrap.innerHTML='<div class="empty">Yüklenemedi</div>'; }
  }
}
// Silinmiş (stale) issue kartını güvenli kaldırıp listeyi yenile
function handleStaleIssue(card){
  if(!card) return; 
  card.dataset.stale='1';
  card.style.pointerEvents='none';
  card.style.opacity='.45';
  const msgDiv=document.createElement('div');
  msgDiv.className='empty';
  msgDiv.style.marginTop='.4rem';
  msgDiv.textContent='Problem silinmiş. Kaldırılıyor...';
  if(!card.querySelector('.empty')) card.appendChild(msgDiv);
  setTimeout(()=>{ try{ card.remove(); }catch{} loadIssues(); },200);
}
function startEditComment(item){ if(item.classList.contains('editing')) return; const body=item.querySelector('.c-body'); const original=body.innerText; item.dataset.original=original; body.innerHTML=`<textarea class="comment-edit-box" style="width:100%; min-height:60px;">${esc(original)}</textarea>`; const actions=item.querySelector('.c-actions'); if(actions){ actions.innerHTML='<button class="comment-save">Kaydet</button><button class="comment-cancel" style="background:#555">İptal</button>'; } item.classList.add('editing'); }
async function saveEditComment(item){ const ta=item.querySelector('.comment-edit-box'); if(!ta) return; const newVal=ta.value.trim(); if(!newVal){ toast('Boş olamaz','warn'); return; } const id=item.dataset.id; try{ const updated=await jfetch('/api/comments/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:newVal})}); item.outerHTML=renderComment(updated); toast('Yorum güncellendi','success'); }catch{ toast('Kaydedilemedi','error'); }}
function cancelEditComment(item){ const original=item.dataset.original||''; const id=item.dataset.id; const user=item.querySelector('.c-meta')?.textContent.split('•')[0].trim().replace('@','')||''; item.outerHTML=renderComment({id, username:user, created_at:new Date().toISOString(), content: original}); }
async function deleteComment(item, card){ if(!confirm('Yorum silinsin mi?')) return; const id=item.dataset.id; item.style.opacity='.4'; try{ await jfetch('/api/comments/'+id,{method:'DELETE'}); decCommentCount(card); item.remove(); if(!card.querySelector('.comment-item')){ const list=card.querySelector('.comments-list'); list.innerHTML='<div class="empty">Yorum yok</div>'; } toast('Yorum silindi','success'); }catch{ item.style.opacity='1'; toast('Silinemedi','error'); }}

// --- User Issues Modal ---
async function openUserIssues(username){
  if(!userIssuesModal) return;
  userIssuesTitle.textContent='@'+username+' Problemleri';
  userIssuesContent.innerHTML='<div class="empty">Yükleniyor...</div>';
  openModal(userIssuesModal);
  try {
    const issues = await jfetch('/api/users/'+encodeURIComponent(username)+'/issues');
    if(!issues.length){ userIssuesContent.innerHTML='<div class="empty">Problem yok</div>'; return; }
    userIssuesContent.innerHTML = issues.map(u=>`<div class="mini-issue" data-id="${u.id}"><div class="mi-head"><strong>${esc(u.title)}</strong><span class="mi-meta">${esc(u.brand)} / ${esc(u.model)} • ${new Date(u.created_at).toLocaleDateString()}</span></div><div class="mi-body">${esc(u.description).slice(0,140)}${u.description.length>140?'...':''}</div></div>`).join('');
    userIssuesContent.querySelectorAll('.mini-issue').forEach(div=> div.addEventListener('click', ()=>{
      const targetId=div.getAttribute('data-id');
      closeModal(userIssuesModal);
      const el = document.querySelector(`.issue[data-id='${targetId}']`);
      if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); el.classList.add('highlight'); setTimeout(()=>el.classList.remove('highlight'),1600); }
    }));
  } catch(err){ userIssuesContent.innerHTML='<div class="empty">Yüklenemedi</div>'; }
}

// --- Modals ---
function openModal(m){ m.classList.remove('hidden'); m.setAttribute('aria-hidden','false'); }
function closeModal(m){ m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); }
document.addEventListener('click', e=>{ const c=e.target.closest('[data-close]'); if(c){ const id=c.getAttribute('data-close'); const m=$(id); if(m) closeModal(m); } if(e.target.classList.contains('modal-overlay')) closeModal(e.target); });

document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [issueModal, profileModal, authPanel].forEach(m=>{ if(!m) return; if(m===authPanel) authPanel.classList.add('hidden'); else if(!m.classList.contains('hidden')) closeModal(m); }); }});

// --- Init ---
(async function init(){ await Promise.all([loadBrandModels(), loadIssueTypes()]); await refreshMe(); if(currentUser){ startNotifPolling(); } loadIssues(); })();
restoreFilters();
// After initial load attempt to attach logo observer (may re-run after loadIssues)
const logoObserverInterval = setInterval(()=>{ if(document.querySelector('img.brand-logo[data-src]') && typeof setupLogoObserver==='function'){ setupLogoObserver(); } }, 700);
setTimeout(()=> clearInterval(logoObserverInterval), 7000);
window.addEventListener('focus', ()=>{ if(currentUser) loadMyVehicles(); });

// --- Hotspot (Issue Location) UI ---
function hotspotRender(){
  if(!hotspotLayer) return;
  hotspotLayer.innerHTML='';
  
  // Mevcut görünümün noktalarını al
  const currentPoints = hotspotState.views[hotspotState.currentView]?.points || [];
  
  currentPoints.forEach((p, idx)=>{
    const dot=document.createElement('button'); dot.type='button'; dot.className='hotspot-dot';
    dot.style.left=(p.x*100)+'%'; dot.style.top=(p.y*100)+'%';
    dot.title=(p.category||'Konum')+` • #${idx+1} (silmek için tıkla)`; dot.setAttribute('aria-label', dot.title);
    dot.addEventListener('click', (ev)=>{ 
      ev.stopPropagation(); 
      hotspotState.views[hotspotState.currentView].points.splice(idx,1); 
      hotspotSync(); 
    });
    hotspotLayer.appendChild(dot);
  });
  
  // Points listesini güncelle
  updatePointsList();
  
  // Küçük önizleme (mini)
  const mini = document.getElementById('hotspot-mini-preview');
  const currentView = hotspotState.currentView;
  const viewConfig = vehicleViews[currentView];
  
  if(mini && currentView && viewConfig){
    mini.style.display = 'block';
    const imageSrc = viewConfig.image;
    mini.innerHTML = `<img src="${imageSrc}" alt="Önizleme" style="width:100%;height:100%;object-fit:cover;opacity:.93;">`;
    let dots = '';
    currentPoints.forEach((p, idx)=>{
      dots += `<div class='mini-dot' style='left:${p.x*100}%;top:${p.y*100}%;' title='${p.category||'Konum'} • #${idx+1}'></div>`;
    });
    mini.innerHTML += `<div class='mini-dot-layer' style='position:absolute;inset:0;'>${dots}</div>`;
    
    // Büyüt butonunu göster
    const enlargeBtn = document.getElementById('hotspot-enlarge-btn');
    if(enlargeBtn) enlargeBtn.style.display = 'block';
  } else if(mini) {
    mini.style.display = 'none';
    const enlargeBtn = document.getElementById('hotspot-enlarge-btn');
    if(enlargeBtn) enlargeBtn.style.display = 'none';
  }
  
  // Büyük önizleme (modal)
  const full = document.getElementById('hotspot-full-preview');
  if(full && full.closest('.modal-overlay') && !full.closest('.modal-overlay').classList.contains('hidden')){
    const imageSrc = viewConfig ? viewConfig.image : '/img/cabin-wireframe.jpg';
    full.innerHTML = `<img src="${imageSrc}" alt="Büyük Önizleme" style="width:100%;height:100%;object-fit:cover;opacity:.97;">`;
    let dots = '';
    currentPoints.forEach((p, idx)=>{
      dots += `<div class='mini-dot' style='left:${p.x*100}%;top:${p.y*100}%;width:18px;height:18px;' title='${p.category||'Konum'} • #${idx+1}'></div>`;
    });
    full.innerHTML += `<div class='mini-dot-layer' style='position:absolute;inset:0;'>${dots}</div>`;
  }
  
  // Nokta listesini güncelle
  updatePointsList();
}
function hotspotSync(){
  const newView = vehicleViewSelect?.value || '';
  hotspotState.currentView = newView;
  if(hotspotHidden) hotspotHidden.value = JSON.stringify(hotspotState);
  hotspotRender();
}

// Konum modalını aç (problem kartındaki küçük resme tıklanınca)
async function openLocationModal(issueId) {
  try {
    const issue = await jfetch(`/api/issues/${issueId}`);
    if(!issue.issue_location) {
      toast('Bu problemde konum işaretlenmemiş', 'warn');
      return;
    }
    
    const loc = JSON.parse(issue.issue_location);
    
    // Görünümler ve noktalar
    let viewsData = {};
    let totalPoints = 0;
    
    if (Array.isArray(loc?.points)) {
      // Eski yapı desteği
      const viewKey = loc.view || 'exterior-front';
      viewsData[viewKey] = { points: loc.points };
      totalPoints = loc.points.length;
    } else if (loc?.views) {
      // Yeni yapı
      viewsData = loc.views;
      Object.values(loc.views).forEach(view => {
        if (view.points) {
          totalPoints += view.points.length;
        }
      });
    }
    
    if(totalPoints === 0) {
      toast('Bu problemde konum noktası yok', 'warn');
      return;
    }
    
    // Dinamik modal oluştur
    let locationModal = document.getElementById('location-modal');
    if(!locationModal) {
      locationModal = document.createElement('div');
      locationModal.id = 'location-modal';
      locationModal.className = 'modal-overlay hidden';
      locationModal.setAttribute('aria-hidden', 'true');
      locationModal.setAttribute('role', 'dialog');
      locationModal.style.zIndex = '999';
      
      // Görünümler listesi oluştur
      let viewsHtml = '';
      Object.entries(viewsData).forEach(([viewKey, viewData]) => {
        if (viewData.points && viewData.points.length > 0) {
          const viewConfig = vehicleViews[viewKey] || { image: '/img/cabin-wireframe.jpg', name: viewKey };
          const dots = viewData.points.map((p, idx) => 
            `<div class='location-modal-dot' style='left:${p.x*100}%;top:${p.y*100}%;' title='${p.category || 'Konum'} • #${idx+1}'></div>`
          ).join('');
          
          const categoriesText = viewData.points.map((p, i) => 
            `<span style="background:#2a313a; padding:0.2rem 0.5rem; border-radius:8px; font-size:0.75rem;">#${i+1}: ${p.category || 'Kategori yok'}</span>`
          ).join('');
          
          viewsHtml += `
            <div style="margin-bottom:2rem;">
              <h3 style="margin-bottom:1rem; color:#e2e8f0; font-size:1.1rem;">📍 ${viewConfig.name} (${viewData.points.length} nokta)</h3>
              <div style="width:100%; max-width:500px; aspect-ratio:16/9; background:#10171d; border-radius:12px; border:2px solid #2a313a; position:relative; overflow:hidden; margin-bottom:1rem;">
                <img src="${viewConfig.image}" alt="${viewConfig.name}" style="width:100%;height:100%;object-fit:cover;opacity:.97;">
                <div style="position:absolute;inset:0;">${dots}</div>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:0.5rem; justify-content:center;">
                ${categoriesText}
              </div>
            </div>
          `;
        }
      });
      
      locationModal.innerHTML = `
        <div class="modal" style="max-width:900px; background:#181c22; padding:0; overflow:hidden; position:relative; max-height:90vh; overflow-y:auto;">
          <button class="close" data-close="location-modal" aria-label="Kapat" style="position:absolute; top:1rem; right:1rem; z-index:2;">×</button>
          <div style="padding:2.5rem 2.5rem 2rem 2.5rem; display:flex; flex-direction:column; align-items:center;">
            <h2 style="margin-bottom:1.2rem; text-align:center;">Arıza Konumları - ${esc(issue.title)}</h2>
            <div style="margin-bottom:1.5rem; text-align:center; opacity:0.8; font-size:0.9rem;">
              Toplam ${totalPoints} nokta işaretli
            </div>
            ${viewsHtml}
          </div>
        </div>
      `;
      document.body.appendChild(locationModal);
    }
    
    // Modalı aç
    locationModal.classList.remove('hidden');
    locationModal.setAttribute('aria-hidden', 'false');
    
    // Kapatma event'lerini ekle
    const closeHandler = (e) => {
      if(e.target.classList.contains('modal-overlay') || e.target.classList.contains('close') || e.target.dataset.close === 'location-modal') {
        locationModal.classList.add('hidden');
        locationModal.setAttribute('aria-hidden', 'true');
      }
    };
    locationModal.addEventListener('click', closeHandler);
    
  } catch(err) {
    toast('Konum bilgisi alınamadı', 'error');
    console.warn('Location modal error:', err);
  }
}

// Hotspot büyüt modalı aç/kapat
const enlargeBtn = document.getElementById('hotspot-enlarge-btn');
const hotspotModal = document.getElementById('hotspot-modal');
if(enlargeBtn && hotspotModal){
  enlargeBtn.addEventListener('click', ()=>{
    hotspotModal.classList.remove('hidden');
    hotspotModal.setAttribute('aria-hidden','false');
    hotspotRender();
  });
  hotspotModal.addEventListener('click', e=>{
    if(e.target.classList.contains('modal-overlay') || e.target.classList.contains('close')){
      hotspotModal.classList.add('hidden');
      hotspotModal.setAttribute('aria-hidden','true');
    }
  });
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape' && !hotspotModal.classList.contains('hidden')){
      hotspotModal.classList.add('hidden');
      hotspotModal.setAttribute('aria-hidden','true');
    }
  });
}
function hotspotAddFromEvent(ev){
  const wrap = hotspotLayer?.parentElement; if(!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
  const category = hotspotCategory?.value || '';
  if(!category) {
    toast('Önce kategori seçin', 'warn');
    return;
  }
  
  // Mevcut görünümün state'ini al veya oluştur
  if (!hotspotState.views[hotspotState.currentView]) {
    hotspotState.views[hotspotState.currentView] = { points: [] };
  }
  
  // Noktayı ekle
  hotspotState.views[hotspotState.currentView].points.push({x, y, category});
  
  // Kategoriyi sıfırlama yerine seçili bırak
  // hotspotCategory.value = '';
  
  hotspotSync();
}
document.getElementById('hotspot-add')?.addEventListener('click', ()=>{ 
  if (!hotspotState.views[hotspotState.currentView]) {
    hotspotState.views[hotspotState.currentView] = { points: [] };
  }
  hotspotState.views[hotspotState.currentView].points.push({x:0.5,y:0.5,category:''}); 
  hotspotSync(); 
});
document.getElementById('hotspot-clear')?.addEventListener('click', ()=>{ 
  if (hotspotState.views[hotspotState.currentView]) {
    hotspotState.views[hotspotState.currentView].points = [];
  }
  hotspotSync(); 
});
hotspotCategory?.addEventListener('change', hotspotSync);
hotspotLayer?.addEventListener('click', hotspotAddFromEvent);
  // Initialize hidden value once
if(hotspotHidden && !hotspotHidden.value){ hotspotHidden.value = JSON.stringify(hotspotState); }

// Görünüm seçici event handler
const vehicleViewSelect = document.getElementById('vehicle-view-select');
const hotspotWrap = document.getElementById('hotspot-wrap');
const hotspotBase = document.getElementById('hotspot-base');
const hotspotPreviewRow = document.querySelector('.hotspot-preview-row');

vehicleViewSelect?.addEventListener('change', function() {
  const selectedView = this.value;
  
  if(!selectedView) {
    hotspotWrap.style.display = 'none';
    hotspotPreviewRow.style.display = 'none';
    updateCategoryOptions([]);
    return;
  }
  
  const viewConfig = vehicleViews[selectedView];
  if(viewConfig) {
    // Resmi değiştir
    hotspotBase.src = viewConfig.image;
    hotspotBase.alt = viewConfig.name;
    
    // Wrap'i göster
    hotspotWrap.style.display = 'block';
    hotspotPreviewRow.style.display = 'flex';
    
    // Kategorileri güncelle
    updateCategoryOptions(viewConfig.categories);
    
    // Bu görünüm için varsa noktaları render et (SİLME!)
    hotspotSync();
  }
});

// Kategori seçeneklerini güncelle
function updateCategoryOptions(categories) {
  if(!hotspotCategory) return;
  
  hotspotCategory.innerHTML = '<option value="">(Kategori seçin)</option>';
  
  const categoryNames = {
    // Dış kategoriler
    'far': 'Far', 'tampon-on': 'Ön Tampon', 'tampon-arka': 'Arka Tampon', 'kaput': 'Kaput',
    'cam-on': 'Ön Cam', 'cam-arka': 'Arka Cam', 'cam-yan': 'Yan Cam', 'cam-tavan': 'Cam Tavan',
    'plaka': 'Ön Plaka', 'plaka-arka': 'Arka Plaka', 'izgara': 'Izgara', 'logo': 'Marka Logosu',
    'kapi-surucu': 'Sürücü Kapısı', 'kapi-yolcu': 'Yolcu Kapısı', 'kapi-yolcu-on': 'Ön Yolcu Kapısı',
    'kapi-surucu-yan': 'Sürücü Kapısı (Yan)', 'ayna-dis-sag': 'Sağ Dış Ayna', 'ayna-dis-sol': 'Sol Dış Ayna',
    'tekerlek-on-sag': 'Sağ Ön Tekerlek', 'tekerlek-arka-sag': 'Sağ Arka Tekerlek',
    'tekerlek-on-sol': 'Sol Ön Tekerlek', 'tekerlek-arka-sol': 'Sol Arka Tekerlek',
    'sarj-kapagi': 'Şarj Kapağı', 'bagaj-kapagi': 'Bagaj Kapağı', 'stop-lambasi': 'Stop Lambası',
    // İç kategoriler  
    'direksiyon': 'Direksiyon', 'ekran': 'Merkez Ekran', 'koltuk-surucu': 'Sürücü Koltuğu',
    'koltuk-yolcu': 'Yolcu Koltuğu', 'koltuk-arka-sol': 'Arka Sol Koltuk', 'koltuk-arka-sag': 'Arka Sağ Koltuk',
    'koltuk-arka-orta': 'Arka Orta Koltuk', 'pedallar': 'Pedallar', 'havalandirma': 'Havalandırma',
    'klima-arka': 'Arka Klima', 'ayna-ic': 'İç Ayna', 'bagaj-ici': 'Bagaj İçi'
  };
  
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = categoryNames[cat] || cat;
    hotspotCategory.appendChild(option);
  });
}

// Kategori görünen adını al
function getCategoryDisplayName(cat) {
  const categoryNames = {
    // Dış kategoriler
    'far': 'Far', 'tampon-on': 'Ön Tampon', 'tampon-arka': 'Arka Tampon', 'kaput': 'Kaput',
    'cam-on': 'Ön Cam', 'cam-arka': 'Arka Cam', 'cam-yan': 'Yan Cam', 'cam-tavan': 'Cam Tavan',
    'plaka': 'Ön Plaka', 'plaka-arka': 'Arka Plaka', 'izgara': 'Izgara', 'logo': 'Marka Logosu',
    'kapi-surucu': 'Sürücü Kapısı', 'kapi-yolcu': 'Yolcu Kapısı', 'kapi-yolcu-on': 'Ön Yolcu Kapısı',
    'kapi-surucu-yan': 'Sürücü Kapısı (Yan)', 'ayna-dis-sag': 'Sağ Dış Ayna', 'ayna-dis-sol': 'Sol Dış Ayna',
    'tekerlek-on-sag': 'Sağ Ön Tekerlek', 'tekerlek-arka-sag': 'Sağ Arka Tekerlek',
    'tekerlek-on-sol': 'Sol Ön Tekerlek', 'tekerlek-arka-sol': 'Sol Arka Tekerlek',
    'sarj-kapagi': 'Şarj Kapağı', 'bagaj-kapagi': 'Bagaj Kapağı', 'stop-lambasi': 'Stop Lambası',
    // İç kategoriler  
    'direksiyon': 'Direksiyon', 'ekran': 'Merkez Ekran', 'koltuk-surucu': 'Sürücü Koltuğu',
    'koltuk-yolcu': 'Yolcu Koltuğu', 'koltuk-arka-sol': 'Arka Sol Koltuk', 'koltuk-arka-sag': 'Arka Sağ Koltuk',
    'koltuk-arka-orta': 'Arka Orta Koltuk', 'pedallar': 'Pedallar', 'havalandirma': 'Havalandırma',
    'klima-arka': 'Arka Klima', 'ayna-ic': 'İç Ayna', 'bagaj-ici': 'Bagaj İçi'
  };
  return categoryNames[cat] || cat;
}

// Nokta listesini güncelle
function updatePointsList() {
  const container = document.getElementById('hotspot-points-container');
  const listDiv = document.getElementById('hotspot-points-list');
  if(!container || !listDiv) return;
  
  const currentPoints = hotspotState.views[hotspotState.currentView]?.points || [];
  
  if(currentPoints.length === 0) {
    listDiv.style.display = 'none';
    return;
  }
  
  listDiv.style.display = 'block';
  container.innerHTML = '';
  
  // Mevcut görünümün kategorilerini al
  const viewConfig = vehicleViews[hotspotState.currentView];
  const availableCategories = viewConfig?.categories || [];
  
  currentPoints.forEach((p, idx) => {
    const pointDiv = document.createElement('div');
    pointDiv.className = 'hotspot-point-item';
    
    // Kategori seçenekleri oluştur
    let categoryOptions = '<option value="">(Kategori seçin)</option>';
    availableCategories.forEach(cat => {
      const isSelected = p.category === cat ? 'selected' : '';
      const categoryName = getCategoryDisplayName(cat);
      categoryOptions += `<option value="${cat}" ${isSelected}>${categoryName}</option>`;
    });
    
    pointDiv.innerHTML = `
      <div class="point-info">
        <span class="point-number">#${idx + 1}</span>
        <select class="point-category" data-idx="${idx}">
          ${categoryOptions}
        </select>
      </div>
      <button type="button" class="point-remove" data-idx="${idx}">Sil</button>
    `;
    container.appendChild(pointDiv);
  });
  
  // Event listeners
  container.querySelectorAll('.point-category').forEach(select => {
    select.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.idx);
      if(hotspotState.views[hotspotState.currentView]?.points[idx]) {
        hotspotState.views[hotspotState.currentView].points[idx].category = e.target.value;
        hotspotSync();
      }
    });
  });
  
  container.querySelectorAll('.point-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.idx);
      if(hotspotState.views[hotspotState.currentView]) {
        hotspotState.views[hotspotState.currentView].points.splice(idx, 1);
        hotspotSync();
      }
    });
  });
}// --- Lightbox ---
const lb = document.getElementById('photo-lightbox');
const lbImg = document.getElementById('lightbox-img');
const lbCap = document.getElementById('lightbox-caption');
function openLightbox(src, caption=''){
  if(!lb) return; lb.classList.remove('hidden'); lb.setAttribute('aria-hidden','false'); lbImg.src=src; lbCap.textContent=caption||''; document.body.style.overflow='hidden';
}
function closeLightbox(){ if(!lb) return; lb.classList.add('hidden'); lb.setAttribute('aria-hidden','true'); lbImg.removeAttribute('src'); lbCap.textContent=''; document.body.style.overflow=''; }
lb?.addEventListener('click', e=>{ if(e.target===lb) closeLightbox(); });
document.querySelector('.lb-close')?.addEventListener('click', closeLightbox);
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !lb.classList.contains('hidden')) closeLightbox(); });

// --- Brand Logo Lazy Loader (re-added) ---
function setupLogoObserver(){
  try {
    const imgs = document.querySelectorAll('img.brand-logo[data-src]');
    if(!imgs.length) return;
    // Fallback: No IntersectionObserver support
    if(typeof IntersectionObserver === 'undefined'){
      imgs.forEach(img=>{ const ds=img.getAttribute('data-src'); if(ds){ img.src=ds; img.removeAttribute('data-src'); } });
      return;
    }
    // Reuse existing observer if present
    if(window.__brandLogoObserver){ window.__brandLogoObserver.disconnect(); }
    const obs = new IntersectionObserver(entries=>{
      entries.forEach(ent=>{
        if(ent.isIntersecting){
          const el = ent.target; const ds = el.getAttribute('data-src');
          if(ds){ el.src = ds; el.removeAttribute('data-src'); }
          obs.unobserve(el);
        }
      });
    }, { rootMargin:'120px 0px 160px 0px', threshold: 0.01 });
    imgs.forEach(img=> obs.observe(img));
    window.__brandLogoObserver = obs;
  } catch(err){ console.warn('setupLogoObserver error', err); }
}

// --- Issue Card Delegated Events (media & comments) ---
// Medya butonuna tıklayınca aç/kapat + görsele tıklayınca lightbox
issuesDiv?.addEventListener('click', e => {
  const card = e.target.closest('.issue');
  if(!card) return;
  // Brand/model badge filter
  const brandBadge = e.target.closest('.badge.filter-brand');
  if(brandBadge){
    const b = brandBadge.dataset.brand; const m = brandBadge.dataset.model;
    filterBrand.value = b; fillFilterModels(); if(m){ filterModel.value = m; }
    pagination.page=1; loadIssues(); window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  // Konum badge'ine tıklayınca konum modalı aç
  const locationBadge = e.target.closest('.badge.location-badge');
  if(locationBadge){
    const issueId = locationBadge.dataset.issueId;
    if(issueId) openLocationModal(issueId);
    return;
  }
  // Medya toggle
  const toggleBtn = e.target.closest('button.toggle-photos');
  if(toggleBtn){
    const id = card.getAttribute('data-id');
    if(id) togglePhotos(card, id);
    return;
  }
  // Lightbox (yalnızca image)
  const imgEl = e.target.closest('.media-grid img');
  if(imgEl){
    const fig = imgEl.closest('figure');
    const cap = fig?.querySelector('figcaption')?.textContent || imgEl.getAttribute('alt') || '';
    openLightbox(imgEl.src, cap);
    return;
  }
  // View comments
  const commentsBtn = e.target.closest('button.view-comments');
  if(commentsBtn){ const id = card.getAttribute('data-id'); if(id) toggleComments(card, id); return; }
  // Add comment
  if(e.target.classList.contains('add-comment')){ 
    const id = card.getAttribute('data-id');
    const ta = card.querySelector('textarea.new-comment');
    if(id && ta){ const val = ta.value.trim(); if(!val){ toast('Boş yorum','warn'); return; }
      (async ()=>{ try { const res = await jfetch('/api/issues/'+id+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:val})});
        ta.value=''; const list = card.querySelector('.comments-list'); if(list && list.querySelector('.empty')) list.innerHTML=''; if(list) list.insertAdjacentHTML('beforeend', renderComment(res)); incCommentCount(card); }
        catch(err){ toast('Yorum eklenemedi','error'); } })();
    }
    return;
  }
  // Comment actions (edit/delete/save/cancel)
  if(e.target.classList.contains('comment-edit')){ const item=e.target.closest('.comment-item'); if(item) startEditComment(item); return; }
  if(e.target.classList.contains('comment-delete')){ const item=e.target.closest('.comment-item'); if(item) deleteComment(item, card); return; }
  if(e.target.classList.contains('comment-save')){ const item=e.target.closest('.comment-item'); if(item) saveEditComment(item); return; }
  if(e.target.classList.contains('comment-cancel')){ const item=e.target.closest('.comment-item'); if(item) cancelEditComment(item); return; }
  // Issue owner actions
  const issueId = card.getAttribute('data-id');
  if(!issueId) return;
  // Follow/unfollow within main list
  const fbtn = e.target.closest('.follow-btn');
  if(fbtn){
    if(!currentUser){ toast('Takip için giriş yapın','warn'); return; }
    const id = fbtn.dataset.id; if(!id) return; fbtn.disabled=true;
    (async ()=>{ try { const res = await jfetch(`/api/issues/${id}/follow`, { method:'POST' }); fbtn.textContent='Takipten Çık'; fbtn.classList.add('following','unfollow-btn'); fbtn.classList.remove('follow-btn'); toast('Takip edildi','success'); fetchUnreadNotifications(); }
      catch(err){ toast('Takip edilemedi','error'); }
      finally { fbtn.disabled=false; } })();
    return;
  }
  const unfbtn = e.target.closest('.unfollow-btn');
  if(unfbtn){
    if(!currentUser){ toast('Takipten çıkmak için giriş yapın','warn'); return; }
    const id = unfbtn.dataset.id; if(!id) return; unfbtn.disabled=true;
    (async ()=>{ try { const res = await jfetch(`/api/issues/${id}/follow`, { method:'DELETE' }); unfbtn.textContent='Takip Et'; unfbtn.classList.remove('following','unfollow-btn'); unfbtn.classList.add('follow-btn'); toast('Takipten çıkıldı','success'); fetchUnreadNotifications(); }
      catch(err){ toast('Takipten çıkılamadı','error'); }
      finally { unfbtn.disabled=false; } })();
    return;
  }
  if(e.target.classList.contains('add-solution')){
    (async ()=>{ try { const data = await jfetch('/api/issues/'+issueId); const current = data.solution||''; const next = prompt('Çözüm girin / düzenleyin:', current); if(next===null) return; const upd = await jfetch('/api/issues/'+issueId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({solution: next})}); updateIssueCard(upd); toast('Çözüm kaydedildi','success'); } catch(err){ toast('Çözüm kaydedilemedi','error'); } })();
    return;
  }
  if(e.target.classList.contains('add-service')){
    (async ()=>{ try { const data = await jfetch('/api/issues/'+issueId); const current = data.service_experience||''; const next = prompt('Servis deneyimi girin / düzenleyin:', current); if(next===null) return; const upd = await jfetch('/api/issues/'+issueId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_experience: next})}); updateIssueCard(upd); toast('Servis deneyimi kaydedildi','success'); } catch(err){ toast('Kaydedilemedi','error'); } })();
    return;
  }
  if(e.target.classList.contains('add-update')){
    updateTargetIssueId = issueId; openModal(updateModal);
    return;
  }
  // Update badge click => toggle list
  if(e.target.classList.contains('update-badge')){
    toggleUpdatesList(card, issueId);
    return;
  }
  // Update edit/delete buttons (event delegation inside updates timeline)
  if(e.target.classList.contains('u-edit')){
    const upId = e.target.getAttribute('data-update');
    const item = e.target.closest('.u-item');
    if(item && !item.classList.contains('editing')){
      const bodyEl = item.querySelector('.u-content');
      const original = bodyEl.innerText.replace(/\n+/g,'\n');
      item.dataset.original=original;
      bodyEl.innerHTML = `<textarea class='u-edit-box' style='width:100%;min-height:140px;'>${esc(original)}</textarea><div class='u-edit-actions'><button class='u-save' data-update='${upId}'>Kaydet</button><button class='u-cancel' data-update='${upId}' style='background:#555'>İptal</button></div>`;
      item.classList.add('editing');
    }
    return;
  }
  if(e.target.classList.contains('u-cancel')){
    const item = e.target.closest('.u-item'); if(!item) return; const original=item.dataset.original||''; const body=item.querySelector('.u-content'); body.innerHTML=fmt(original); item.classList.remove('editing'); delete item.dataset.original; return;
  }
  if(e.target.classList.contains('u-save')){
    const upId = e.target.getAttribute('data-update'); const item=e.target.closest('.u-item'); if(!upId||!item) return;
    const ta = item.querySelector('.u-edit-box'); if(!ta) return; const val = ta.value.trim(); if(!val){ toast('Boş olamaz','warn'); return; }
    e.target.disabled=true;
    (async ()=>{ try { const updated = await jfetch('/api/updates/'+upId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:val})}); const body=item.querySelector('.u-content'); body.innerHTML=fmt(updated.content); item.classList.remove('editing'); delete item.dataset.original; toast('Güncellendi','success'); }
      catch(err){ toast('Kaydedilemedi','error'); } finally { e.target.disabled=false; } })();
    return;
  }
  if(e.target.classList.contains('u-del')){
    const upId=e.target.getAttribute('data-update'); if(!upId) return; if(!confirm('Silinsin mi?')) return;
    const item = e.target.closest('.u-item'); if(item) item.style.opacity='.5';
    (async ()=>{ try { const res = await jfetch('/api/updates/'+upId,{method:'DELETE'}); item?.remove(); // update badge count
      const badge = card.querySelector('.update-badge'); if(badge){ const m=badge.textContent.match(/\((\d+)\)/); if(m){ const nxt=Math.max(0, parseInt(m[1],10)-1); badge.textContent=`Gelişme (${nxt})`; if(nxt===0){ // remove list if empty
          const wrap = card.querySelector('.updates-wrap'); if(wrap){ wrap.innerHTML='<div class="empty">Gelişme yok</div>'; }
        } }
      }
      toast('Silindi','success'); }
      catch(err){ if(item) item.style.opacity='1'; toast('Silinemedi','error'); } })();
    return;
  }

  if(e.target.classList.contains('toggle-status')){
    (async ()=>{ try { const data = await jfetch('/api/issues/'+issueId); const next = data.status==='open'?'resolved':'open'; const upd = await jfetch('/api/issues/'+issueId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status: next})}); updateIssueCard(upd); toast('Durum güncellendi','success'); } catch(err){ toast('Durum güncellenemedi','error'); } })();
    return;
  }
  if(e.target.classList.contains('delete')){
    if(!confirm('Silinsin mi?')) return; (async ()=>{ try { await jfetch('/api/issues/'+issueId,{method:'DELETE'}); card.remove(); toast('Silindi','success'); pagination.total = Math.max(0, pagination.total-1); updatePaginationUI(); } catch(err){ toast('Silinemedi','error'); } })();
    return;
  }
});

// Helper: replace a single issue card after PATCH
function updateIssueCard(issue){
  const card = document.querySelector(`.issue[data-id='${issue.id}']`);
  if(!card) return;
  const fresh = issueCardHTML(issue);
  // Replace preserving position
  const temp = document.createElement('div'); temp.innerHTML = fresh; const newEl = temp.firstElementChild; card.replaceWith(newEl);
  // Re-run logo lazy observer
  if(typeof setupLogoObserver==='function') setupLogoObserver();
}

// Bulk delete my issues button handler
document.getElementById('bulk-delete-my-issues')?.addEventListener('click', ()=>{
  if(!currentUser){ toast('Giriş yapın','warn'); return; }
  if(!confirm('Tüm kendi problemlerini (yorumlar & medya dahil) silmek istediğine emin misin?')) return;
  (async ()=>{
    try { const res = await jfetch('/api/my/issues',{method:'DELETE'}); toast('Silinen problem: '+res.deleted,'success'); pagination.page=1; loadIssues(); }
    catch{ toast('Toplu silme başarısız','error'); }
  })();
});
