import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, deleteDoc,
    onSnapshot, deleteField, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseApp = initializeApp({
    apiKey: 'AIzaSyAmbYDf0nra_7afcX_p2LqcvJQ5RU0oQo8',
    authDomain: 'desknote-app-2026.firebaseapp.com',
    projectId: 'desknote-app-2026',
    storageBucket: 'desknote-app-2026.firebasestorage.app',
    messagingSenderId: '126849335835',
    appId: '1:126849335835:web:29b5cec2ce032ab5d2eebe'
});

// 端末に控えを持たせる。電波が切れていても書けて、つながったときに送られる
let db;
try {
    db = initializeFirestore(firebaseApp, { localCache: persistentLocalCache() });
} catch {
    db = initializeFirestore(firebaseApp, {});
}

const ROOM_KEY = 'desknote.room';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
// 新しいノートに最初から入っている種別。仕事でも学校でも使えるものにしてある
const DEFAULT_KINDS = [
    { id: 'work', label: '仕事', c: 3 },
    { id: 'school', label: '学校', c: 2 },
    { id: 'outing', label: 'おでかけ', c: 4 },
    { id: 'hospital', label: '病院', c: 5 }
];

// 就活用に使われていた昔の種別。既に書かれた予定が表示できなくならないよう残す
const LEGACY_KINDS = [
    { id: 'seminar', label: 'セミナー', c: 0 },
    { id: 'intern', label: 'インターン', c: 1 },
    { id: 'selection', label: '選考', c: 2 }
];

// ノートを作るときに選べるひな形。入っているのは種別だけで、予定は空のまま
const NOTE_TEMPLATES = [
    {
        id: 'daily', label: '日常', name: 'わが家のノート',
        kinds: DEFAULT_KINDS
    },
    {
        id: 'job', label: '就活・インターン', name: '就活ノート',
        kinds: [
            { id: 'seminar', label: 'セミナー', c: 0 },
            { id: 'intern', label: 'インターン', c: 1 },
            { id: 'selection', label: '選考', c: 2 },
            { id: 'ob', label: 'OB訪問', c: 3 },
            { id: 'doc', label: '提出物', c: 5 }
        ]
    },
    {
        id: 'school', label: '学校', name: '学校のノート',
        kinds: [
            { id: 'class', label: '授業', c: 2 },
            { id: 'task', label: '課題', c: 5 },
            { id: 'exam', label: '試験', c: 1 },
            { id: 'club', label: '部活', c: 3 },
            { id: 'event', label: '行事', c: 4 }
        ]
    },
    {
        id: 'work', label: '仕事', name: '仕事のノート',
        kinds: [
            { id: 'meeting', label: '会議', c: 2 },
            { id: 'deadline', label: '締切', c: 1 },
            { id: 'trip', label: '出張', c: 3 },
            { id: 'shift', label: 'シフト', c: 5 },
            { id: 'other', label: 'その他', c: 7 }
        ]
    },
    {
        id: 'family', label: '家族・暮らし', name: '家族のノート',
        kinds: [
            { id: 'hospital', label: '通院', c: 0 },
            { id: 'shopping', label: '買い物', c: 4 },
            { id: 'school2', label: '学校・園', c: 2 },
            { id: 'event2', label: '行事', c: 3 },
            { id: 'pay', label: '支払い', c: 1 }
        ]
    }
];

const KIND_COLORS = 8;      // style.css に用意してある色の数
const KIND_MAX = 10;        // 一行に収まる範囲
const KIND_NAME_MAX = 8;

let roomId = localStorage.getItem(ROOM_KEY) || '';
let data = { plans: [], todos: [] };
let currentTab = 'tomorrow';
let formKind = 'plan';
let pickedKind = 'seminar';
let editingId = '';
let demoMode = false;
let shownDate = '';
let unsubscribe = null;
let saving = false;

// いま開いているノートについて、Firestoreから届いた最新の情報
let hostId = '';        // 作った人の見る人ID。これと同じ人だけが「ホスト」
let roomName = '';      // ホストが付けた、ノートの正式な名前
let bannedViewers = []; // ホストに退出させられた人の一覧
let kinds = [];         // このノートで選べる種別
let retired = {};       // 消した種別。昔の予定の見た目を保つために名前だけ残す

const $ = id => document.getElementById(id);

/* ===== 種別 ===== */
// 種別を持っていない古いノートのための既定値。
// 就活の予定が入っているノートは、これまでどおりの3つをそのまま使う
function defaultKindsFor(plans) {
    const legacy = LEGACY_KINDS.map(k => k.id);
    const used = (plans || []).some(p => legacy.includes(p.kind));
    return (used ? LEGACY_KINDS : DEFAULT_KINDS).map(k => ({ ...k }));
}

function kindInfo(id) {
    if (!id) return null;
    return kinds.find(k => k.id === id)
        || LEGACY_KINDS.find(k => k.id === id)
        || retired[id]
        || null;
}

// いちばん使われていない色を選ぶ。似た色が並ばないようにするため
function nextKindColor() {
    const used = kinds.map(k => k.c);
    for (let i = 0; i < KIND_COLORS; i++) if (!used.includes(i)) return i;
    return kinds.length % KIND_COLORS;
}

function newKindId() {
    return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// 種別の変更は予定とは別に送る。書きかけの予定を巻き込まないため
function saveKinds() {
    if (demoMode || !roomId) return;
    setDoc(doc(db, 'rooms', roomId), { kinds, retired }, { merge: true })
        .catch(() => { /* 次に開いたときにもう一度送られる */ });
}

// 予定を書く画面に並ぶのは「選ぶ」ためのボタンだけ。
// 増やす・減らすは、まぎらわしくないよう別の画面に分けている
function renderKindPick() {
    const box = $('kindPick');
    if (!box) return;
    box.innerHTML = '';

    for (const k of kinds) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kpick kc' + k.c + (k.id === pickedKind ? ' is-on' : '');
        b.dataset.kind = k.id;
        b.textContent = k.label;
        box.appendChild(b);
    }

    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'kpick kpick-none' + (pickedKind === '' ? ' is-on' : '');
    none.dataset.kind = '';
    none.textContent = 'なし';
    box.appendChild(none);

    const ed = document.createElement('button');
    ed.type = 'button';
    ed.className = 'kpick kpick-edit';
    ed.dataset.act = 'edit';
    ed.textContent = '種別を編集';
    box.appendChild(ed);
}

/* ===== 種別を編集する画面 ===== */
function openKindModal() {
    renderKindList();
    $('kindName').value = '';
    $('kindModal').classList.remove('hidden');
}

function closeKindModal() {
    $('kindModal').classList.add('hidden');
}

function renderKindList() {
    const list = $('kindList');
    list.innerHTML = '';

    for (const k of kinds) {
        const li = document.createElement('li');
        li.className = 'kind-row';

        const dot = document.createElement('span');
        dot.className = 'kind-row-dot kc' + k.c;
        li.appendChild(dot);

        const name = document.createElement('span');
        name.className = 'kind-row-name';
        name.textContent = k.label;
        li.appendChild(name);

        const used = data.plans.filter(p => p.kind === k.id).length;
        const n = document.createElement('span');
        n.className = 'kind-row-n';
        n.textContent = used ? used + '件' : '';
        li.appendChild(n);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'kind-row-del';
        del.dataset.del = k.id;
        del.textContent = '削除';
        li.appendChild(del);

        list.appendChild(li);
    }

    if (!kinds.length) {
        const li = document.createElement('li');
        li.className = 'kind-empty';
        li.textContent = 'まだ種別がありません。下から追加できます。';
        list.appendChild(li);
    }

    $('kindName').disabled = kinds.length >= KIND_MAX;
    $('kindAddOk').disabled = kinds.length >= KIND_MAX;
    $('kindNote').textContent = kinds.length >= KIND_MAX
        ? '種別はこれ以上増やせません（' + KIND_MAX + '個まで）。'
        : '種別はこのノートを見ている全員に共有されます。';
}

