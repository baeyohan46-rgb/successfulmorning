import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where,
  onSnapshot, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ================= 기본 설정 ================= */
const WINDOW_BEFORE = 90;   // 목표 90분 전부터 인증 가능 (firestore.rules와 같아야 함)
const WINDOW_AFTER = 10;    // 목표 10분 후까지 인증 가능 (지각으로 기록)
const PHOTO_MAX = 720;      // 인증 사진 긴 변 최대 픽셀 (작게 줄여서 무료 한도 안에서 저장)
const GOAL_MIN = 240, GOAL_MAX = 660; // 04:00 ~ 11:00
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const $app = document.getElementById('app');
const configMissing = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes('여기에');

/* ================= 아이콘 ================= */
const svg = (d, size = 22, stroke = 'currentColor', w = 2.2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const P = {
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"></path><circle cx="12" cy="13.5" r="3.5"></circle>',
  x: '<path d="M6 6l12 12M18 6L6 18"></path>',
  chart: '<path d="M6 20V10M12 20V4M18 20v-7"></path>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"></path><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"></rect><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S9 8 12 8zM12 8c2-4 6-4 6-1.5S15 8 12 8z"></path>'
};
const LOGO = `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="20" r="7" fill="#F26B3A"></circle><path d="M4 26h24M16 6v4M6.5 10.5l2.8 2.8M25.5 10.5l-2.8 2.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"></path></svg>`;
const GOOGLE = `<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/* ================= 시간 도우미 (한국 시간 기준) ================= */
function kst(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  return {
    y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(),
    h: k.getUTCHours(), min: k.getUTCMinutes(), wd: k.getUTCDay()
  };
}
const keyOf = (t) => t.y * 10000 + t.m * 100 + t.d;
const ymOf = (t) => t.y * 100 + t.m;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const parseTime = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
function shiftKey(key, days) {
  const y = Math.floor(key / 10000), m = Math.floor(key / 100) % 100, d = key % 100;
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}
function prevYm(ym) { const y = Math.floor(ym / 100), m = ym % 100; return m === 1 ? (y - 1) * 100 + 12 : ym - 1; }
const ymLabel = (ym) => `${ym % 100}월`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= 상태 ================= */
const S = {
  authReady: false,
  user: null,
  profile: undefined,   // undefined: 불러오는 중, null: 아직 가입 안 함
  isAdmin: false,
  users: {},
  month: [],            // 이번 달 모든 사람의 인증
  mine: [],             // 내 모든 인증
  prev: [],             // 지난달 모든 사람의 인증
  prize: '', prevPrize: '',
  photos: [],           // 오늘 모든 사람의 인증 사진
  preview: null,        // 찍은 사진 미리보기 (dataURL)
  viewPhoto: null,      // 크게 보는 사진
  tab: 'today',
  busy: false,
  loadError: false
};
let unsubs = [];
let ym0 = ymOf(kst());
let day0 = keyOf(kst());

/* ================= Firebase ================= */
let auth, db;
if (!configMissing) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    stopListening();
    S.user = user;
    S.authReady = true;
    S.profile = undefined;
    if (user) startListening(user.uid);
    render();
  });
} else {
  render();
}

const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
const onErr = (e) => { console.error(e); S.loadError = true; render(); };

function startListening(uid) {
  ym0 = ymOf(kst());
  day0 = keyOf(kst());
  const loadTimer = setTimeout(() => { if (S.profile === undefined) { S.loadError = true; render(); } }, 10000);

  unsubs.push(onSnapshot(doc(db, 'users', uid), (snap) => {
    clearTimeout(loadTimer);
    S.loadError = false;
    S.profile = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null;
    render();
  }, onErr));

  unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
    const map = {};
    snap.docs.forEach((d) => { map[d.id] = d.data({ serverTimestamps: 'estimate' }); });
    S.users = map; render();
  }, onErr));

  unsubs.push(onSnapshot(query(collection(db, 'checkins'), where('ym', '==', ym0)), (snap) => {
    S.month = rows(snap); render();
  }, onErr));

  unsubs.push(onSnapshot(query(collection(db, 'checkins'), where('uid', '==', uid)), (snap) => {
    S.mine = rows(snap); render();
  }, onErr));

  unsubs.push(onSnapshot(query(collection(db, 'photos'), where('day', '==', day0)), (snap) => {
    S.photos = rows(snap); render();
  }, onErr));

  unsubs.push(onSnapshot(doc(db, 'prizes', String(ym0)), (snap) => {
    S.prize = snap.exists() ? (snap.data().text || '') : ''; render();
  }, onErr));

  const pym = prevYm(ym0);
  getDocs(query(collection(db, 'checkins'), where('ym', '==', pym)))
    .then((snap) => { S.prev = rows(snap); render(); }).catch(console.error);
  getDoc(doc(db, 'prizes', String(pym)))
    .then((snap) => { S.prevPrize = snap.exists() ? (snap.data().text || '') : ''; render(); }).catch(console.error);
  getDoc(doc(db, 'admins', uid))
    .then((snap) => { S.isAdmin = snap.exists(); render(); }).catch(() => {});
}

function stopListening() {
  unsubs.forEach((u) => u());
  unsubs = [];
  Object.assign(S, { users: {}, month: [], mine: [], prev: [], photos: [], prize: '', prevPrize: '', isAdmin: false, loadError: false });
}

/* ================= 계산 ================= */
function effectiveGoal(p, todayKey) {
  return todayKey >= (p.nextFrom || 0) ? p.nextGoalMin : p.goalMin;
}
function minutesOf(c) {
  const at = c.at && typeof c.at.toDate === 'function' ? c.at.toDate() : new Date();
  const t = kst(at);
  return t.h * 60 + t.min;
}
function statusOf(c) {
  const m = minutesOf(c);
  return { minutes: m, late: m > c.goalMin, diff: c.goalMin - m };
}

function ranking(checkins, ym) {
  const table = {};
  Object.keys(S.users).forEach((uid) => { table[uid] = { uid, s: 0, l: 0, early: 0 }; });
  checkins.forEach((c) => {
    if (c.ym !== ym) return;
    const r = table[c.uid] || (table[c.uid] = { uid: c.uid, s: 0, l: 0, early: 0 });
    const st = statusOf(c);
    if (st.late) r.l++; else { r.s++; r.early += st.diff; }
  });
  const list = Object.values(table)
    .filter((r) => S.users[r.uid])
    .map((r) => ({ ...r, avgEarly: r.s ? r.early / r.s : 0, name: S.users[r.uid].nickname }));
  list.sort((a, b) => b.s - a.s || b.avgEarly - a.avgEarly || a.l - b.l || a.name.localeCompare(b.name));
  return list.map((r, i) => ({ ...r, rank: i + 1 }));
}

function streakOf(mine, todayKey) {
  const ok = new Set(mine.filter((c) => !statusOf(c).late).map((c) => c.day));
  let k = ok.has(todayKey) ? todayKey : shiftKey(todayKey, -1);
  let n = 0;
  while (ok.has(k)) { n++; k = shiftKey(k, -1); }
  return n;
}

/* ================= 화면 그리기 ================= */
function render() {
  // 입력 중이면 다시 그리지 않음 (타이핑 방해 방지)
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'file' && $app.contains(a)) return;

  if (configMissing) return void ($app.innerHTML = viewSetup());
  if (!S.authReady) return void ($app.innerHTML = '<div class="boot">불러오는 중…</div>');
  if (!S.user) return void ($app.innerHTML = viewLogin());
  if (S.profile === undefined) {
    return void ($app.innerHTML = S.loadError
      ? `<div class="boot"><div style="text-align:center;display:flex;flex-direction:column;gap:16px;align-items:center"><p>데이터를 불러오지 못했어요. 인터넷 연결이나 Firebase 설정을 확인해 주세요.</p><button class="btn-ghost" data-action="logout">로그아웃</button></div></div>`
      : '<div class="boot">불러오는 중…</div>');
  }
  if (S.profile === null) return void ($app.innerHTML = viewJoin());

  const body = { today: viewToday, rank: viewRank, king: viewKing, settings: viewSettings }[S.tab]();
  $app.innerHTML = viewHeader() + `<main class="page">${body}</main>` + viewPhotoOverlay();
}

function viewSetup() {
  return `<div class="auth"><div>${LOGO}</div><h1>설정이 필요해요</h1>
    <p>firebase-config.js 파일에 Firebase 설정값을 붙여넣어 주세요.<br>방법은 함께 드린 README.md에 있어요.</p></div>`;
}

function viewLogin() {
  const inKakao = /KAKAOTALK/i.test(navigator.userAgent);
  const inApp = inKakao || /Instagram|FBAN|FBAV|Line\/|NAVER\(inapp/i.test(navigator.userAgent);
  const external = inKakao
    ? `<a class="btn-google" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">외부 브라우저로 열기</a>`
    : '';
  return `<div class="auth">
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="72" r="28" fill="#F26B3A"></circle><circle cx="60" cy="72" r="44" fill="none" stroke="#F26B3A" stroke-opacity=".35" stroke-width="2"></circle><path d="M8 100h104" stroke="#FFF8F1" stroke-width="3" stroke-linecap="round"></path></svg>
    <h1>기상 챌린지</h1>
    <p>내가 정한 시간에 일어나고, 버튼 하나로 인증하고,<br>한 달 동안 가장 꾸준했던 사람이 기상왕이 돼요.</p>
    ${inApp ? `<div class="notice">앱 안의 브라우저에서는 구글 로그인이 막혀 있어요. 크롬이나 사파리에서 열어 주세요.</div>${external}` : ''}
    <button class="btn-google" data-action="login">${GOOGLE} 구글로 시작하기</button>
  </div>`;
}

