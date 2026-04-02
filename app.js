/* ============================================================
   路特旅行社 訂單管理系統 — app.js
   解析 Klook 訂單確認信，管理旅客名單
   ============================================================ */

// ── 預載範例訂單 ────────────────────────────────────────────
const SAMPLE_BOOKING = {
  id: 1000000000001,
  bookingRef: 'AWB862233',
  tourName: 'Yehliu & Jiufen & Shifen Day Tour (Optional Tiaoshi Coast)',
  package: 'Yehliu & Jiufen & Golden Waterfall & Shifen & Shifen Waterfall Group Tour',
  dateRequest: '2026-03-23',
  timeRequest: 'NA',
  leadTitle: 'MRS',
  leadName: 'cecile mejares',
  country: 'Philippines',
  leadEmail: 'cecilemejares@yahoo.com',
  leadMobile: '63-9228220719',
  adultCount: 10,
  childCount: 1,
  activityUrl: 'https://www.klook.com/en-US/activity/93318',
  language: 'English',
  departureLocation: 'MRT Ximen Station Exit 5',
  participants: [
    { num: 1,  firstName: 'cecile',       lastName: 'mejares', dob: '1979-07-19', passport: 'P3441569B' },
    { num: 2,  firstName: 'michael',      lastName: 'catolos', dob: '1981-02-03', passport: 'P7063070A' },
    { num: 3,  firstName: 'liza',         lastName: 'catolos', dob: '1979-10-08', passport: 'P7070933A' },
    { num: 4,  firstName: 'mikko gabriel',lastName: 'catolos', dob: '2019-03-08', passport: 'P6214894C' },
    { num: 5,  firstName: 'darren',       lastName: 'torres',  dob: '1984-01-06', passport: 'P2115633C' },
    { num: 6,  firstName: 'sherry lyn',   lastName: 'torres',  dob: '1983-07-24', passport: 'P2112666C' },
    { num: 7,  firstName: 'darlene shane',lastName: 'torres',  dob: '2011-10-23', passport: 'P2112318C' },
    { num: 8,  firstName: 'faith sherlyn',lastName: 'torres',  dob: '2013-01-22', passport: 'P2112657C' },
    { num: 9,  firstName: 'rowel',        lastName: 'mejares', dob: '1978-02-10', passport: 'P6130879C' },
    { num: 10, firstName: 'lance angelo', lastName: 'mejares', dob: '2003-09-10', passport: 'P6130878C' },
    { num: 11, firstName: 'ellise hope',  lastName: 'torres',  dob: '2023-07-01', passport: 'P5706538C' }
  ]
};

// ── LocalStorage 管理 ───────────────────────────────────────
const Storage = {
  KEY: 'lute_travel_bookings_v1',

  getAll() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  save(bookings) {
    localStorage.setItem(this.KEY, JSON.stringify(bookings));
  },

  add(booking) {
    const list = this.getAll();
    if (list.find(b => b.bookingRef === booking.bookingRef)) return false;
    booking.id = Date.now();
    list.push(booking);
    this.save(list);
    return true;
  },

  remove(id) {
    this.save(this.getAll().filter(b => b.id !== id));
  }
};

