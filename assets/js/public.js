/**
 * ============================================================
 * public.js — Dashboard publik (mahasiswa, tanpa login)
 * ============================================================
 */

const state = {
  matkul: [],   // mata_kuliah aktif + pj name
  tasks: [],    // tasks aktif
};

document.addEventListener('DOMContentLoaded', async () => {
  // Header: cek sesi (kalau PJ/Admin login, tampil tombol dashboard)
  let authCtx = null;
  try { authCtx = await getSessionContext(); } catch { /* config belum diisi */ }
  renderHeader(authCtx);
  ensureFontAwesome();

  if (!window.supabase || SUPABASE_CONFIG.URL.includes('YOUR_PROJECT_REF')) {
    renderConfigWarning();
    return;
  }

  await loadAll();

  // Realtime: refresh otomatis saat ada perubahan
  getClient()
    .channel('public-dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mata_kuliah' }, loadAll)
    .subscribe();
});

function renderConfigWarning() {
  document.getElementById('hero-title').textContent = 'Konfigurasi Diperlukan';
  ['upcoming-list', 'matkul-list', 'tasks-list'].forEach((id) => {
    document.getElementById(id).innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-plug"></i>
        <p>Supabase belum dikonfigurasi.<br>
        Isi <code class="chip">assets/js/config.js</code> dengan Project URL &amp; anon key,
        lalu jalankan <code class="chip">schema.sql</code> di SQL Editor Supabase.</p>
      </div>`;
  });
}

async function loadAll() {
  try {
    await Promise.all([loadMatkul(), loadTasks()]);
    renderStats();
    renderUpcoming();
    renderMatkulList();
    renderTaskList();
    fillFilterOptions();
  } catch (e) {
    console.error(e);
    showToast(sbError(e, 'Gagal memuat data.'), 'error');
  }
}

/* ---------------- Fetch ---------------- */
async function loadMatkul() {
  const { data, error } = await getClient()
    .from('mata_kuliah')
    .select('id, name, code, slug, description, is_active, profiles(full_name, username)')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  state.matkul = (data || []).map((m) => ({
    ...m,
    pj_name: m.profiles?.full_name || m.profiles?.username || 'Belum ada PJ',
  }));
}

async function loadTasks() {
  const { data, error } = await getClient()
    .from('tasks')
    .select('id, subject_id, title, slug, description, deadline, submission_url, material_file_url, notes, is_active, created_at, updated_at')
    .eq('is_active', true)
    .order('deadline', { ascending: true, nullsFirst: false });
  if (error) throw error;
  state.tasks = data || [];
}

/* ---------------- Render ---------------- */
function renderStats() {
  const in3 = new Date(Date.now() + 3 * 86400000);
  const soonCount = state.tasks.filter(
    (t) => t.deadline && new Date(t.deadline) <= in3
  ).length;

  document.getElementById('stat-matkul').textContent = state.matkul.length;
  document.getElementById('stat-pj').textContent = new Set(
    state.matkul.map((m) => m.pj_name).filter(Boolean)
  ).size;
  document.getElementById('stat-tugas').textContent = state.tasks.length;
  document.getElementById('stat-deadline').textContent = soonCount;
}

function renderUpcoming() {
  const el = document.getElementById('upcoming-list');
  const upcoming = state.tasks
    .filter((t) => t.deadline && new Date(t.deadline) >= new Date())
    .sort(compareByDeadline)
    .slice(0, 3);

  if (!upcoming.length) {
    el.innerHTML = emptyHTML('Tidak ada deadline mendekat.');
    return;
  }
  el.innerHTML = upcoming
    .map((t) => taskCardHTML(t, { getSubjectName: subjectName }))
    .join('');
  bindTaskCards(el);
}

function renderMatkulList() {
  const el = document.getElementById('matkul-list');
  if (!state.matkul.length) {
    el.innerHTML = emptyHTML('Belum ada mata kuliah. Admin dapat menambahkannya di dashboard.');
    return;
  }
  el.innerHTML = state.matkul
    .map((m) => {
      const count = state.tasks.filter((t) => t.subject_id === m.id).length;
      return `
      <div class="card clickable" data-matkul-slug="${esc(m.slug)}">
        <div class="flex-between">
          <h3>${esc(m.name)}</h3>
          <code class="chip">${esc(m.code)}</code>
        </div>
        <p class="sub mt-1">${esc(m.description || 'Tanpa deskripsi.')}</p>
        <div class="task-meta mt-2">
          <span class="chip"><i class="fa-solid fa-user-tie"></i> ${esc(m.pj_name)}</span>
          <span class="chip"><i class="fa-solid fa-clipboard-list"></i> ${count} tugas</span>
        </div>
      </div>`;
    })
    .join('');
  el.querySelectorAll('[data-matkul-slug]').forEach((card) => {
    card.addEventListener('click', () => {
      location.href = `matkul.html?slug=${encodeURIComponent(card.dataset.matkulSlug)}`;
    });
  });
}

function renderTaskList() {
  const el = document.getElementById('tasks-list');
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  const fMatkul = document.getElementById('filter-matkul').value;
  const fStatus = document.getElementById('filter-status').value;

  let list = state.tasks.filter((t) => {
    if (q && !`${t.title} ${t.description || ''}`.toLowerCase().includes(q)) return false;
    if (fMatkul && t.subject_id !== fMatkul) return false;
    if (fStatus) {
      const k = deadlineStatus(t.deadline).key;
      if (fStatus === 'late' && !(k === 'late' || k === 'today')) return false;
      if (fStatus === 'soon' && k !== 'soon') return false;
      if (fStatus === 'safe' && k !== 'safe') return false;
    }
    return true;
  });

  el.innerHTML = list.length
    ? list.map((t) => taskCardHTML(t, { getSubjectName: subjectName })).join('')
    : emptyHTML('Tidak ada tugas yang cocok dengan pencarian/filter.');

  bindTaskCards(el);
}

function subjectName(id) {
  return state.matkul.find((m) => m.id === id)?.name || 'Mata Kuliah';
}

function emptyHTML(msg) {
  return `
    <div class="empty-state" style="grid-column: 1 / -1;">
      <i class="fa-regular fa-folder-open"></i>
      <p>${esc(msg)}</p>
    </div>`;
}

function bindTaskCards(container) {
  container.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('click', () => {
      const t = state.tasks.find((x) => x.id === card.dataset.taskId);
      if (t) openTaskDetail(t);
    });
  });
}

/* ---------------- Detail tugas (modal) ---------------- */
function openTaskDetail(task) {
  const st = deadlineStatus(task.deadline);
  showModal({
    title: task.title,
    size: 'modal-lg',
    bodyHTML: `
      <div class="detail-list">
        <div class="detail-item">
          <div class="d-label">Mata Kuliah &amp; PJ</div>
          <div class="d-value">${esc(subjectName(task.subject_id))} — ${esc(
            state.matkul.find((m) => m.id === task.subject_id)?.pj_name || '—'
          )}</div>
        </div>
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
            <a href="${esc(task.submission_url)}" target="_blank" rel="noopener">
              ${esc(task.submission_url)} <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
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
}

/* ---------------- Events ---------------- */
document.getElementById('search-input')?.addEventListener('input', renderTaskList);
document.getElementById('filter-matkul')?.addEventListener('change', renderTaskList);
document.getElementById('filter-status')?.addEventListener('change', renderTaskList);

function fillFilterOptions() {
  const sel = document.getElementById('filter-matkul');
  const current = sel.value;
  sel.innerHTML =
    '<option value="">Semua Mata Kuliah</option>' +
    state.matkul
      .map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`)
      .join('');
  sel.value = current;
}