function viewJoin() {
  const name = (S.user.displayName || '').slice(0, 12);
  return `<div class="join-wrap"><div class="join card">
    <div style="margin-bottom:20px">${LOGO}</div>
    <h1>반가워요!</h1>
    <p class="muted" style="margin:0 0 24px">챌린지에서 쓸 이름과 목표 기상 시간을 정해 주세요.</p>
    <form class="form" data-form="join">
      <div class="field"><label for="nick">닉네임</label>
        <input class="input" id="nick" name="nickname" maxlength="12" required value="${esc(name)}" autocomplete="nickname"></div>
      <div class="field"><label for="goal">목표 기상 시간</label>
        <input class="input num" id="goal" name="goal" type="time" min="04:00" max="11:00" step="300" required value="06:30">
        <span class="hint">04:00 ~ 11:00 사이. 목표 ${WINDOW_BEFORE}분 전부터 ${WINDOW_AFTER}분 후까지 인증할 수 있어요.</span></div>
      <button class="btn-dark" type="submit" ${S.busy ? 'disabled' : ''}>챌린지 시작하기</button>
      <button class="btn-ghost" type="button" data-action="logout">다른 계정으로 로그인</button>
    </form>
  </div></div>`;
}

function viewHeader() {
  const tabs = [
    ['today', '오늘', P.sun], ['rank', '랭킹', P.chart], ['king', '기상왕', P.trophy], ['settings', '내 설정', P.user]
  ];
  const nick = S.profile.nickname;
  return `<header class="header">
    <a class="logo" href="#" data-action="tab" data-tab="today">${LOGO} 기상 챌린지</a>
    <nav class="tabs" aria-label="메뉴">${tabs.map(([id, label, icon]) =>
      `<button class="tab" data-action="tab" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${svg(icon, 22, 'currentColor', 2)}${label}</button>`).join('')}
    </nav>
    <div class="me"><div class="avatar">${esc([...nick][0] || '?')}</div><span class="name">${esc(nick)}</span></div>
  </header>`;
}