function addKind() {
    const label = $('kindName').value.trim().slice(0, KIND_NAME_MAX);
    if (!label) { $('kindName').focus(); return; }
    if (kinds.length >= KIND_MAX) return;
    if (kinds.some(k => k.label === label)) { $('kindName').value = ''; return; }

    const k = { id: newKindId(), label, c: nextKindColor() };
    kinds.push(k);
    pickedKind = k.id;
    $('kindName').value = '';
    $('kindName').focus();
    renderKindList();
    renderKindPick();
    saveKinds();
}

function removeKind(id) {
    const k = kinds.find(x => x.id === id);
    if (!k) return;
    const inUse = data.plans.filter(p => p.kind === id).length;
    askDelete(
        '種別「' + k.label + '」',
        inUse ? 'この種別を付けた予定 ' + inUse + ' 件は、見た目そのままで残ります。' : '',
        () => {
            kinds = kinds.filter(x => x.id !== id);
            // 昔の予定の見た目が変わらないよう、名前と色だけ残しておく
            if (inUse) retired[id] = { id: k.id, label: k.label, c: k.c };
            if (pickedKind === id) pickedKind = '';
            renderKindList();
            renderKindPick();
            renderAll();
            saveKinds();
        }
    );
}

/* ===== ノートID ===== */
function newRoomId() {
    const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

function prettyId(id) {
    return id.replace(/(.{5})(?=.)/g, '$1-');
}

function cleanId(text) {
    return text.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ===== 顔（Humation） =====
   端末ごとに1つ、ランダムな「見る人ID」を持たせる。ログインは無いので、
   同じノートを開いている人どうしを見分けるための、ただの合言葉。
   顔はその文字列から Humation が描く。同じ文字列からは必ず同じ顔になる。 */
const VIEWER_KEY = 'desknote.viewer';
let viewerId = localStorage.getItem(VIEWER_KEY);
if (!viewerId) {
    viewerId = uid();
    localStorage.setItem(VIEWER_KEY, viewerId);
}

// ライブラリが間に合っていないときの予備の顔。種から色だけ決める
const FALLBACK_COLORS = ['#7cb69d', '#e8918c', '#8fb3e0', '#f0b65e', '#c5a8e0', '#9dd6c6'];
function fallbackFaceSvg(seed) {
    const str = String(seed || '');
    let n = 0;
    for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
    const bg = FALLBACK_COLORS[n % FALLBACK_COLORS.length];
    return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
        + '<rect width="40" height="40" fill="' + bg + '"/>'
        + '<circle cx="20" cy="16" r="7" fill="#fffdf7"/>'
        + '<path d="M8 36c0-6.6 5.4-11 12-11s12 4.4 12 11z" fill="#fffdf7"/>'
        + '</svg>';
}

function faceSvg(seed) {
    const engine = window.HumationAvatar;
    if (engine) { try { return engine.svgFor(seed); } catch { /* 予備を返す */ } }
    return fallbackFaceSvg(seed);
}

function paintMyFace() {
    const el = $('myFace');
    if (el) el.innerHTML = faceSvg(viewerId);
}

// ライブラリの読み込みが後から終わった場合に備えて、描き直す
window.addEventListener('humationReady', () => { paintMyFace(); renderGateLists(); renderMembers(lastMembers); });
window.addEventListener('humationFailed', () => { paintMyFace(); renderGateLists(); renderMembers(lastMembers); });

/* ===== 参加中の顔ぶれ =====
   同じノートを開いている人を、Firestoreの members に載せておく。
   90秒以上更新が無い相手は「もういない」とみなして表示から外す。 */
const PRESENCE_MAX = 6;
const PRESENCE_ACTIVE_MS = 90 * 1000;
let lastMembers = {};

function touchPresence() {
    if (!roomId || demoMode) return;
    setDoc(doc(db, 'rooms', roomId), { members: { [viewerId]: { lastSeen: Date.now() } } }, { merge: true })
        .catch(() => { /* 参加中の表示が一瞬遅れるだけで、実害はない */ });
}

function renderMembers(membersMap) {
    lastMembers = membersMap || {};
    const now = Date.now();
    const active = Object.keys(lastMembers)
        .filter(id => now - (lastMembers[id]?.lastSeen || 0) < PRESENCE_ACTIVE_MS)
        .sort((a, b) => (a === viewerId ? -1 : b === viewerId ? 1 : 0));

    const wrap = $('members');
    if (active.length <= 1) {
        wrap.classList.add('hidden');
        return;
    }
    wrap.classList.remove('hidden');

    // ホスト本人だけ、自分以外の顔に「退出させる」ボタンが付く
    const iAmHost = !!hostId && viewerId === hostId;
    const shown = active.slice(0, PRESENCE_MAX);
    const rest = active.length - shown.length;
    $('memberFaces').innerHTML = shown.map(id => {
        const canKick = iAmHost && id !== viewerId;
        return '<span class="member-face' + (id === viewerId ? ' is-me' : '') + '">'
            + faceSvg(id)
            + (canKick ? '<button type="button" class="member-kick" data-kick="' + id + '" aria-label="この人を退出させる" title="退出させる"><i class="ico-close"></i></button>' : '')
            + '</span>';
    }).join('') + (rest > 0 ? '<span class="member-more">+' + rest + '</span>' : '');
    $('membersLabel').textContent = active.length + '人が見ています';
}

async function kickMember(targetId) {
    if (!roomId || viewerId !== hostId || targetId === viewerId) return;
    try {
        await setDoc(doc(db, 'rooms', roomId), {
            ['members.' + targetId]: deleteField(),
            bannedViewers: arrayUnion(targetId)
        }, { merge: true });
    } catch {
        /* 通信できなければ、後で見たときにもう一度押せばよい */
    }
}

$('memberFaces').addEventListener('click', e => {
    const btn = e.target.closest('[data-kick]');
    if (!btn) return;
    if (confirm('この人をこのノートから退出させますか？\n（このノートIDを知っていても、二度と開けなくなります）')) {
        kickMember(btn.dataset.kick);
    }
});

/* 自分がホストに退出させられたときの後始末 */
function handleKicked() {
    const wasId = roomId;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    roomId = '';
    localStorage.removeItem(ROOM_KEY);
    $('page').classList.add('hidden');
    $('gate').classList.remove('hidden');
    $('gateId').value = '';
    $('gateError').textContent = 'このノートから、ホストによって退出させられました。';
    if (wasId) forgetNote(wasId);
    renderGateLists();
}

/* ノートIDが変更された（もう存在しない）ときの後始末 */
function handleRoomGone() {
    const wasId = roomId;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    roomId = '';
    localStorage.removeItem(ROOM_KEY);
    $('page').classList.add('hidden');
    $('gate').classList.remove('hidden');
    $('gateId').value = '';
    $('gateError').textContent = 'このノートは使えなくなりました（IDが変更されたようです）。';
    if (wasId) forgetNote(wasId);
    renderGateLists();
}

// 開いている間は、自分がまだいることを知らせ続ける。閉じたタブは自然に消える
setInterval(() => {
    touchPresence();
    if (roomId && !demoMode) renderMembers(lastMembers); // 90秒の期限切れも定期的に反映
}, 20000);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') touchPresence();
});

