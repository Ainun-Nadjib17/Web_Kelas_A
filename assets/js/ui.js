/**
 * ============================================================
 * ui.js — Komponen UI bersama (navbar, skeleton, task card)
 * ============================================================
 */

/** Render header/navigasi standar. authCtx = hasil requireAuth/getSessionContext atau null. */
function renderHeader(authCtx = null, activeNav = '') {
  const el = document.getElementById('app-header');
  if (!el) return;

  const isAuthed = !!authCtx;
  const isAdmin = authCtx?.profile?.role === 'ADMIN';
  const isPJ = authCtx?.profile?.role === 'PJ';

  el.innerHTML = `
    <nav class="navbar">
      <a class="brand" href="index.html">
        <span class="logo"><i class="fa-solid fa-graduation-cap"></i></span>
        <span>TugasKelas</span>
      </a>
      <div class="nav-actions">
        ${
          isAuthed
            ? `
          <span class="nav-user hidden-on-mobile">
            <i class="fa-solid fa-user"></i>
            <span><strong>${esc(authCtx.profile.full_name || authCtx.profile.username)}</strong>
            · ${isAdmin ? 'Admin' : 'PJ'}</span>
          </span>
          ${
            isAdmin
              ? `<a class="btn btn-ghost btn-sm" href="admin.html"><i class="fa-solid fa-gauge-high"></i> Dashboard</a>`
              : `<a class="btn btn-ghost btn-sm" href="pj.html"><i class="fa-solid fa-gauge-high"></i> Dashboard</a>`
          }
          <button class="btn btn-ghost btn-sm" id="btn-logout" title="Keluar">
            <i class="fa-solid fa-right-from-bracket"></i>
          </button>`
            : `
          <a class="btn btn-ghost btn-sm" href="index.html"><i class="fa-solid fa-house"></i> Beranda</a>
          <a class="btn btn-primary btn-sm" href="login.html"><i class="fa-solid fa-right-to-bracket"></i> Login</a>`
        }
      </div>
    </nav>`;

  if (isAuthed) bindLogout();
}

/** Skeleton loading cards */
function renderSkeletons(container, n = 4, cls = 'skeleton') {
  if (!container) return;
  container.innerHTML = Array.from({ length: n })
    .map(() => `<div class="${cls}"></div>`)
    .join('');
}

/** Kartu tugas untuk daftar publik/panel. getSubjectName: fn(task)->nama matkul */
function taskCardHTML(task, { getSubjectName = null, showActions = false } = {}) {
  const st = deadlineStatus(task.deadline);
  const subject = getSubjectName ? getSubjectName(task.subject_id) : null;
  return `
    <div class="card task-card clickable" data-task-id="${esc(task.id)}">
      <div class="task-top">
        <div>
          <div class="task-title">${esc(task.title)}</div>
          ${subject ? `<div class="sub">${esc(subject)}</div>` : ''}
        </div>
        <span class="badge ${st.cls}"><i class="fa-solid ${st.icon}"></i> ${esc(st.label)}</span>
      </div>
      ${task.description ? `<p class="task-desc">${esc(task.description)}</p>` : ''}
      <div class="task-meta">
        <span class="chip"><i class="fa-solid fa-calendar"></i> ${esc(formatWIB(task.deadline))}</span>
        ${task.submission_url ? `<a class="chip" href="${esc(task.submission_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fa-solid fa-link"></i> Link pengumpulan</a>` : ''}
        ${task.material_file_url ? `<span class="chip"><i class="fa-solid fa-file"></i> Materi</span>` : ''}
      </div>
      ${
        showActions
          ? `
      <div class="task-actions">
        <button class="btn btn-ghost btn-sm act-edit" data-id="${esc(task.id)}">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button class="btn btn-danger btn-sm act-del" data-id="${esc(task.id)}">
          <i class="fa-solid fa-trash"></i> Hapus
        </button>
      </div>`
          : ''
      }
    </div>`;
}

/** Sisipkan ikon Font Awesome ke <head> jika belum ada (lokal, tanpa CDN) */
function ensureFontAwesome() {
  if (!document.querySelector('link[data-fa]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'assets/vendor/fontawesome/css/all.min.css?v=3';
    l.setAttribute('data-fa', '1');
    document.head.appendChild(l);
  }
}