function viewToday() {
  const now = kst();
  const today = keyOf(now);
  const nowMin = now.h * 60 + now.min;
  const p = S.profile;
  const goal = effectiveGoal(p, today);
  const mineToday = S.mine.find((c) => c.day === today);
  const streak = streakOf(S.mine, today);
  const monthMine = S.mine.filter((c) => c.ym === ym0);
  const success = monthMine.filter((c) => !statusOf(c).late).length;
  const rank = ranking(S.month, ym0);
  const myRank = rank.find((r) => r.uid === S.user.uid);
  const greet = now.h < 12 ? '좋은 아침이에요' : now.h < 18 ? '좋은 오후예요' : '좋은 저녁이에요';

  let action;
  if (mineToday) {
    const st = statusOf(mineToday);
    const myPhoto = S.photos.find((ph) => ph.uid === S.user.uid);
    const thumb = myPhoto ? `<button class="thumb" data-action="view-photo" data-id="${esc(myPhoto.id)}" aria-label="내 인증 사진 크게 보기"><img src="${esc(myPhoto.img)}" alt=""></button>` : '';
    action = st.late
      ? `<div class="status" role="status">${thumb || `<div class="dot late">${svg(P.clock, 22, '#9A3412', 2.6)}</div>`}<div><strong>${fmt(st.minutes)} 기상 인증 완료</strong><span>목표보다 ${-st.diff}분 늦어서 지각으로 기록됐어요</span></div></div>`
      : `<div class="status" role="status">${thumb || `<div class="dot">${svg(P.check, 22, '#1D1B2E', 3)}</div>`}<div><strong>${fmt(st.minutes)} 기상 인증 완료!</strong><span>${st.diff > 0 ? `목표보다 ${st.diff}분 일찍` : '목표 시간 딱 맞춰'} · ${streak}일 연속 성공 중</span></div></div>`;
  } else if (nowMin < goal - WINDOW_BEFORE) {
    action = `<div class="status"><div class="dot wait">${svg(P.clock, 22, '#FFB08F', 2.4)}</div><div><strong>${fmt(goal - WINDOW_BEFORE)}부터 인증할 수 있어요</strong><span>푹 자고 일어나서 만나요</span></div></div>`;
  } else if (nowMin <= goal + WINDOW_AFTER) {
    action = S.preview
      ? `<div class="preview">
          <img src="${S.preview}" alt="찍은 인증 사진 미리보기">
          <div class="preview-actions">
            <button class="btn-sun" data-action="confirm-checkin" ${S.busy ? 'disabled' : ''}>${svg(P.check, 22, 'currentColor', 2.6)} ${S.busy ? '올리는 중…' : '이 사진으로 인증하기'}</button>
            <label class="btn-retake" for="cam">다시 찍기</label>
          </div>
        </div>
        <input id="cam" class="sr-only" type="file" accept="image/*" capture="environment" data-action-change="photo">`
      : `<label class="btn-sun" for="cam" role="button" tabindex="0">${svg(P.camera, 22, 'currentColor', 2.2)} 물 뜨는 사진 찍고 인증하기</label>
        <input id="cam" class="sr-only" type="file" accept="image/*" capture="environment" data-action-change="photo">
        <span class="hero-hint">일어나서 물 한 잔 뜨는 모습을 찍어 주세요 · ${fmt(goal + WINDOW_AFTER)}까지</span>`;
  } else {
    action = `<div class="status"><div class="dot wait">${svg(P.clock, 22, '#FFB08F', 2.4)}</div><div><strong>오늘 인증 시간이 지났어요</strong><span>내일은 ${fmt(goal)}에 만나요!</span></div></div>`;
  }

  return `
  <section class="row">
    <div class="hero grow">
      <svg class="deco" viewBox="0 0 260 260" aria-hidden="true"><circle cx="130" cy="130" r="64" fill="#F26B3A"></circle><circle cx="130" cy="130" r="100" fill="none" stroke="#F26B3A" stroke-opacity=".35" stroke-width="2"></circle><circle cx="130" cy="130" r="128" fill="none" stroke="#F26B3A" stroke-opacity=".18" stroke-width="2"></circle></svg>
      <div><div class="hero-date">${now.m}월 ${now.d}일 ${WEEKDAYS[now.wd]}요일</div>
        <h1>${greet},<br>${esc(p.nickname)}님</h1></div>
      <div class="goal-row">
        <div><div class="label">오늘 목표 기상 시간</div><div class="big num">${fmt(goal)}</div></div>
        <div><div class="label">인증 가능 시간</div><div class="big num peach">~${fmt(goal + WINDOW_AFTER)}</div></div>
      </div>
      ${action}
    </div>
    <div class="side stats">
      <div class="stat"><div class="label">연속 성공</div><div class="value"><b class="sun">${streak}</b><span style="font-weight:700">일째</span></div></div>
      <div class="stat"><div class="label">${now.m}월 성공</div><div class="value"><b>${success}</b><span class="muted">/ ${now.d}일</span></div></div>
      <div class="stat"><div class="label">현재 순위</div><div class="value"><b>${myRank ? myRank.rank : '-'}</b><span style="font-weight:700">위</span><span class="muted">/ ${rank.length}명</span></div></div>
    </div>
  </section>
  ${viewFeed()}
  <section class="row">
    <div class="card grow">${viewCalendar(now)}</div>
    <div class="card side">
      <div class="card-head"><h2>${now.m}월 랭킹</h2><button class="btn-ghost" data-action="tab" data-tab="rank">전체 보기</button></div>
      ${viewRankList(rank.slice(0, 5), now.d)}
    </div>
  </section>
  ${viewReward(now)}`;
}