/* ===== 保存と読み込み ===== */
async function openRoom(id, seedIfNew, initialName, seedKinds) {
    roomId = id;
    localStorage.setItem(ROOM_KEY, id);

    demoMode = false;
    $('demoBar').classList.add('hidden');
    $('weatherPick').classList.add('hidden');
    lastMembers = {};
    hostId = '';
    roomName = '';
    bannedViewers = [];
    $('members').classList.add('hidden');

    const ref = doc(db, 'rooms', id);
    if (seedIfNew) {
        data = { plans: [], todos: [] };
        hostId = viewerId;
        roomName = (initialName || '').trim() || '名前未設定のノート';
        kinds = (seedKinds && seedKinds.length) ? seedKinds : DEFAULT_KINDS.map(k => ({ ...k }));
        retired = {};
        await setDoc(ref, { plans: [], todos: [], name: roomName, hostId: viewerId, bannedViewers: [], kinds, retired });
    }

    // 通信を待たずに、端末の控えをすぐ映す
    if (!seedIfNew) {
        const local = loadLocal();
        if (local) data = { plans: local.plans || [], todos: local.todos || [] };
    }

    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(ref, snap => {
        const v = snap.data();
        if (!v) { handleRoomGone(); return; }

        // この機能が無かった頃に作られたノートには、まだホストが記録されていない。
        // その場合は、最初に開いた人がホストになる
        if (v.hostId) {
            hostId = v.hostId;
        } else if (!seedIfNew) {
            hostId = viewerId;
            setDoc(ref, { hostId: viewerId }, { merge: true }).catch(() => { /* 次に開いたときにもう一度試せばよい */ });
        }
        roomName = v.name || '';
        bannedViewers = v.bannedViewers || [];

        // 種別を持っていない古いノートには、中身に合わせた既定値を入れて覚えさせる
        if (Array.isArray(v.kinds) && v.kinds.length) {
            kinds = v.kinds.map(k => ({ ...k }));
        } else {
            kinds = defaultKindsFor(v.plans);
            setDoc(ref, { kinds }, { merge: true }).catch(() => { /* 次に開いたときに入る */ });
        }
        retired = v.retired || {};
        renderKindPick();
        if (bannedViewers.includes(viewerId) && viewerId !== hostId) { handleKicked(); return; }

        // 参加中の顔ぶれは、自分の保存中かどうかに関係なく常に最新にする
        renderMembers(v.members || {});

        // 自分が送っている最中の反映は、書きかけを上書きしないよう見送る
        if (saving || pendingSaves > 0) return;
        data = { plans: v.plans || [], todos: v.todos || [] };
        saveLocal();
        renderAll();
    });

    $('gate').classList.add('hidden');
    $('page').classList.remove('hidden');
    renderClock();
    renderAll();
    touchPresence();
}

/* 保存は必ず順番に行う。前の保存が終わる前に次が来ても、取りこぼさない */
let saveChain = Promise.resolve();
let pendingSaves = 0;

function localKey() {
    return 'desknote.data.' + roomId;
}

function saveLocal() {
    try {
        localStorage.setItem(localKey(), JSON.stringify(data));
    } catch {
        /* 端末の空きがないときは、控えを置けないだけ */
    }
}

function loadLocal() {
    try {
        const raw = localStorage.getItem(localKey());
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function showSaveState(state) {
    const el = $('saveState');
    if (!el) return;
    el.className = 'save-state is-' + state;
    el.textContent = state === 'saving' ? '保存中'
        : state === 'saved' ? '保存しました'
            : '未保存';
}

// 書いたものは、まず端末に控えてから送る。送信に失敗しても消えない
function persist() {
    if (demoMode) return Promise.resolve();
    saveLocal();
    pendingSaves++;
    showSaveState('saving');

    saveChain = saveChain.then(async () => {
        const snapshot = JSON.parse(JSON.stringify(data));
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                saving = true;
                // merge:true で送る。そうしないと、参加者の顔ぶれ(members)を
                // 巻き添えで消してしまう
                await setDoc(doc(db, 'rooms', roomId), snapshot, { merge: true });
                saving = false;
                pendingSaves--;
                if (pendingSaves === 0) {
                    showSaveState('saved');
                    setTimeout(() => {
                        if (pendingSaves === 0) $('saveState').textContent = '';
                    }, 2200);
                }
                return;
            } catch {
                saving = false;
                await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
            }
        }
        pendingSaves--;
        showSaveState('failed');
    });
    return saveChain;
}

// 送れていない分は、電波が戻ったときにもう一度送る
window.addEventListener('online', () => {
    if (roomId) persist();
});

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

/* ===== 日付 ===== */
function ymd(date) {
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

function dayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return ymd(d);
}

function daysFromToday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

function dateHeading(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const diff = daysFromToday(dateStr);
    const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    let tail = '';
    if (diff === 0) tail = '　今日';
    else if (diff === 1) tail = '　明日';
    else if (diff > 1) tail = `　あと${diff}日`;
    return `${m}月${d}日（${wd}）${tail}`;
}

/* ===== 時計 ===== */
function renderClock() {
    const now = new Date();
    $('clock').textContent =
        String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    const key = ymd(now);
    if (key !== shownDate) {
        shownDate = key;
        $('date').textContent =
            `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAYS[now.getDay()]}）`;
        renderAll();
    }
}

/* ===== 部品 ===== */
function delButton() {
    const b = document.createElement('button');
    b.className = 'del';
    b.dataset.act = 'delete';
    b.setAttribute('aria-label', '削除');
    b.appendChild(document.createElement('i')).className = 'ico-close';
    return b;
}

function bodyBlock(company, kind, text) {
    const body = document.createElement('span');
    body.className = 'item-body';
    if (company) {
        const co = document.createElement('span');
        co.className = 'company';
        co.textContent = company;
        const info = kindInfo(kind);
        if (info) {
            const tag = document.createElement('span');
            tag.className = 'tag kc' + info.c;
            tag.textContent = info.label;
            co.appendChild(tag);
        }
        body.appendChild(co);
    }
    const t = document.createElement('span');
    t.className = 'item-text';
    t.textContent = text;
    body.appendChild(t);
    return body;
}

/* ===== やること ===== */
function renderTodos() {
    const list = $('todoList');
    const sorted = [...data.todos].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.due && b.due) return a.due.localeCompare(b.due) || (a.created - b.created);
        if (a.due) return -1;
        if (b.due) return 1;
        return (a.created || 0) - (b.created || 0);
    });

    list.innerHTML = '';
    for (const todo of sorted) {
        const li = document.createElement('li');
        li.className = 'item' + (todo.done ? ' done' : '');
        li.dataset.id = todo.id;

        const check = document.createElement('button');
        check.className = 'check';
        check.dataset.act = 'toggle';
        check.setAttribute('aria-label', todo.done ? '未完了に戻す' : '完了にする');

        li.append(check, bodyBlock(todo.company, '', todo.text));

        if (todo.due) {
            const diff = daysFromToday(todo.due);
            const due = document.createElement('span');
            due.className = 'due';
            if (diff < 0) {
                due.classList.add('is-over');
                due.textContent = '期限切れ';
            } else if (diff === 0) {
                due.classList.add('is-today');
                due.textContent = todo.dueTime ? `今日 ${todo.dueTime}` : '今日まで';
            } else if (diff <= 3) {
                due.classList.add('is-soon');
                due.textContent = `あと${diff}日`;
            } else {
                const [, m, d] = todo.due.split('-');
                due.textContent = `${Number(m)}/${Number(d)}`;
            }
            li.appendChild(due);
        }

        li.appendChild(delButton());
        list.appendChild(li);
    }

    const open = data.todos.filter(t => !t.done);
    const soon = open.filter(t => t.due && daysFromToday(t.due) <= 3).length;
    $('todoCount').textContent =
        data.todos.length ? (soon ? `のこり ${open.length}・急ぎ ${soon}` : `のこり ${open.length}`) : '';
    toggleEmpty('todoList', 'todoEmpty', data.todos.length > 0);
}

