/**
 * ============================================================
 * matkul.js — Halaman detail mata kuliah (publik)
 * ============================================================
 */

const stateMatkul = { matkul: null, tasks: [] };

document.addEventListener('DOMContentLoaded', async () => {
  let authCtx = null;
  try { authCtx = await getSessionContext(); } catch { /* config belum diisi */ }
  renderHeader(authCtx);
  ensureFontAwesome();

  if (!window.supabase || SUPABASE_CONFIG.URL.includes('YOUR_PROJECT_REF')) {
    document.getElementById('matkul-title').textContent = 'Konfigurasi Diperlukan';
    document.getElementById('tasks-list').innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fa-solid fa-plug"></i>
        <p>Isi <code class="chip">assets/js/config.js</code> &amp; jalankan <code class="chip">schema.sql</code> dulu.</p>
      </div>`;
    return;
  }

  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    document.getElementById('matkul-title').textContent = 'Mata kuliah tidak ditemukan';
    return;
  }
  await loadSubject(slug);

  getClient()
    .channel('matkul-detail')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () =>
      loadSubject(slug, { silent: true })
    )
    .subscribe();
});

async function loadSubject(slug, { silent = false } = {}) {
  try {
    const { data: m, error: e1 } = await getClient()
      .from('mata_kuliah')
      .select('id, name, code, slug, description, profiles(full_name, username)')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (e1) throw e1;

    if (!m) {
      document.getElementById('matkul-title').textContent = 'Mata kuliah tidak ditemukan';
      document.getElementById('matkul-sub').textContent =
        'Mata kuliah mungkin dinonaktifkan atau tautan salah.';
      return;
    }
    stateMatkul.matkul = m;

    document.getElementById('matkul-title').textContent = m.name;
    document.title = `${m.name} — TugasKelas`;
    document.getElementById('matkul-sub').textContent = `Kode: ${m.code}`;
    document.getElementById('matkul-pj').textContent =
      m.profiles?.full_name || m.profiles?.username || 'Belum ada PJ';
    document.getElementById('matkul-desc').textContent = m.description || '—';

    const { data: tasks, error: e2 } = await getClient()
      .from('tasks')
      .select('id, subject_id, title, description, deadline, submission_url, material_file_url, notes, is_active, created_at, updated_at')
      .eq('subject_id', m.id)
      .eq('is_active', true)
      .order('deadline', { ascending: true, nullsFirst: false });
    if (e2) throw e2;

    stateMatkul.tasks = tasks || [];
    renderTaskListMatkul();
  } catch (e) {
    console.error(e);
    if (!silent) showToast(sbError(e, 'Gagal memuat mata kuliah.'), 'error');
  }
}

function renderTaskListMatkul() {
  const el = document.getElementById('tasks-list');
  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const fStatus = document.getElementById('filter-status')?.value || '';

  const list = stateMatkul.tasks.filter((t) => {
    if (q && !`${t.title} ${t.description || ''}`.toLowerCase().includes(q)) return false;
    if (fStatus) {
      const k = deadlineStatus(t.deadline).key;
      if (fStatus === 'late' && !(k === 'late' || k === 'today')) return false;
      if (fStatus === 'soon' && k !== 'soon') return false;
      if (fStatus === 'safe' && k !== 'safe') return false;
    }
    return true;
  });

  el.innerHTML = list.length
    ? list.map((t) => taskCardHTML(t)).join('')
    : `<div class="empty-state" style="grid-column: 1 / -1;">
         <i class="fa-regular fa-folder-open"></i>
         <p>Belum ada tugas pada mata kuliah ini.</p>
       </div>`;

  el.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('click', () => {
      const t = stateMatkul.tasks.find((x) => x.id === card.dataset.taskId);
      if (t) openTaskDetailMatkul(t);
    });
  });
}

function openTaskDetailMatkul(task) {
  const st = deadlineStatus(task.deadline);
  const m = stateMatkul.matkul;
  showModal({
    title: task.title,
    size: 'modal-lg',
    bodyHTML: `
      <div class="detail-list">
        <div class="detail-item">
          <div class="d-label">Status Deadline</div>
          <div class="d-value">
            <span class="badge ${st.cls}"><i class="fa-solid ${st.icon}"></i> ${esc(st.label)}</span>
            <span class="text-muted text-sm"> · ${esc(formatWIB(task.deadline))}</span>
          </div>
        </div>
        ${task.description ? `
        <div class="detail-item">
          <div class="d-label">Deskripsi</div>
          <div class="d-value">${esc(task.description)}</div>
        </div>` : ''}
        ${task.notes ? `
        <div class="detail-item">
          <div class="d-label">Catatan</div>
          <div class="d-value">${esc(task.notes)}</div>
        </div>` : ''}
        ${task.submission_url ? `
        <div class="detail-item">
          <div class="d-label">Link Pengumpulan</div>
          <div class="d-value">
            <a href="${esc(task.submission_url)}" target="_blank" rel="noopener">${esc(task.submission_url)}</a>
          </div>
        </div>` : ''}
        ${task.material_file_url ? `
        <div class="detail-item">
          <div class="d-label">File Materi</div>
          <div class="d-value">
            <a class="btn btn-ghost btn-sm" href="${esc(task.material_file_url)}" target="_blank" rel="noopener">
              <i class="fa-solid fa-download"></i> Unduh Materi
            </a>
          </div>
        </div>` : ''}
        <div class="detail-item">
          <div class="d-label">Info</div>
          <div class="d-value text-muted text-sm">
            Dibuat ${esc(formatWIB(task.created_at))} · Diperbarui ${esc(formatWIB(task.updated_at))}
          </div>
        </div>
      </div>`,
    footerHTML: `
      ${task.submission_url ? `<a class="btn btn-primary" href="${esc(task.submission_url)}" target="_blank" rel="noopener"><i class="fa-solid fa-upload"></i> Kumpulkan Tugas</a>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Tutup</button>`,
  });
  void m;
}

document.getElementById('search-input')?.addEventListener('input', renderTaskListMatkul);
document.getElementById('filter-status')?.addEventListener('change', renderTaskListMatkul);