function viewFeed() {
  const items = S.photos
    .filter((ph) => S.users[ph.uid])
    .map((ph) => {
      const c = S.month.find((x) => x.uid === ph.uid && x.day === ph.day);
      const st = c ? statusOf(c) : null;
      return { ...ph, name: S.users[ph.uid].nickname, minutes: st ? st.minutes : 9999, late: st ? st.late : false };
    })
    .sort((a, b) => a.minutes - b.minutes);
  return `<section class="card">
    <div class="card-head"><h2>오늘의 기상 인증</h2><span class="chip">${items.length}명 인증</span></div>
    ${items.length ? `<div class="feed">${items.map((it) => `
      <button class="feed-item" data-action="view-photo" data-id="${esc(it.id)}" aria-label="${esc(it.name)}님 인증 사진 크게 보기">
        <img src="${esc(it.img)}" alt="" loading="lazy">
        <span class="feed-cap"><b>${esc(it.name)}</b><span class="num">${it.minutes < 9999 ? fmt(it.minutes) : ''}${it.late ? ' · 지각' : ''}</span></span>
      </button>`).join('')}</div>`
      : '<p class="empty">아직 오늘 인증한 사람이 없어요. 첫 번째로 일어나 보세요!</p>'}
  </section>`;
}

function viewPhotoOverlay() {
  if (!S.viewPhoto) return '';
  const ph = S.photos.find((x) => x.id === S.viewPhoto);
  if (!ph) return '';
  const name = S.users[ph.uid] ? S.users[ph.uid].nickname : '';
  return `<div class="overlay" data-action="close-photo">
    <figure class="overlay-box">
      <img src="${esc(ph.img)}" alt="${esc(name)}님의 오늘 인증 사진">
      <figcaption>${esc(name)}님의 오늘 인증</figcaption>
    </figure>
    <button class="overlay-close" data-action="close-photo" aria-label="닫기">${svg(P.x, 24, '#FFF8F1', 2.4)}</button>
  </div>`;
}