/* ===== 予定 ===== */
function planItem(plan, past) {
    const li = document.createElement('li');
    li.className = 'item' + (past ? ' past' : '');
    li.dataset.id = plan.id;

    const time = document.createElement('span');
    time.className = 'time';
    const start = document.createElement('span');
    start.className = 'time-start';
    start.textContent = plan.time || '—';
    time.appendChild(start);

    // 日をまたぐ予定は、終わりの日付も添える
    const spansDays = plan.endDate && plan.endDate !== plan.date;
    if (plan.end || spansDays) {
        const end = document.createElement('span');
        end.className = 'time-end';
        const dayPart = spansDays
            ? plan.endDate.split('-').slice(1).map(Number).join('/') + (plan.end ? ' ' : '')
            : '';
        end.textContent = '〜' + dayPart + (plan.end || '');
        time.appendChild(end);
    }

    li.append(time, bodyBlock(plan.company, plan.kind, plan.title || ''), delButton());
    return li;
}

function renderToday() {
    const today = dayKey(0);
    const now = new Date();
    const nowTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const items = data.plans.filter(p => p.date === today).sort((a, b) => a.time.localeCompare(b.time));

    const list = $('todayList');
    list.innerHTML = '';
    for (const plan of items) list.appendChild(planItem(plan, plan.time && plan.time < nowTime));

    $('todayCount').textContent = items.length ? `${items.length}件` : '';
    toggleEmpty('todayList', 'todayEmpty', items.length > 0);
}

function renderTab() {
    const list = $('tabList');
    const today = dayKey(0);
    const tomorrow = dayKey(1);
    list.innerHTML = '';

    // カレンダーのときは、一覧の代わりに月の表を出す
    const isCal = currentTab === 'cal';
    $('cal').classList.toggle('hidden', !isCal);
    if (isCal) {
        list.classList.add('hidden');
        $('tabEmpty').classList.add('hidden');
        renderCal();
        return;
    }

    let items;
    let grouped = false;
    if (currentTab === 'tomorrow') {
        items = data.plans.filter(p => p.date === tomorrow);
    } else if (currentTab === 'upcoming') {
        items = data.plans.filter(p => p.date > tomorrow);
        grouped = true;
    } else {
        items = data.plans.filter(p => !p.date || p.date < today);
        grouped = true;
    }

    // 過去は新しい日から。同じ日の中は時間の早い順のまま
    items = [...items].sort((a, b) => {
        const byDate = (a.date || '').localeCompare(b.date || '');
        if (byDate) return currentTab === 'past' ? -byDate : byDate;
        return (a.time || '').localeCompare(b.time || '');
    });

    let lastDate = null;
    for (const plan of items) {
        if (grouped && plan.date !== lastDate) {
            lastDate = plan.date;
            const head = document.createElement('li');
            head.className = 'day-head';
            head.textContent = plan.date ? dateHeading(plan.date) : '日付なし';
            list.appendChild(head);
        }
        list.appendChild(planItem(plan, currentTab === 'past'));
    }

    toggleEmpty('tabList', 'tabEmpty', items.length > 0);
}

/* ===== カレンダー =====
   月の表を出して、予定の入っている日が一目で分かるようにする。 */
let calCursor = null;      // いま見ている月（その月の1日）
let calPicked = '';        // 選んでいる日

function monthStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

/* 日付 → その日の予定。日をまたぐ予定は、間の日にも入れておく */
function planDayMap() {
    const map = new Map();
    for (const p of data.plans) {
        if (!p.date) continue;
        const [y, m, d] = p.date.split('-').map(Number);
        const last = (p.endDate && p.endDate > p.date) ? p.endDate : p.date;
        const cur = new Date(y, m - 1, d);
        // 終わりの日付がおかしくても回り続けないように、上限を付ける
        for (let i = 0; i < 366; i++) {
            const key = ymd(cur);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(p);
            if (key >= last) break;
            cur.setDate(cur.getDate() + 1);
        }
    }
    return map;
}

function renderCal() {
    if (!calCursor) calCursor = monthStart(new Date());
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    $('calMonth').textContent = `${year}年${month + 1}月`;

    const map = planDayMap();
    const today = dayKey(0);
    const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());

    const grid = $('calGrid');
    grid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const key = ymd(d);
        const items = map.get(key) || [];

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cal-cell';
        cell.dataset.day = key;
        if (d.getMonth() !== month) cell.classList.add('is-out');
        if (d.getDay() === 0) cell.classList.add('is-sun');
        if (d.getDay() === 6) cell.classList.add('is-sat');
        if (key === today) cell.classList.add('is-today');
        if (key === calPicked) cell.classList.add('is-on');
        if (items.length) {
            cell.classList.add('has-plan');
            cell.title = `${items.length}件の予定`;
        }

        const num = document.createElement('span');
        num.textContent = d.getDate();
        cell.appendChild(num);

        const dots = document.createElement('span');
        dots.className = 'cal-dots';
        for (const p of items.slice(0, 3)) {
            const dot = document.createElement('span');
            const info = kindInfo(p.kind);
            dot.className = 'cal-dot' + (info ? ' kc' + info.c : '');
            dots.appendChild(dot);
        }
        if (items.length > 3) {
            const more = document.createElement('span');
            more.className = 'cal-dot k-more';
            dots.appendChild(more);
        }
        cell.appendChild(dots);
        grid.appendChild(cell);
    }

    renderCalDay(map);
}

function renderCalDay(map) {
    const list = $('calDayList');
    list.innerHTML = '';

    if (!calPicked) {
        $('calDayHead').textContent = '日を選ぶと、その日の予定が出ます';
        list.classList.add('hidden');
        $('calDayEmpty').classList.add('hidden');
        return;
    }

    $('calDayHead').textContent = dateHeading(calPicked);
    const items = (map || planDayMap()).get(calPicked) || [];
    const sorted = [...items].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    for (const p of sorted) list.appendChild(planItem(p, calPicked < dayKey(0)));
    toggleEmpty('calDayList', 'calDayEmpty', sorted.length > 0);
}

function toggleEmpty(listId, emptyId, hasItems) {
    $(listId).classList.toggle('hidden', !hasItems);
    $(emptyId).classList.toggle('hidden', hasItems);
}

function renderCounts() {
    const today = dayKey(0);
    const tomorrow = dayKey(1);
    const n = (id, v) => { $(id).textContent = v ? ` ${v}` : ''; };
    n('nTomorrow', data.plans.filter(p => p.date === tomorrow).length);
    n('nUpcoming', data.plans.filter(p => p.date > tomorrow).length);
    n('nPast', data.plans.filter(p => !p.date || p.date < today).length);
}

