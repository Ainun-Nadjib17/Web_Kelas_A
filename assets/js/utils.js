/**
 * ============================================================
 * utils.js — Helper bersama semua halaman
 * ============================================================
 * - Format waktu Asia/Jakarta (WIB)
 * - Kalkulator status deadline (Hari Ini / Besok / X Hari lagi / Terlambat)
 * - Modal, toast, konfirmasi, escape HTML, slug, upload storage
 */

const TZ = 'Asia/Jakarta';

/** Escape string agar aman dirender ke HTML */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Slug sederhana untuk penggunaan lokal */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

/** Objek Date -> "YYYY-MM-DDTHH:mm" untuk input datetime-local (zona WIB) */
function toLocalInputValue(date) {
  if (!date) return '';
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Deadline (timestamptz) -> teks tampilan WIB */
function formatWIB(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ,
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d) + ' WIB';
}

/**
 * Status deadline untuk badge.
 * return { key: 'late'|'today'|'soon'|'safe'|'none', label, cls, icon }
 * Aturan: 🔴 Hari Ini / Terlambat, 🟡 1-3 hari lagi, 🟢 >3 hari lagi
 */
function deadlineStatus(deadline) {
  if (!deadline) return { key: 'none', label: 'Tanpa deadline', cls: 'badge-muted', icon: 'fa-minus' };

  const now = new Date();
  const dl = new Date(deadline);
  if (Number.isNaN(dl.getTime())) return { key: 'none', label: 'Tanpa deadline', cls: 'badge-muted', icon: 'fa-minus' };

  // Bandingkan berdasarkan tanggal kalender WIB (bukan jam)
  const dayKey = (x) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);

  const todayKey = dayKey(now);
  const dlKey = dayKey(dl);
  if (dlKey === todayKey) {
    return { key: 'today', label: '🔴 Hari Ini', cls: 'badge-today', icon: 'fa-clock' };
  }

  const diffDays = Math.ceil((dl - now) / 86400000);
  if (diffDays < 0) return { key: 'late', label: 'Terlambat', cls: 'badge-late', icon: 'fa-triangle-exclamation' };
  if (diffDays === 1) return { key: 'soon', label: '🟡 Besok', cls: 'badge-soon', icon: 'fa-hourglass-half' };
  if (diffDays <= 3) return { key: 'soon', label: `🟡 ${diffDays} Hari lagi`, cls: 'badge-soon', icon: 'fa-hourglass-half' };
  return { key: 'safe', label: `🟢 ${diffDays} Hari lagi`, cls: 'badge-safe', icon: 'fa-calendar-check' };
}

/** Urutkan: terlambat paling bawah, lalu deadline terdekat dulu */
function compareByDeadline(a, b) {
  const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
  const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
  return da - db;
}

/* ============================================================
   TOAST
   ============================================================ */
function ensureToastContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'assets/css/style.css';
    document.head.appendChild(link);
  }
  return c;
}

/** showToast('pesan', 'success' | 'error' | 'info') */
function showToast(message, type = 'info') {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';
  el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

/* ============================================================
   MODAL (satu overlay dipakai ulang)
   ============================================================ */
function showModal({ title, bodyHTML, footerHTML = '', size = '' }) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'app-modal';
  overlay.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="modal-close" title="Tutup"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="modal-foot">${footerHTML}</div>` : ''}
    </div>`;
  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() {
  document.getElementById('app-modal')?.remove();
}

/** Dialog konfirmasi; resolve(true) jika user menekan "Ya" */
function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const overlay = showModal({
      title,
      bodyHTML: `<p class="text-muted">${esc(message)}</p>`,
      footerHTML: `
        <button class="btn btn-ghost" id="cf-no">Batal</button>
        <button class="btn btn-danger" id="cf-yes"><i class="fa-solid fa-trash"></i> Ya, lanjutkan</button>`,
    });
    overlay.querySelector('#cf-no').onclick = () => { closeModal(); resolve(false); };
    overlay.querySelector('#cf-yes').onclick = () => { closeModal(); resolve(true); };
  });
}

/* ============================================================
   SUPABASE HELPERS
   ============================================================ */
/** Tampilkan pesan error Supabase dengan ramah */
function sbError(err, fallback = 'Terjadi kesalahan.') {
  const map = {
    'Invalid login credentials': 'Email atau password salah.',
    'Email not confirmed': 'Email belum dikonfirmasi.',
    'User banned': 'Akun dinonaktifkan. Hubungi ketua kelas.',
    'Database error querying schema':
      'Skema Auth bermasalah (ada kolom NULL di auth.users). Jalankan schema.sql di Supabase SQL Editor — termasuk bagian REPAIR AUTH.',
    'null value in column "slug" of relation "tasks" violates not-null constraint':
      'Kolom slug belum diisi otomatis. Jalankan schema.sql (blok trigger set_slug) di Supabase SQL Editor.',
    'null value in column "slug" of relation "mata_kuliah" violates not-null constraint':
      'Kolom slug belum diisi otomatis. Jalankan schema.sql (blok trigger set_slug) di Supabase SQL Editor.',
  };
  return map[err?.message] || err?.message || fallback;
}

/** Upload file materi ke Storage. Path wajib diawali folder auth.uid() (sesuai policy RLS storage). */
async function uploadMaterial(file, pjId) {
  if (!file) return '';
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const safeName = slugify(file.name.replace(/\.[^.]+$/, ''));
  const path = `${pjId}/${Date.now()}-${safeName}.${ext}`;
  const { error } = await getClient().storage
    .from('materials')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = getClient().storage.from('materials').getPublicUrl(path);
  return data.publicUrl;
}

/* ============================================================
   AUTH HELPERS
   ============================================================ */
/** Ambil { user, profile } sesi aktif, atau null. */
async function getSessionContext() {
  const client = getClient();
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) return null;
  const { data: profile, error: pErr } = await client
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (pErr || !profile || !profile.is_active) {
    await client.auth.signOut();
    return null;
  }
  return { user: session.user, profile };
}

/** Redirect ke login jika belum masuk / sesi mati. return context. */
async function requireAuth(role = null) {
  const ctx = await getSessionContext();
  if (!ctx) { location.href = 'login.html'; return null; }
  if (role && ctx.profile.role !== role) {
    const target = ctx.profile.role === 'ADMIN' ? 'admin.html' : 'pj.html';
    if (location.pathname.endsWith(target)) return ctx;
    location.href = target;
    return null;
  }
  return ctx;
}

/** Pasang handler logout di elemen #btn-logout (jika ada). */
function bindLogout() {
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await getClient().auth.signOut();
    location.href = 'login.html';
  });
}