function viewCalendar(now) {
  const byDay = {};
  S.mine.filter((c) => c.ym === ym0).forEach((c) => { byDay[c.day] = c; });
  const first = new Date(Date.UTC(now.y, now.m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(now.y, now.m, 0)).getUTCDate();
  const joined = S.profile.joinedAt && S.profile.joinedAt.toDate ? keyOf(kst(S.profile.joinedAt.toDate())) : 0;
  const today = keyOf(now);
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cell blank"></div>';
  for (let d = 1; d <= days; d++) {
    const k = now.y * 10000 + now.m * 100 + d;
    const c = byDay[k];
    let cls = '', sub = '';
    if (c) { const st = statusOf(c); cls = st.late ? 'l' : 's'; sub = fmt(st.minutes); }
    else if (k === today) { cls = 'today'; sub = '오늘'; }
    else if (k < today && k >= joined) { cls = 'm'; sub = '—'; }
    cells += `<div class="cell ${cls}"><span>${d}</span><small>${sub}</small></div>`;
  }
  return `<div class="card-head"><h2>${now.m}월 기상 기록</h2>
      <div class="legend"><span><i style="background:#F26B3A"></i>성공</span><span><i style="background:#FFD9C7"></i>지각</span><span><i style="background:#E7E3EE"></i>실패</span></div></div>
    <div class="cal">${WEEKDAYS.map((w) => `<div class="wd">${w}</div>`).join('')}${cells}</div>`;
}

function viewRankList(list, totalDays) {
  if (!list.length) return '<p class="empty">아직 참가자가 없어요.</p>';
  return `<ol class="rank-list">${list.map((r) => `
    <li class="rank-item ${r.uid === S.user.uid ? 'me' : ''}">
      <div class="rank-top">
        <span class="badge ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank}</span>
        <span class="rank-name">${esc(r.name)}${r.uid === S.user.uid ? ' (나)' : ''}</span>
        <span class="rank-days">${r.s}일</span>
      </div>
      <div class="bar"><div style="width:${Math.min(100, Math.round(r.s / Math.max(1, totalDays) * 100))}%"></div></div>
    </li>`).join('')}</ol>`;
}

function viewReward(now) {
  return `<section class="reward">
    <div class="reward-l"><div class="icon-box">${svg(P.trophy, 36, '#F26B3A', 2)}</div>
      <div><div class="k">${now.m}월 기상왕 보상</div><div class="v">${esc(S.prize) || '상품 준비 중'}</div>
      <div class="muted" style="font-size:14px">다음 달 1일, 기상왕 탭에서 발표돼요</div></div></div>
    <button class="btn-dark" data-action="tab" data-tab="king">기상왕 보러 가기</button>
  </section>`;
}

function viewRank() {
  const now = kst();
  const rank = ranking(S.month, ym0);
  return `<section class="card">
    <div class="card-head"><h2>${now.m}월 전체 랭킹</h2><span class="chip">성공 일수 → 평균 일찍 일어난 시간 순</span></div>
    ${rank.length ? `<ol class="rank-list">${rank.map((r) => `
      <li class="rank-item ${r.uid === S.user.uid ? 'me' : ''}">
        <div class="rank-top">
          <span class="badge ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank}</span>
          <span class="rank-name">${esc(r.name)}${r.uid === S.user.uid ? ' (나)' : ''}</span>
          <span class="rank-sub">지각 ${r.l} · 평균 ${Math.round(r.avgEarly)}분 일찍</span>
          <span class="rank-days">${r.s}일</span>
        </div>
        <div class="bar"><div style="width:${Math.min(100, Math.round(r.s / Math.max(1, now.d) * 100))}%"></div></div>
      </li>`).join('')}</ol>` : '<p class="empty">아직 참가자가 없어요.</p>'}
  </section>`;
}

function viewKing() {
  const pym = prevYm(ym0);
  const rank = ranking(S.prev, pym).filter((r) => r.s > 0);
  const top = rank[0];
  const king = top ? `
    <section class="winner">
      <span class="pill">${ymLabel(pym)} 결과 발표</span>
      <div class="trophy">${svg(P.trophy, 48, '#F26B3A', 2)}</div>
      <div style="font-weight:700">${ymLabel(pym)}의 기상왕</div>
      <h2>${esc(top.name)}님</h2>
      <p>성공 <b class="num">${top.s}</b>일 · 평균 ${Math.round(top.avgEarly)}분 일찍 기상</p>
    </section>
    <section class="row">
      <div class="card grow"><h2>TOP 3</h2>${viewRankList(rank.slice(0, 3), new Date(Date.UTC(Math.floor(pym / 100), pym % 100, 0)).getUTCDate())}</div>
      <div class="card side" style="display:flex;flex-direction:column;gap:14px;justify-content:center">
        <div style="display:flex;align-items:center;gap:14px"><div class="icon-box" style="width:56px;height:56px;border-radius:16px">${svg(P.gift, 26, '#F26B3A', 2)}</div>
        <div><div class="muted" style="font-size:14px">${ymLabel(pym)} 기상왕 보상</div><div style="font-size:20px;font-weight:900">${esc(S.prevPrize) || '상품 정보 없음'}</div></div></div>
        <p class="muted" style="margin:0;font-size:14px;line-height:1.6">한 달 동안 함께 일어나 주신 모든 분들, 정말 고생 많으셨어요!</p>
      </div>
    </section>`
    : `<section class="card"><h2>${ymLabel(pym)} 기상왕</h2><p class="empty">${ymLabel(pym)}에는 인증 기록이 없어요. 이번 달 첫 기상왕에 도전해 보세요!</p></section>`;

  const admin = S.isAdmin ? `
    <section class="card"><h2>관리자 · ${ymLabel(ym0)} 상품 정하기</h2>
      <form class="form" data-form="prize">
        <div class="field"><label for="prize">상품 이름</label>
          <input class="input" id="prize" name="prize" maxlength="60" value="${esc(S.prize)}" placeholder="예: 커피 기프티콘"></div>
        <button class="btn-dark" type="submit" ${S.busy ? 'disabled' : ''}>저장</button>
      </form></section>` : '';
  return king + viewReward(kst()) + admin;
}

function viewSettings() {
  const now = kst();
  const today = keyOf(now);
  const p = S.profile;
  const eff = effectiveGoal(p, today);
  const pending = today < (p.nextFrom || 0) && p.nextGoalMin !== p.goalMin ? p.nextGoalMin : null;
  return `<section class="card" style="max-width:640px">
    <h2>내 설정</h2>
    <form class="form" data-form="profile">
      <div class="field"><label for="nick">닉네임</label>
        <input class="input" id="nick" name="nickname" maxlength="12" required value="${esc(p.nickname)}"></div>
      <div class="field"><label for="goal">목표 기상 시간</label>
        <input class="input num" id="goal" name="goal" type="time" min="04:00" max="11:00" step="300" required value="${fmt(pending ?? eff)}">
        <span class="hint">공정하게 하려고, 바꾼 시간은 <b>내일부터</b> 적용돼요.</span></div>
      ${pending !== null ? `<div class="notice">오늘은 ${fmt(eff)}, 내일부터 ${fmt(pending)}로 바뀌어요.</div>` : ''}
      <button class="btn-dark" type="submit" ${S.busy ? 'disabled' : ''}>저장</button>
    </form>
  </section>
  <section class="card" style="max-width:640px">
    <h2>계정</h2>
    <p class="muted" style="margin:0 0 16px">${esc(S.user.email || '')}${S.isAdmin ? ' · 관리자' : ''}</p>
    <button class="btn-ghost" data-action="logout">로그아웃</button>
  </section>`;
}

/* ================= 동작 ================= */
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function withBusy(fn) {
  if (S.busy) return;
  S.busy = true; render();
  try { await fn(); }
  catch (e) {
    console.error(e);
    toast(e && e.code === 'permission-denied'
      ? '저장할 수 없어요. 인증 가능한 시간인지 확인해 주세요.'
      : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  } finally { S.busy = false; render(); }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'tab') {
    e.preventDefault();
    S.tab = el.dataset.tab; render(); window.scrollTo(0, 0);
  } else if (action === 'login') {
    signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        toast('로그인하지 못했어요. 크롬이나 사파리에서 다시 시도해 주세요.');
      }
    });
  } else if (action === 'logout') {
    S.tab = 'today';
    signOut(auth);
  } else if (action === 'confirm-checkin') {
    if (!S.preview) return;
    withBusy(async () => {
      const now = kst();
      const today = keyOf(now);
      const id = `${S.user.uid}_${today}`;
      const batch = writeBatch(db);
      batch.set(doc(db, 'checkins', id), {
        uid: S.user.uid, day: today, ym: ymOf(now),
        goalMin: effectiveGoal(S.profile, today), at: serverTimestamp()
      });
      batch.set(doc(db, 'photos', id), { uid: S.user.uid, day: today, img: S.preview });
      await batch.commit();
      S.preview = null;
      toast('기상 인증 완료! 오늘도 멋진 하루 보내세요');
    });
  } else if (action === 'view-photo') {
    S.viewPhoto = el.dataset.id; render();
  } else if (action === 'close-photo') {
    S.viewPhoto = null; render();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.viewPhoto) { S.viewPhoto = null; render(); }
  // 사진 찍기 라벨을 키보드(Enter/Space)로도 열 수 있게
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('label[for="cam"]')) {
    e.preventDefault();
    const cam = document.getElementById('cam');
    if (cam) cam.click();
  }
});