function renderAll() {
    renderTodos();
    renderToday();
    renderTab();
    renderCounts();
}

/* ===== 自分のノート一覧（この端末だけの控え） =====
   「作った」か「参加した」かだけを覚えておいて、ホームに並べる。
   一覧から外しても、ノートの中身が消えるわけではない。 */
const NOTES_KEY = 'desknote.myNotes';

function loadNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || []; } catch { return []; }
}
function saveNotes(list) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(list)); } catch { /* 保存できなくても表示は続ける */ }
}
function defaultNoteLabel(role) {
    const d = new Date();
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    return role === 'created' ? `ノート（${md}作成）` : `参加したノート（${md}）`;
}
function rememberNote(id, role, label) {
    const list = loadNotes();
    const existing = list.find(n => n.id === id);
    if (existing) {
        existing.savedAt = Date.now();
        if (label) existing.label = label;
    } else {
        list.push({ id, role, label: label || defaultNoteLabel(role), savedAt: Date.now() });
    }
    saveNotes(list);
    renderGateLists();
}
function forgetNote(id) {
    saveNotes(loadNotes().filter(n => n.id !== id));
    renderGateLists();
}
function renameNote(id, label) {
    const list = loadNotes();
    const n = list.find(x => x.id === id);
    if (!n || !label) return;
    n.label = label;
    saveNotes(list);
    // 自分が作ったノートなら、正式な名前として参加者全員にも伝える
    if (n.role === 'created') {
        setDoc(doc(db, 'rooms', id), { name: label }, { merge: true }).catch(() => { /* 次に開いたときに直せばよい */ });
    }
}

function fillNoteGroup(groupId, listId, items) {
    $(groupId).classList.toggle('hidden', items.length === 0);
    const ul = $(listId);
    ul.innerHTML = '';
    for (const n of items) {
        const li = document.createElement('li');
        li.className = 'gate-item';

        // 顔は「この端末の自分」で固定する。ノートごとに変えると、
        // 作るたびに絵が変わって見えてしまう
        const face = document.createElement('span');
        face.className = 'gate-item-face';
        face.innerHTML = faceSvg(viewerId);

        const label = document.createElement('input');
        label.type = 'text';
        label.className = 'gate-item-label';
        label.value = n.label;
        label.readOnly = true;
        label.maxLength = 20;

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'gate-item-edit';
        editBtn.textContent = '変更';
        editBtn.addEventListener('click', () => { label.readOnly = false; label.focus(); label.select(); });

        const finishEdit = () => {
            label.readOnly = true;
            const v = label.value.trim();
            if (v) renameNote(n.id, v); else label.value = n.label;
        };
        label.addEventListener('blur', finishEdit);
        label.addEventListener('keydown', e => { if (e.key === 'Enter') label.blur(); });

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'gate-item-open';
        openBtn.textContent = '開く';
        openBtn.addEventListener('click', () => { rememberNote(n.id, n.role); openRoom(n.id, false); });

        const forgetBtn = document.createElement('button');
        forgetBtn.type = 'button';
        forgetBtn.className = 'gate-item-forget';
        forgetBtn.setAttribute('aria-label', '一覧から外す');
        forgetBtn.appendChild(document.createElement('i')).className = 'ico-close';
        forgetBtn.addEventListener('click', () => forgetNote(n.id));

        li.append(face, label, editBtn, openBtn, forgetBtn);
        ul.appendChild(li);
    }
}

function renderGateLists() {
    const list = loadNotes().sort((a, b) => b.savedAt - a.savedAt);
    fillNoteGroup('createdGroup', 'createdList', list.filter(n => n.role === 'created'));
    fillNoteGroup('joinedGroup', 'joinedList', list.filter(n => n.role === 'joined'));
    $('gateLists').classList.toggle('hidden', list.length === 0);
}

/* ===== 入口 ===== */
$('gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = cleanId($('gateId').value);
    if (id.length < 16) {
        $('gateError').textContent = 'IDが短いようです。もう一度確かめてください。';
        return;
    }
    $('gateError').textContent = '';
    try {
        const snap = await getDoc(doc(db, 'rooms', id));
        if (!snap.exists()) {
            $('gateError').textContent = 'そのIDのノートは見つかりませんでした。';
            return;
        }
        // すでに知っているノートなら役割を保ったまま、初めてなら「参加した」として覚える。
        // 初めてのときは、ホストが付けた名前をそのまま呼び名にする
        const known = loadNotes().find(n => n.id === id);
        const hostName = snap.data().name || '';
        rememberNote(id, known ? known.role : 'joined', known ? undefined : hostName);
        openRoom(id, false);
    } catch {
        $('gateError').textContent = '通信できませんでした。電波を確かめてください。';
    }
});

let madeId = '';
let pickedTemplate = NOTE_TEMPLATES[0];

function templateKinds() {
    return pickedTemplate.kinds.map(k => ({ ...k }));
}

// ひな形の選択肢。押すと、その中身を下に出す
function renderTemplatePick() {
    const box = $('tplPick');
    box.innerHTML = '';
    for (const t of NOTE_TEMPLATES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tpl' + (t.id === pickedTemplate.id ? ' is-on' : '');
        b.dataset.tpl = t.id;
        b.textContent = t.label;
        box.appendChild(b);
    }
    $('tplKinds').textContent = '種別：' + pickedTemplate.kinds.map(k => k.label).join('・');
}

$('tplPick').addEventListener('click', e => {
    const b = e.target.closest('.tpl');
    if (!b) return;
    const t = NOTE_TEMPLATES.find(x => x.id === b.dataset.tpl);
    if (!t) return;
    const before = pickedTemplate;
    pickedTemplate = t;
    renderTemplatePick();
    // 呼び名がまだ空か、前のひな形の名前のままなら入れ替える
    const nameEl = $('gateMadeLabel');
    if (!nameEl.value.trim() || nameEl.value.trim() === before.name) nameEl.value = t.name;
});
$('gateNew').addEventListener('click', () => {
    madeId = newRoomId();
    $('gateMadeId').textContent = prettyId(madeId);
    pickedTemplate = NOTE_TEMPLATES[0];
    renderTemplatePick();
    $('gateMadeLabel').value = pickedTemplate.name;
    $('gateMade').classList.remove('hidden');
});

$('gateCopy').addEventListener('click', () => copyId(madeId, $('gateCopy')));
$('gateGo').addEventListener('click', () => {
    const name = $('gateMadeLabel').value.trim();
    rememberNote(madeId, 'created', name);
    openRoom(madeId, true, name, templateKinds());
});

/* ===== お試し ===== */
function openDemo() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    demoMode = true;
    roomId = '';
    data = buildDemo();
    kinds = LEGACY_KINDS.map(k => ({ ...k }));
    retired = {};
    renderKindPick();
    $('gate').classList.add('hidden');
    $('page').classList.remove('hidden');
    $('demoBar').classList.remove('hidden');
    $('saveState').textContent = '';
    currentTab = 'tomorrow';
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-on', t.dataset.tab === 'tomorrow');
    renderClock();
    renderAll();
    enterDemoWeather();
}