// ── Klook Email Parser ──────────────────────────────────────
function parseKlookEmail(rawText) {
  // Remove surrounding quotes from CSV-style quoted lines
  const text = rawText
    .replace(/^"(.*)"$/gm, '$1')
    .replace(/^"/gm, '')
    .replace(/"$/gm, '');

  const lines = text.split('\n');

  const extract = (pattern) => {
    const m = text.match(pattern);
    return m ? m[1].trim() : '';
  };

  // ── Required: booking reference ─────────────────────────
  const bookingRef = extract(/Booking reference ID:\s*(\S+)/);
  if (!bookingRef) return null;

  // ── Tour name: standalone line just before "Package:" ───
  let tourName = '';
  const pkgLineIdx = lines.findIndex(l => /^Package:\s+/i.test(l.trim()));
  if (pkgLineIdx > 0) {
    for (let i = pkgLineIdx - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (
        line.length > 0 &&
        !line.startsWith('Klook has confirmed') &&
        !line.startsWith('Hey there') &&
        !line.startsWith('Cheers') &&
        !line.includes('@')
      ) {
        tourName = line;
        break;
      }
    }
  }
  // Fallback: from "confirmed an order for X - Y and issued"
  if (!tourName) {
    const m = text.match(/confirmed an order for (.+?) - .+? and issued/);
    if (m) tourName = m[1].trim();
  }

  const pkg        = extract(/Package:\s+(.+)/);
  const dateReq    = extract(/Date Request:\s*(\S+)/);
  const timeReq    = extract(/Time Request:\s*(\S+)/);
  const country    = extract(/Country\/region of passport:\s*(.+)/);
  const leadEmail  = extract(/Lead person email:\s*(\S+)/);
  const leadMobile = extract(/Lead person mobile:\s*(\S+)/);
  const language   = extract(/Preferred language:\s*(.+)/);
  const departure  = extract(/Departure location:\s*(.+)/);
  const actUrl     = extract(/Activity URL:\s*(\S+)/);

  // Lead participant "(MRS)cecile mejares"
  let leadTitle = '', leadName = '';
  const leadM = text.match(/Lead participant:\s*\(([^)]+)\)\s*(.+)/);
  if (leadM) { leadTitle = leadM[1].trim(); leadName = leadM[2].trim(); }

  // Participant count
  const countM = text.match(/Participant:\s*(\d+)\s*x\s*Adult(?:[^,\n]*,\s*(\d+)\s*x\s*Child)?/i);
  const adultCount = countM ? parseInt(countM[1]) : 0;
  const childCount = (countM && countM[2]) ? parseInt(countM[2]) : 0;

  // ── Individual participants ──────────────────────────────
  const pMap = {};

  for (const line of lines) {
    let m;

    m = line.match(/Participant(\d+)\s+First name:\s*(.+)/i);
    if (m) { const n = +m[1]; (pMap[n] = pMap[n] || { num: n }).firstName = m[2].trim(); }

    m = line.match(/Participant(\d+)\s+Last name:\s*(.+)/i);
    if (m) { const n = +m[1]; (pMap[n] = pMap[n] || { num: n }).lastName = m[2].trim(); }

    m = line.match(/Participant(\d+)\s+Date of birth:\s*(.+)/i);
    if (m) { const n = +m[1]; (pMap[n] = pMap[n] || { num: n }).dob = m[2].trim(); }

    m = line.match(/Participant(\d+)\s+ID number\s*\(Passport\):\s*(.+)/i);
    if (m) { const n = +m[1]; (pMap[n] = pMap[n] || { num: n }).passport = m[2].trim(); }
  }

  const participants = Object.keys(pMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map(n => pMap[n]);

  return {
    bookingRef, tourName, package: pkg,
    dateRequest: dateReq, timeRequest: timeReq,
    leadTitle, leadName, country, leadEmail, leadMobile,
    adultCount, childCount, activityUrl: actUrl,
    language, departureLocation: departure,
    participants
  };
}

// ── Helpers ─────────────────────────────────────────────────
function calcAge(dob, tourDate) {
  if (!dob || !tourDate || tourDate === 'NA') return null;
  const d = new Date(dob), t = new Date(tourDate + 'T00:00:00');
  let age = t.getFullYear() - d.getFullYear();
  const mDiff = t.getMonth() - d.getMonth();
  if (mDiff < 0 || (mDiff === 0 && t.getDate() < d.getDate())) age--;
  return age;
}

function fmtDate(ds) {
  if (!ds || ds === 'NA') return '未指定';
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getStatus(ds) {
  if (!ds || ds === 'NA') return { label: '待確認', cls: 'status-past' };
  const today = new Date(); today.setHours(0,0,0,0);
  const td = new Date(ds + 'T00:00:00');
  if (+td === +today) return { label: '今日出發 🎉', cls: 'status-today' };
  if (td > today) return { label: '即將出發', cls: 'status-upcoming' };
  return { label: '已完成', cls: 'status-past' };
}

function cap(s) {
  if (!s) return '';
  return s.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ── App State ────────────────────────────────────────────────
let searchQuery = '';
let currentBooking = null;

// ── Init ─────────────────────────────────────────────────────
function init() {
  if (Storage.getAll().length === 0) Storage.add({ ...SAMPLE_BOOKING });

  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderBookingsList();
  });

  // Import
  document.getElementById('btn-parse').addEventListener('click', handleImport);
  document.getElementById('btn-clear').addEventListener('click', () => {
    document.getElementById('email-input').value = '';
    document.getElementById('parse-result').className = 'parse-result hidden';
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-delete').addEventListener('click', deleteCurrentBooking);

  renderDashboard();
  renderBookingsList();
}

// ── Navigation ───────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(i =>
    i.classList.toggle('active', i.dataset.page === page)
  );
  document.querySelectorAll('.page').forEach(p =>
    p.classList.toggle('active', p.id === `page-${page}`)
  );
}

// ── Dashboard ────────────────────────────────────────────────
function renderDashboard() {
  const all = Storage.getAll();
  const today = new Date(); today.setHours(0,0,0,0);

  const upcoming = all.filter(b => b.dateRequest && b.dateRequest !== 'NA' &&
    new Date(b.dateRequest + 'T00:00:00') >= today);
  const totalPax = all.reduce((s, b) => s + (b.participants ? b.participants.length : 0), 0);
  const countries = new Set(all.map(b => b.country).filter(Boolean));

  document.getElementById('stat-total').textContent = all.length;
  document.getElementById('stat-upcoming').textContent = upcoming.length;
  document.getElementById('stat-participants').textContent = totalPax;
  document.getElementById('stat-countries').textContent = countries.size;

  const sorted = [...upcoming].sort((a,b) => new Date(a.dateRequest) - new Date(b.dateRequest)).slice(0, 8);
  const el = document.getElementById('upcoming-list');
  if (sorted.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎒</div><p>目前沒有即將出發的訂單</p></div>`;
  } else {
    el.innerHTML = sorted.map(bookingItemHTML).join('');
    bindBookingItemClicks(el);
  }
}

// ── Booking List ─────────────────────────────────────────────
function renderBookingsList() {
  const all = Storage.getAll();
  const q = searchQuery;

  const filtered = all.filter(b => {
    if (!q) return true;
    return (
      b.bookingRef?.toLowerCase().includes(q) ||
      b.leadName?.toLowerCase().includes(q) ||
      b.tourName?.toLowerCase().includes(q) ||
      b.country?.toLowerCase().includes(q) ||
      b.participants?.some(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.passport?.toLowerCase().includes(q)
      )
    );
  }).sort((a, b) => {
    if (!a.dateRequest || a.dateRequest === 'NA') return 1;
    if (!b.dateRequest || b.dateRequest === 'NA') return -1;
    return new Date(b.dateRequest) - new Date(a.dateRequest);
  });

  const el = document.getElementById('bookings-list');
  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>找不到符合的訂單</p></div>`;
  } else {
    el.innerHTML = filtered.map(bookingItemHTML).join('');
    bindBookingItemClicks(el);
  }
}

function bookingItemHTML(b) {
  const status = getStatus(b.dateRequest);
  const total = (b.adultCount || 0) + (b.childCount || 0);
  return `
    <div class="booking-item" data-id="${b.id}">
      <div class="booking-ref">${b.bookingRef}</div>
      <div class="booking-info">
        <div class="booking-tour">${b.tourName || '未知行程'}</div>
        <div class="booking-meta">
          <span>👤 ${cap(b.leadName) || '-'}</span>
          <span>🌍 ${b.country || '-'}</span>
          <span>🗣 ${b.language || '-'}</span>
          <span>📍 ${b.departureLocation || '-'}</span>
        </div>
      </div>
      <div class="booking-right">
        <div class="booking-date">${fmtDate(b.dateRequest)}</div>
        <div class="booking-count">成人 ${b.adultCount || 0} + 兒童 ${b.childCount || 0} = ${total} 人</div>
        <span class="status-badge ${status.cls}">${status.label}</span>
      </div>
    </div>`;
}

function bindBookingItemClicks(container) {
  container.querySelectorAll('.booking-item').forEach(el => {
    el.addEventListener('click', () => showDetail(parseInt(el.dataset.id)));
  });
}

// ── Booking Detail Modal ─────────────────────────────────────
function showDetail(id) {
  const b = Storage.getAll().find(x => x.id === id);
  if (!b) return;
  currentBooking = b;

  const status = getStatus(b.dateRequest);
  document.getElementById('modal-title').textContent = `訂單 ${b.bookingRef}`;
  document.getElementById('modal-subtitle').textContent =
    `${b.tourName || ''}${b.package ? ' — ' + b.package : ''}`;

  document.getElementById('modal-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-section">
        <div class="detail-section-title">行程資訊</div>
        <div class="detail-item">
          <span class="detail-label">行程名稱</span>
          <span class="detail-value">${b.tourName || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">套裝選項</span>
          <span class="detail-value">${b.package || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">出發日期</span>
          <span class="detail-value">${fmtDate(b.dateRequest)} <span class="status-badge ${status.cls}">${status.label}</span></span>
        </div>
        <div class="detail-item">
          <span class="detail-label">出發時間</span>
          <span class="detail-value">${b.timeRequest && b.timeRequest !== 'NA' ? b.timeRequest : '未指定'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">集合地點</span>
          <span class="detail-value">${b.departureLocation || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">導覽語言</span>
          <span class="detail-value">${b.language || '-'}</span>
        </div>
        ${b.activityUrl ? `<div class="detail-item">
          <span class="detail-label">Klook 連結</span>
          <span class="detail-value"><a href="${b.activityUrl}" target="_blank">查看活動頁面 ↗</a></span>
        </div>` : ''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">主訂人資訊</div>
        <div class="detail-item">
          <span class="detail-label">姓名</span>
          <span class="detail-value">${b.leadTitle ? `(${b.leadTitle}) ` : ''}${cap(b.leadName) || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">護照國籍</span>
          <span class="detail-value">${b.country || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Email</span>
          <span class="detail-value"><a href="mailto:${b.leadEmail}">${b.leadEmail || '-'}</a></span>
        </div>
        <div class="detail-item">
          <span class="detail-label">電話</span>
          <span class="detail-value">${b.leadMobile || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">成人人數</span>
          <span class="detail-value">${b.adultCount || 0} 位</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">兒童人數</span>
          <span class="detail-value">${b.childCount || 0} 位</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">總人數</span>
          <span class="detail-value"><strong>${(b.adultCount || 0) + (b.childCount || 0)} 位</strong></span>
        </div>
      </div>
    </div>

    <div class="participants-section">
      <div class="participants-header">
        <h3>旅客名單 (${b.participants ? b.participants.length : 0} 人)</h3>
      </div>
      ${renderParticipants(b)}
    </div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function renderParticipants(b) {
  if (!b.participants || b.participants.length === 0) {
    return '<p style="color:var(--text-muted);font-size:13px">無旅客資料</p>';
  }

  const rows = b.participants.map(p => {
    const age = calcAge(p.dob, b.dateRequest);
    let badge = '';
    if (age !== null) {
      if (age < 3) badge = `<span class="age-badge age-infant">${age} 歲・嬰兒</span>`;
      else if (age < 12) badge = `<span class="age-badge age-child">${age} 歲・兒童</span>`;
      else badge = `<span class="age-badge age-adult">${age} 歲・成人</span>`;
    }
    return `<tr>
      <td style="color:var(--text-muted);font-weight:600">${p.num}</td>
      <td class="name-cell"><strong>${cap(p.firstName)} ${cap(p.lastName)}</strong></td>
      <td>${p.dob || '-'}</td>
      <td>${badge || '-'}</td>
      <td class="passport-num">${p.passport || '-'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="table-wrapper">
      <table class="participants-table">
        <thead>
          <tr>
            <th>#</th>
            <th>姓名</th>
            <th>出生日期</th>
            <th>出遊時年齡</th>
            <th>護照號碼</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  currentBooking = null;
}

// ── Delete Booking ───────────────────────────────────────────
function deleteCurrentBooking() {
  if (!currentBooking) return;
  if (!confirm(`確定要刪除訂單 ${currentBooking.bookingRef}？此操作無法復原。`)) return;
  Storage.remove(currentBooking.id);
  showToast(`✓ 訂單 ${currentBooking.bookingRef} 已刪除`);
  closeModal();
  renderDashboard();
  renderBookingsList();
}

// ── Import ───────────────────────────────────────────────────
function handleImport() {
  const text = document.getElementById('email-input').value.trim();
  const resultEl = document.getElementById('parse-result');

  if (!text) {
    resultEl.className = 'parse-result error';
    resultEl.textContent = '❌ 請先貼上 Klook 訂單確認信內容';
    return;
  }

  const booking = parseKlookEmail(text);

  if (!booking || !booking.bookingRef) {
    resultEl.className = 'parse-result error';
    resultEl.textContent = '❌ 無法解析訂單資料。請確認貼上完整的 Klook 訂單確認信，且包含「Booking reference ID:」欄位。';
    return;
  }

  const added = Storage.add(booking);
  if (!added) {
    resultEl.className = 'parse-result error';
    resultEl.textContent = `⚠️ 訂單 ${booking.bookingRef} 已存在，無法重複匯入。`;
    return;
  }

  resultEl.className = 'parse-result success';
  resultEl.textContent =
    `✅ 成功匯入訂單 ${booking.bookingRef}！` +
    `共 ${booking.participants.length} 位旅客，` +
    `出發日期：${fmtDate(booking.dateRequest)}，` +
    `集合地點：${booking.departureLocation || '未指定'}`;

  document.getElementById('email-input').value = '';
  renderDashboard();
  renderBookingsList();
  showToast(`✓ 訂單 ${booking.bookingRef} 匯入成功！`);
}

// ── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  if (!currentBooking) return;
  const b = currentBooking;

  const csvRows = [
    ['訂單編號', b.bookingRef],
    ['行程名稱', b.tourName],
    ['套裝選項', b.package],
    ['出發日期', b.dateRequest],
    ['出發時間', b.timeRequest],
    ['集合地點', b.departureLocation],
    ['導覽語言', b.language],
    ['主訂人', `${b.leadTitle || ''} ${cap(b.leadName)}`.trim()],
    ['主訂人國籍', b.country],
    ['聯絡 Email', b.leadEmail],
    ['聯絡電話', b.leadMobile],
    ['成人人數', b.adultCount],
    ['兒童人數', b.childCount],
    [],
    ['#', '名字', '姓氏', '出生日期', '出遊年齡', '護照號碼']
  ];

  (b.participants || []).forEach(p => {
    const age = calcAge(p.dob, b.dateRequest);
    csvRows.push([
      p.num,
      cap(p.firstName),
      cap(p.lastName),
      p.dob || '',
      age !== null ? age : '',
      p.passport || ''
    ]);
  });

  const csv = csvRows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${b.bookingRef}_旅客名單.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ CSV 已下載');
}

// ── Start ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
