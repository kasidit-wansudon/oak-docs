// Oak Docs — Realtime Google Drive reader
// Fetches file list and content directly from a public Google Drive folder.
// No build step needed. Add .md files to Drive → refresh → done.

const DRIVE_FOLDER_ID = '1udV9C2PrFeoNOjbr59MfR0VSDUmDGcIU';
const DRIVE_API_KEY = 'AIzaSyB4wm_ZRYhXO83EBAUo51wTSHJTY4CCrks';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

// SVG icon templates
const ICONS = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  lightbulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
};

// State
let currentDoc = null;
let DOCS = [];
let contentCache = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initMobileMenu();
  initScrollTop();
  setupMarkedRenderer();
  await loadFileList();

  // Load from URL hash
  const hash = window.location.hash.slice(1);
  if (hash) {
    const doc = DOCS.find(d => d.id === hash);
    if (doc) loadDoc(doc);
  }
});

// Fetch file list from Google Drive API
async function loadFileList() {
  const nav = document.getElementById('navList');
  nav.innerHTML = '<div class="loading">กำลังโหลดรายการ</div>';

  try {
    const url = DRIVE_API
      + '?q=%27' + DRIVE_FOLDER_ID + '%27+in+parents'
      + '&fields=files(id,name,mimeType,modifiedTime,size)'
      + '&orderBy=name'
      + '&pageSize=100'
      + '&key=' + DRIVE_API_KEY;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error('API error: ' + resp.status);

    const data = await resp.json();
    const files = (data.files || []).filter(f => f.name.endsWith('.md'));

    DOCS = files.map(f => ({
      id: f.name.replace('.md', ''),
      driveId: f.id,
      title: generateTitle(f.name),
      icon: assignIcon(f.name),
      modified: f.modifiedTime
    }));

    buildNav();
  } catch (err) {
    console.error('Failed to load file list:', err);
    nav.innerHTML = '<div style="padding:1rem;color:var(--color-text-muted);font-size:var(--text-sm)">'
      + 'ไม่สามารถโหลดรายการไฟล์ได้<br><small>' + err.message + '</small></div>';
  }
}

// Generate human-readable title from filename
function generateTitle(filename) {
  var name = filename.replace('.md', '').replace(/-/g, ' ').replace(/_/g, ' ');
  var words = name.split(' ');
  var skip = ['and','or','the','a','an','in','of','for','to','with'];
  return words.map(function(w, i) {
    if (skip.indexOf(w.toLowerCase()) !== -1 && i > 0) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

// Assign icon based on filename
function assignIcon(filename) {
  var fn = filename.toLowerCase();
  if (fn.indexOf('readme') !== -1 && (fn.indexOf('guide') !== -1 || fn.indexOf('remote') !== -1)) return 'globe';
  if (fn.indexOf('readme') !== -1) return 'book';
  if (fn.indexOf('spending') !== -1) return 'money';
  if (fn.indexOf('financial') !== -1 || fn.indexOf('income') !== -1 || fn.indexOf('debt') !== -1) return 'trending';
  if (fn.indexOf('plan') !== -1 && fn.indexOf('workout') === -1) return 'calendar';
  if (fn.indexOf('stability') !== -1 || fn.indexOf('security') !== -1) return 'shield';
  if (fn.indexOf('business') !== -1 || fn.indexOf('knowledge') !== -1) return 'lightbulb';
  if (fn.indexOf('workout') !== -1 || fn.indexOf('health') !== -1 || fn.indexOf('fitness') !== -1) return 'heart';
  if (fn.indexOf('research') !== -1) return 'chart';
  if (fn.indexOf('guide') !== -1 || fn.indexOf('remote') !== -1) return 'globe';
  return 'file';
}

// Configure marked.js
function setupMarkedRenderer() {
  marked.setOptions({ breaks: true, gfm: true });
  marked.use({
    renderer: {
      table: function(token) {
        var headerRow = '<thead><tr>';
        token.header.forEach(function(cell) {
          var align = cell.align ? ' style="text-align:' + cell.align + '"' : '';
          headerRow += '<th' + align + '>' + this.parser.parseInline(cell.tokens) + '</th>';
        }.bind(this));
        headerRow += '</tr></thead>';
        var bodyRows = '<tbody>';
        token.rows.forEach(function(row) {
          bodyRows += '<tr>';
          row.forEach(function(cell) {
            var align = cell.align ? ' style="text-align:' + cell.align + '"' : '';
            bodyRows += '<td' + align + '>' + this.parser.parseInline(cell.tokens) + '</td>';
          }.bind(this));
          bodyRows += '</tr>';
        }.bind(this));
        bodyRows += '</tbody>';
        return '<div class="table-wrapper"><table>' + headerRow + bodyRows + '</table></div>';
      }
    }
  });
}

// Build sidebar navigation
function buildNav() {
  var nav = document.getElementById('navList');
  nav.innerHTML = '';

  if (DOCS.length === 0) {
    nav.innerHTML = '<div style="padding:1rem;color:var(--color-text-muted);font-size:var(--text-sm)">ไม่พบเอกสาร</div>';
    return;
  }

  DOCS.forEach(function(doc) {
    var btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.id = doc.id;
    var icon = ICONS[doc.icon] || ICONS.file;
    btn.innerHTML = icon + '<span>' + doc.title + '</span>';
    btn.addEventListener('click', function() {
      loadDoc(doc);
      closeMobileMenu();
    });
    nav.appendChild(btn);
  });
}

// Load document content from Google Drive
async function loadDoc(doc) {
  if (currentDoc === doc.id) return;
  currentDoc = doc.id;

  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.id === doc.id);
  });

  window.location.hash = doc.id;

  var body = document.getElementById('markdownBody');
  body.innerHTML = '<div class="loading">กำลังโหลด</div>';

  try {
    // Check cache first
    if (contentCache[doc.driveId]) {
      body.innerHTML = marked.parse(contentCache[doc.driveId]);
      body.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Fetch content from Google Drive API
    var url = DRIVE_API + '/' + doc.driveId + '?alt=media&key=' + DRIVE_API_KEY;
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to load: ' + resp.status);
    var md = await resp.text();

    // Cache it
    contentCache[doc.driveId] = md;

    body.innerHTML = marked.parse(md);
    body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    body.innerHTML = '<div class="welcome"><h1>ไม่สามารถโหลดเอกสารได้</h1><p>' + err.message + '</p></div>';
  }
}

// Theme toggle
function initThemeToggle() {
  var toggles = document.querySelectorAll('[data-theme-toggle]');
  var theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  updateToggleIcons(theme);

  toggles.forEach(function(toggle) {
    toggle.addEventListener('click', function() {
      theme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateToggleIcons(theme);
    });
  });
}

function updateToggleIcons(theme) {
  var sun = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  var moon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  document.querySelectorAll('[data-theme-toggle]').forEach(function(t) {
    t.innerHTML = theme === 'dark' ? sun : moon;
    t.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
  });
}

// Mobile menu
function initMobileMenu() {
  var toggle = document.getElementById('menuToggle');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');

  toggle.addEventListener('click', function() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });

  overlay.addEventListener('click', closeMobileMenu);
}

function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// Scroll to top
function initScrollTop() {
  var btn = document.createElement('button');
  btn.className = 'scroll-top';
  btn.setAttribute('aria-label', 'Scroll to top');
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>';
  btn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.body.appendChild(btn);

  window.addEventListener('scroll', function() {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
}