/* ===== 入口に戻る ===== */
function goHome() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    demoMode = false;
    data = { plans: [], todos: [] };
    kinds = [];
    retired = {};
    $('page').classList.add('hidden');
    $('demoBar').classList.add('hidden');
    $('modal').classList.add('hidden');
    $('roomModal').classList.add('hidden');
    $('settingsModal').classList.add('hidden');
    $('kindModal').classList.add('hidden');
    $('gateMade').classList.add('hidden');
    $('gateError').textContent = '';
    // 戻ってすぐ開き直せるよう、いま開いていたIDを入れておく
    $('gateId').value = roomId ? prettyId(roomId) : '';
    $('gate').classList.remove('hidden');
    leaveDemoWeather();
    renderGateLists();
    lastMembers = {};
    $('members').classList.add('hidden');
}

$('gateDemo').addEventListener('click', openDemo);
$('homeBtn').addEventListener('click', goHome);
$('demoMake').addEventListener('click', () => {
    goHome();
    $('gateNew').click();
});

async function copyId(id, btn) {
    try {
        await navigator.clipboard.writeText(id);
        const before = btn.textContent;
        btn.textContent = 'コピーしました';
        setTimeout(() => { btn.textContent = before; }, 1600);
    } catch {
        /* コピーできない環境では、画面の文字を選んで写してもらう */
    }
}

/* ===== ノートIDの確認 ===== */
$('roomBtn').addEventListener('click', () => {
    $('roomIdText').textContent = prettyId(roomId);
    $('roomModal').classList.remove('hidden');
});

/* ===== 設定 ===== */
$('settingsBtn').addEventListener('click', () => {
    // IDの変更とノートの削除は、ホスト（作った本人）にしかできない
    const iAmHost = !!hostId && viewerId === hostId;
    $('hostHead').classList.toggle('hidden', !iAmHost);
    $('roomRotate').classList.toggle('hidden', !iAmHost);
    $('rotateNote').classList.toggle('hidden', !iAmHost);
    $('roomDelete').classList.toggle('hidden', !iAmHost);
    $('deleteNote').classList.toggle('hidden', !iAmHost);
    $('deleteNote').textContent = '中身も、参加している人の画面からも消えます。元には戻せません。';
    $('settingsModal').classList.remove('hidden');
});
$('settingsClose').addEventListener('click', () => $('settingsModal').classList.add('hidden'));
$('settingsModal').addEventListener('click', e => {
    if (e.target === $('settingsModal')) $('settingsModal').classList.add('hidden');
});
$('setKinds').addEventListener('click', () => {
    $('settingsModal').classList.add('hidden');
    openKindModal();
});

/* ホストだけができる、ノートごとの削除。
   参加している人の画面からも消えるので、消す前に必ず一度止める。 */
$('roomDelete').addEventListener('click', () => {
    if (!roomId || viewerId !== hostId) return;
    const label = roomName || prettyId(roomId);
    const n = data.plans.length + data.todos.length;
    askDelete(
        'ノート「' + label + '」',
        n ? '予定とやること 合わせて ' + n + ' 件も消えます。' : '',
        async () => {
            $('settingsModal').classList.add('hidden');
            const id = roomId;
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            try {
                await deleteDoc(doc(db, 'rooms', id));
            } catch {
                // 消せなかったときは、開いたままにして知らせる
                $('settingsModal').classList.remove('hidden');
                $('deleteNote').textContent = '通信できませんでした。電波のあるところでもう一度お試しください。';
                return;
            }
            forgetNote(id);
            localStorage.removeItem(ROOM_KEY);
            location.reload();
        }
    );
});
$('roomClose').addEventListener('click', () => $('roomModal').classList.add('hidden'));
$('roomCopy').addEventListener('click', () => copyId(roomId, $('roomCopy')));

// 実際にはいない人が「見ています」に残ってしまったときの、自分でできる直し方
$('presenceReset').addEventListener('click', async () => {
    if (!roomId) return;
    const btn = $('presenceReset');
    const before = btn.textContent;
    btn.textContent = 'リセット中…';
    btn.disabled = true;
    try {
        await setDoc(doc(db, 'rooms', roomId), { members: deleteField() }, { merge: true });
        lastMembers = {};
        renderMembers({});
        touchPresence(); // 自分だけは、すぐに入れ直す
        btn.textContent = 'リセットしました';
    } catch {
        btn.textContent = '通信できませんでした';
    }
    setTimeout(() => { btn.textContent = before; btn.disabled = false; }, 2000);
});

$('roomLeave').addEventListener('click', () => {
    localStorage.removeItem(ROOM_KEY);
    location.reload();
});

/* ホストだけができる、ノートIDの変更。
   中身はそのまま新しいIDへ移し、古いIDは消す。今のIDを知っている人は
   ── キックした相手も含めて ── 新しいIDを教えない限りアクセスできなくなる。 */
$('roomRotate').addEventListener('click', async () => {
    if (!roomId || viewerId !== hostId) return;
    const ok = confirm('ノートIDを変更します。\n今のIDを知っている人は、変更後は開けなくなります。\nよろしいですか？');
    if (!ok) return;

    const btn = $('roomRotate');
    const before = btn.textContent;
    btn.textContent = '変更中…';
    btn.disabled = true;

    const oldId = roomId;
    const newId = newRoomId();
    try {
        await setDoc(doc(db, 'rooms', newId), {
            plans: data.plans, todos: data.todos, kinds, retired,
            name: roomName, hostId: viewerId, bannedViewers: [],
            members: { [viewerId]: { lastSeen: Date.now() } }
        });

        if (unsubscribe) { unsubscribe(); unsubscribe = null; } // 先に古い方の購読を止めてから消す
        try { await deleteDoc(doc(db, 'rooms', oldId)); } catch { /* 消せなくても、参照を移せば実害は小さい */ }

        const known = loadNotes().find(n => n.id === oldId);
        forgetNote(oldId);
        rememberNote(newId, 'created', known ? known.label : roomName);

        await openRoom(newId, false);
        $('roomIdText').textContent = prettyId(newId);
        $('settingsModal').classList.add('hidden');
        btn.textContent = '変更しました';
    } catch {
        btn.textContent = '変更できませんでした';
    }
    setTimeout(() => { btn.textContent = before; btn.disabled = false; }, 2200);
});

/* ===== 登録フォーム ===== */
function openModal(kind) {
    editingId = '';
    formKind = kind;
    $('fCompany').value = '';
    $('fTitle').value = '';
    $('fTime').value = '';
    $('fEnd').value = '';
    pickedKind = kinds.length ? kinds[0].id : '';
    closeKindModal();
    for (const b of document.querySelectorAll('.mkind')) b.classList.toggle('is-on', b.dataset.form === kind);
    renderKindPick();
    $('modalKinds').classList.remove('hidden');
    $('modalSave').textContent = '登録する';
    applyFormKind();
    $('modal').classList.remove('hidden');
    $('fTitle').focus();
}

/* 書いたものを押すと、その場で直せる */
function openEdit(id) {
    const plan = data.plans.find(p => p.id === id);
    const todo = data.todos.find(t => t.id === id);
    if (!plan && !todo) return;

    editingId = id;
    formKind = plan ? 'plan' : 'todo';
    for (const b of document.querySelectorAll('.mkind')) b.classList.toggle('is-on', b.dataset.form === formKind);
    // 直している途中で種類を変えられると分かりにくいので、切り替えは隠す
    $('modalKinds').classList.add('hidden');

    if (plan) {
        $('fCompany').value = plan.company || '';
        $('fTitle').value = plan.title || '';
        $('fDate').value = plan.date || '';
        $('fTime').value = plan.time || '';
        $('fEnd').value = plan.end || '';
        pickedKind = plan.kind || '';
    } else {
        $('fCompany').value = todo.company || '';
        $('fTitle').value = todo.text || '';
        $('fDate').value = todo.due || '';
        $('fTime').value = todo.dueTime || '';
        $('fEnd').value = '';
        pickedKind = '';
    }
    closeKindModal();
    renderKindPick();

    $('modalSave').textContent = '直す';
    applyFormKind();
    $('modal').classList.remove('hidden');
    $('fTitle').focus();
}