// 사진 고르기 → 작게 줄여서 미리보기
document.addEventListener('change', async (e) => {
  const input = e.target;
  if (!input.matches || !input.matches('[data-action-change="photo"]')) return;
  const file = input.files && input.files[0];
  input.blur();
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('사진 파일만 올릴 수 있어요.');
  try {
    S.preview = await shrinkImage(file);
    render();
  } catch (err) {
    console.error(err);
    toast('사진을 불러오지 못했어요. 다시 찍어 주세요.');
  }
});

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = 0.7, data = canvas.toDataURL('image/jpeg', q);
      while (data.length > 300000 && q > 0.3) { q -= 0.1; data = canvas.toDataURL('image/jpeg', q); }
      if (data.length > 450000) return reject(new Error('too big'));
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const kind = form.dataset.form;
  document.activeElement && document.activeElement.blur();

  if (kind === 'join' || kind === 'profile') {
    const nickname = String(fd.get('nickname') || '').trim().slice(0, 12);
    const goal = parseTime(fd.get('goal'));
    if (!nickname) return toast('닉네임을 입력해 주세요.');
    if (!(goal >= GOAL_MIN && goal <= GOAL_MAX)) return toast('목표 시간은 04:00 ~ 11:00 사이로 정해 주세요.');

    if (kind === 'join') {
      withBusy(async () => {
        await setDoc(doc(db, 'users', S.user.uid), {
          nickname, goalMin: goal, nextGoalMin: goal, nextFrom: 0, joinedAt: serverTimestamp()
        });
        toast('챌린지에 참가했어요!');
      });
    } else {
      withBusy(async () => {
        const p = S.profile;
        const today = keyOf(kst());
        const eff = effectiveGoal(p, today);
        const pending = today < (p.nextFrom || 0) ? p.nextGoalMin : eff;
        const ref = doc(db, 'users', S.user.uid);
        if (goal === pending) {
          if (nickname === p.nickname) return toast('바뀐 내용이 없어요.');
          await updateDoc(ref, { nickname });
        } else {
          await updateDoc(ref, { nickname, goalMin: eff, nextGoalMin: goal, nextFrom: shiftKey(today, 1) });
        }
        toast(goal === pending ? '저장했어요.' : `저장했어요. 내일부터 ${fmt(goal)}가 목표예요.`);
      });
    }
  } else if (kind === 'prize') {
    const text = String(fd.get('prize') || '').trim().slice(0, 60);
    withBusy(async () => {
      await setDoc(doc(db, 'prizes', String(ym0)), { text });
      toast('상품을 저장했어요.');
    });
  }
});

// 시간이 흐르면 화면(인증 가능 여부 등)을 갱신
setInterval(() => {
  if (S.user && S.profile) {
    if (keyOf(kst()) !== day0 && S.user) { S.preview = null; stopListening(); startListening(S.user.uid); }
    render();
  }
}, 30000);