function applyFormKind() {
    const isPlan = formKind === 'plan';
    $('rowKind').classList.toggle('hidden', !isPlan);
    // やることは終わりの時刻を使わないので、開始だけ「期限の時刻」として使う
    $('fEnd').classList.toggle('hidden', !isPlan);
    $('fTilde').classList.toggle('hidden', !isPlan);
    $('labelDate').textContent = isPlan ? '日付' : '期日';
    $('fTitle').placeholder = isPlan ? '予定の名前' : 'やること';
    if (isPlan && !$('fDate').value) $('fDate').value = dayKey(0);
}

for (const b of document.querySelectorAll('.add-mini')) {
    b.addEventListener('click', () => openModal(b.dataset.add));
}
$('modalKinds').addEventListener('click', e => {
    const b = e.target.closest('.mkind');
    if (!b) return;
    formKind = b.dataset.form;
    for (const x of document.querySelectorAll('.mkind')) x.classList.toggle('is-on', x === b);
    applyFormKind();
});
$('kindPick').addEventListener('click', e => {
    const b = e.target.closest('.kpick');
    if (!b) return;
    if (b.dataset.act === 'edit') { openKindModal(); return; }
    pickedKind = b.dataset.kind;
    renderKindPick();
});

$('kindList').addEventListener('click', e => {
    const b = e.target.closest('.kind-row-del');
    if (b) removeKind(b.dataset.del);
});
$('kindAddOk').addEventListener('click', addKind);
$('kindModalClose').addEventListener('click', closeKindModal);
$('kindModal').addEventListener('click', e => {
    if (e.target === $('kindModal')) closeKindModal();
});
$('kindName').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addKind(); }
    if (e.key === 'Escape') { e.preventDefault(); closeKindModal(); }
});
$('modalClose').addEventListener('click', () => $('modal').classList.add('hidden'));
$('modal').addEventListener('click', e => {
    if (e.target === $('modal')) $('modal').classList.add('hidden');
});

$('entryForm').addEventListener('submit', async e => {
    e.preventDefault();
    const company = $('fCompany').value.trim();
    const title = $('fTitle').value.trim();
    if (!title) return;

    if (editingId) {
        const plan = data.plans.find(p => p.id === editingId);
        if (plan) {
            Object.assign(plan, {
                date: $('fDate').value || '', time: $('fTime').value || '',
                end: $('fEnd').value || '', company, title, kind: pickedKind
            });
        } else {
            const todo = data.todos.find(t => t.id === editingId);
            Object.assign(todo, {
                company, text: title,
                due: $('fDate').value || '', dueTime: $('fTime').value || ''
            });
        }
        editingId = '';
    } else if (formKind === 'plan') {
        data.plans.push({
            id: uid(), date: $('fDate').value || '', time: $('fTime').value || '',
            end: $('fEnd').value || '', company, title, kind: pickedKind
        });
    } else {
        data.todos.push({
            id: uid(), company, text: title,
            due: $('fDate').value || '', dueTime: $('fTime').value || '',
            done: false, created: Date.now()
        });
    }

    $('fCompany').value = '';
    $('fTitle').value = '';
    $('fTime').value = '';
    $('fEnd').value = '';
    $('modal').classList.add('hidden');
    renderAll();
    await persist();
});

/* ===== 消す前の確認 =====
   ✖は小さくて押し間違えやすいので、消す前に必ず一度止める。 */
let confirmAction = null;

function askDelete(title, sub, onOk) {
    const target = $('confirmTarget');
    target.textContent = title;
    if (sub) {
        const s = document.createElement('span');
        s.className = 'confirm-sub';
        s.textContent = sub;
        target.appendChild(s);
    }
    confirmAction = onOk;
    $('confirmModal').classList.remove('hidden');
}

function closeConfirm() {
    confirmAction = null;
    $('confirmModal').classList.add('hidden');
}

$('confirmClose').addEventListener('click', closeConfirm);
$('confirmCancel').addEventListener('click', closeConfirm);
$('confirmModal').addEventListener('click', e => {
    if (e.target === $('confirmModal')) closeConfirm();
});
$('confirmOk').addEventListener('click', async () => {
    const run = confirmAction;
    closeConfirm();
    if (run) await run();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('confirmModal').classList.contains('hidden')) closeConfirm();
});

/* ===== 一覧の操作 ===== */
$('todoList').addEventListener('click', async e => {
    const row = e.target.closest('.item');
    if (!row) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) { openEdit(row.dataset.id); return; }
    const id = row.dataset.id;
    if (act === 'toggle') {
        const todo = data.todos.find(t => t.id === id);
        todo.done = !todo.done;
        renderTodos();
        await persist();
        return;
    }

    const todo = data.todos.find(t => t.id === id);
    askDelete(todo?.text || 'このやること', todo?.company || '', async () => {
        data.todos = data.todos.filter(t => t.id !== id);
        renderTodos();
        await persist();
    });
});

for (const listId of ['todayList', 'tabList', 'calDayList']) {
    $(listId).addEventListener('click', async e => {
        const row = e.target.closest('.item');
        if (!row) return;
        if (e.target.closest('[data-act]')?.dataset.act !== 'delete') { openEdit(row.dataset.id); return; }
        const id = row.dataset.id;
        const plan = data.plans.find(p => p.id === id);
        const sub = [plan?.company, plan?.date ? dateHeading(plan.date) : '']
            .filter(Boolean).join('　');
        askDelete(plan?.title || 'この予定', sub, async () => {
            data.plans = data.plans.filter(p => p.id !== id);
            renderAll();
            await persist();
        });
    });
}

$('tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    currentTab = tab.dataset.tab;
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-on', t === tab);
    // カレンダーを開いたときは、まず今月の今日を見せる
    if (currentTab === 'cal' && !calPicked) {
        calCursor = monthStart(new Date());
        calPicked = dayKey(0);
    }
    renderTab();
});

function moveMonth(step) {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + step, 1);
    renderCal();
}

$('calPrev').addEventListener('click', () => moveMonth(-1));
$('calNext').addEventListener('click', () => moveMonth(1));
$('calToday').addEventListener('click', () => {
    calCursor = monthStart(new Date());
    calPicked = dayKey(0);
    renderCal();
});

$('calGrid').addEventListener('click', e => {
    const cell = e.target.closest('.cal-cell');
    if (!cell) return;
    const key = cell.dataset.day;
    calPicked = calPicked === key ? '' : key;
    // 前後の月の日を押したときは、その月に移る
    const [y, m] = key.split('-').map(Number);
    if (y !== calCursor.getFullYear() || m - 1 !== calCursor.getMonth()) {
        calCursor = new Date(y, m - 1, 1);
    }
    renderCal();
});

/* ===== 天気 =====
   Open-Meteo（APIキー不要）から、今いる場所の天気を取ってくる。
   位置情報を断られたときは東京の天気を出す。 */
const SKY_KEY = 'desknote.sky';
const GEO_KEY = 'desknote.geo';
const TOKYO = { lat: 35.6762, lon: 139.6503 };

const WEATHER = [
    { max: 0, kind: 'sun', label: '晴れ' },
    { max: 2, kind: 'suncloud', label: '晴れ時々くもり' },
    { max: 3, kind: 'cloud', label: 'くもり' },
    { max: 48, kind: 'fog', label: '霧' },
    { max: 57, kind: 'rain', label: '小雨' },
    { max: 67, kind: 'rain', label: '雨' },
    { max: 77, kind: 'snow', label: '雪' },
    { max: 82, kind: 'rain', label: 'にわか雨' },
    { max: 86, kind: 'snow', label: 'にわか雪' },
    { max: 99, kind: 'thunder', label: '雷雨' }
];

let skyOn = localStorage.getItem(SKY_KEY) !== 'off';
let weatherKind = '';

function codeToWeather(code) {
    return WEATHER.find(w => code <= w.max) || WEATHER[2];
}

async function locate() {
    const saved = localStorage.getItem(GEO_KEY);
    if (saved) return JSON.parse(saved);
    if (!navigator.geolocation) return TOKYO;

    return new Promise(resolve => {
        const done = pos => {
            const geo = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            localStorage.setItem(GEO_KEY, JSON.stringify(geo));
            resolve(geo);
        };
        navigator.geolocation.getCurrentPosition(done, () => resolve(TOKYO), { timeout: 8000 });
    });
}

function showWeather(kind, label, temp) {
    weatherKind = kind;
    $('wIcon').className = 'w-icon w-' + kind;
    $('wIcon').innerHTML = iconParts(kind);
    $('wTemp').textContent = temp === null ? '' : temp + '°';
    $('wLabel').textContent = label;
    $('weather').classList.remove('hidden');
    drawSky();
}

async function loadWeather() {
    if (demoMode) return; // お試し中は、選んだ天気をそのまま保つ
    try {
        const { lat, lon } = await locate();
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(3) +
            '&longitude=' + lon.toFixed(3) +
            '&current=temperature_2m,weather_code&timezone=auto';
        const res = await fetch(url);
        const json = await res.json();
        const code = json.current.weather_code;
        const temp = Math.round(json.current.temperature_2m);
        const w = codeToWeather(code);
        showWeather(w.kind, w.label, temp);
    } catch {
        /* 取れないときは、天気の欄を出さないままにする */
    }
}

/* ===== お試し中は、天気を自由に選べる ===== */
const DEMO_LABEL = {
    sun: '晴れ', suncloud: '晴れ時々くもり', cloud: 'くもり', fog: '霧',
    rain: '雨', snow: '雪', thunder: '雷雨'
};
const DEMO_TEMP = {
    sun: 26, suncloud: 22, cloud: 19, fog: 16, rain: 17, snow: 1, thunder: 20
};

function enterDemoWeather() {
    $('weatherPick').classList.remove('hidden');
    $('weatherPick').value = 'sun';
    showWeather('sun', DEMO_LABEL.sun, DEMO_TEMP.sun);
}

function leaveDemoWeather() {
    $('weatherPick').classList.add('hidden');
    loadWeather();
}

$('weatherPick').addEventListener('change', () => {
    const kind = $('weatherPick').value;
    showWeather(kind, DEMO_LABEL[kind], DEMO_TEMP[kind]);
});

/* アイコンは絵文字を使わず、CSSで組み立てる */
function iconParts(kind) {
    const sun = '<i class="p-sun"></i>';
    const cloud = '<i class="p-cloud"></i>';
    const drops = '<i class="p-drop"></i><i class="p-drop"></i><i class="p-drop"></i>';
    const flakes = '<i class="p-flake"></i><i class="p-flake"></i><i class="p-flake"></i>';
    const bolt = '<i class="p-bolt"></i>';
    const fog = '<i class="p-fogline"></i><i class="p-fogline"></i><i class="p-fogline"></i>';
    if (kind === 'sun') return sun;
    if (kind === 'suncloud') return sun + cloud;
    if (kind === 'cloud') return cloud;
    if (kind === 'fog') return cloud + fog;
    if (kind === 'rain') return cloud + drops;
    if (kind === 'snow') return cloud + flakes;
    if (kind === 'thunder') return cloud + bolt;
    return cloud;
}

/* 画面全体の演出。雨なら雨が降り、くもりなら少し翳る */
function drawSky() {
    const sky = $('sky');
    sky.innerHTML = '';
    sky.className = 'sky';
    if (!skyOn || !weatherKind) return;

    sky.classList.add('sky-' + weatherKind);

    if (weatherKind === 'rain' || weatherKind === 'thunder') {
        for (let i = 0; i < 60; i++) {
            const drop = document.createElement('span');
            drop.className = 'fall-rain';
            drop.style.left = Math.random() * 100 + '%';
            drop.style.animationDuration = (0.7 + Math.random() * 0.5).toFixed(2) + 's';
            drop.style.animationDelay = (Math.random() * 1.2).toFixed(2) + 's';
            drop.style.opacity = (0.18 + Math.random() * 0.22).toFixed(2);
            sky.appendChild(drop);
        }
    }

    if (weatherKind === 'snow') {
        for (let i = 0; i < 40; i++) {
            const flake = document.createElement('span');
            flake.className = 'fall-snow';
            flake.style.left = Math.random() * 100 + '%';
            flake.style.animationDuration = (6 + Math.random() * 5).toFixed(2) + 's';
            flake.style.animationDelay = (Math.random() * 6).toFixed(2) + 's';
            const size = (4 + Math.random() * 4).toFixed(1);
            flake.style.width = size + 'px';
            flake.style.height = size + 'px';
            sky.appendChild(flake);
        }
    }

    if (weatherKind === 'cloud' || weatherKind === 'suncloud' || weatherKind === 'fog' ||
        weatherKind === 'rain' || weatherKind === 'thunder') {
        const count = weatherKind === 'suncloud' ? 2 : 3;
        for (let i = 0; i < count; i++) {
            const c = document.createElement('span');
            c.className = 'drift-cloud';
            // 読む場所にかからないよう、画面のいちばん上を流す
            c.style.top = (-8 + i * 6) + '%';
            c.style.animationDuration = (70 + i * 26) + 's';
            c.style.animationDelay = (-i * 24) + 's';
            c.style.transform = 'scale(' + (0.8 + i * 0.25).toFixed(2) + ')';
            sky.appendChild(c);
        }
    }
}

$('skyBtn').addEventListener('click', () => {
    skyOn = !skyOn;
    localStorage.setItem(SKY_KEY, skyOn ? 'on' : 'off');
    $('skyBtn').classList.toggle('is-off', !skyOn);
    drawSky();
});
$('skyBtn').classList.toggle('is-off', !skyOn);

loadWeather();
setInterval(loadWeather, 15 * 60 * 1000);

/* 机に置きっぱなしで使うので、触っていない間も画面を消さない */
let wakeLock = null;
async function keepScreenOn() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
        /* 電池が少ないときなどは拒否される。そのままでよい */
    }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') keepScreenOn();
});
document.addEventListener('pointerdown', keepScreenOn, { once: true });

paintMyFace();
renderGateLists();

if (roomId) {
    openRoom(roomId, false);
} else {
    $('gate').classList.remove('hidden');
}
setInterval(renderClock, 1000);
setInterval(renderAll, 60000);
