/**
 * ============================================================
 * pj.js — Panel PJ Mata Kuliah
 * ============================================================
 * CRUD tugas hanya untuk mata kuliah yang diampu (divalidasi RLS).
 */

const pjState = {
  ctx: null,
  matkulList: [],   // mata kuliah yang diampu PJ ini
  activeMatkulId: null,
  tasks: [],        // semua tugas milik PJ ini (termasuk nonaktif)
};

document.addEventListener('DOMContentLoaded', async () => {
  let ctx;
  try {
    ctx = await requireAuth(); // PJ atau ADMIN boleh masuk
  } catch (e) {
    console.error(e);
    document.body.innerHTML =
      '<div class="auth-wrap"><div class="card auth-card"><h1>Gagal Memuat</h1>' +
      '<p class="auth-sub">' + esc(String(e?.message || e)) + '</p>' +
      '<p class="text-sm text-muted">Cek: schema.sql sudah dijalankan? Koneksi internet aktif?</p>' +
      '<a class="btn btn-ghost" href="index.html">Kembali</a></div></div>';
    return;
  }
  if (!ctx) return;

  pjState.ctx = ctx;
  renderHeader(ctx);
  ensureFontAwesome();

  await loadPjPanel();
});

async function loadPjPanel() {
  try {
    const client = getClient();
    const isAdmin = pjState.ctx.profile.role === 'ADMIN';

    // Matkul yang diampu (admin melihat semua)
    let query = client
      .from('mata_kuliah')
      .select('id, name, code, is_active')
      .order('name');
    if (!isAdmin) query = query.eq('pj_id', pjState.ctx.profile.id);

    const { data: matkul, error: e1 } = await query;
    if (e1) throw e1;
    pjState.matkulList = matkul || [];

    // Profil card
    document.getElementById('pj-name').textContent =
      pjState.ctx.profile.full_name || pjState.ctx.profile.username;
    document.getElementById('pj-username').textContent =
      `@${pjState.ctx.profile.username} · ${isAdmin ? 'Admin' : 'PJ Mata Kuliah'}`;
    document.getElementById('pj-matkul-count').textContent =
      `${pjState.matkulList.length} matkul`;

    // Select matkul
    const sel = document.getElementById('select-matkul');
    if (!pjState.matkulList.length) {
      sel.innerHTML = '<option value="">Belum ada mata kuliah yang diampu</option>';
      document.getElementById('task-list').innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fa-solid fa-book"></i>
          <p>${
            isAdmin
              ? 'Belum ada mata kuliah. Tambahkan lewat Dashboard Admin.'
              : 'Kamu belum ditugaskan sebagai PJ. Hubungi ketua kelas.'
          }</p>
        </div>`;
      document.getElementById('btn-add-task').disabled = true;
      return;
    }

    sel.innerHTML = pjState.matkulList
      .map((m) => `<option value="${esc(m.id)}">
        ${esc(m.name)} (${esc(m.code)})${m.is_active ? '' : ' — nonaktif'}
      </option>`)
      .join('');
    sel.disabled = false;
    pjState.activeMatkulId = sel.value;
    document.getElementById('btn-add-task').disabled = false;

    await loadTasks();

    // Realtime refresh
    getClient()
      .channel('pj-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks())
      .subscribe();
  } catch (e) {
    console.error(e);
    showToast(sbError(e, 'Gagal memuat panel PJ.'), 'error');
  }
}

async function loadTasks() {
  if (!pjState.activeMatkulId) return;
  try {
    const { data, error } = await getClient()
      .from('tasks')
      .select('id, subject_id, title, description, deadline, submission_url, material_file_url, notes, is_active, created_at, updated_at')
      .eq('subject_id', pjState.activeMatkulId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    pjState.tasks = data || [];
    renderPjTasks();
  } catch (e) {
    showToast(sbError(e, 'Gagal memuat tugas.'), 'error');
  }
}

function renderPjTasks() {
  const el = document.getElementById('task-list');
  const m = pjState.matkulList.find((x) => x.id === pjState.activeMatkulId);
  document.getElementById('label-matkul').textContent = m ? `${m.name} (${m.code})` : '—';

  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const fStatus = document.getElementById('filter-status')?.value || '';

  const list = pjState.tasks.filter((t) => {
    if (q && !`${t.title} ${t.description || ''}`.toLowerCase().includes(q)) return false;
    if (fStatus === 'active' && !t.is_active) return false;
    if (fStatus === 'inactive' && t.is_active) return false;
    return true;
  });

  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fa-regular fa-folder-open"></i>
        <p>Belum ada tugas. Klik "Tambah Tugas" untuk membuat.</p>
      </div>`;
    return;
  }

  el.innerHTML = list
    .map((t) => {
      const st = deadlineStatus(t.deadline);
      return `
      <div class="card task-card" style="${t.is_active ? '' : 'opacity:.55;'}">
        <div class="task-top">
          <div>
            <div class="task-title">${esc(t.title)}</div>
            <span class="badge ${st.cls}"><i class="fa-solid ${st.icon}"></i> ${esc(st.label)}</span>
            ${!t.is_active ? '<span class="badge badge-muted">Nonaktif</span>' : ''}
          </div>
        </div>
        ${t.description ? `<p class="task-desc">${esc(t.description)}</p>` : ''}
        <div class="task-meta">
          <span class="chip"><i class="fa-solid fa-calendar"></i> ${esc(formatWIB(t.deadline))}</span>
          ${t.submission_url ? '<span class="chip"><i class="fa-solid fa-link"></i> Link</span>' : ''}
          ${t.material_file_url ? '<span class="chip"><i class="fa-solid fa-file"></i> Materi</span>' : ''}
        </div>
        <div class="task-actions">
          <button class="btn btn-ghost btn-sm act-edit" data-id="${esc(t.id)}">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn btn-danger btn-sm act-toggle" data-id="${esc(t.id)}">
            <i class="fa-solid fa-power-off"></i> ${t.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
          <button class="btn btn-danger btn-sm act-del" data-id="${esc(t.id)}">
            <i class="fa-solid fa-trash"></i> Hapus
          </button>
        </div>
      </div>`;
    })
    .join('');

  el.querySelectorAll('.act-edit').forEach((b) =>
    b.addEventListener('click', () => openTaskForm(pjState.tasks.find((t) => t.id === b.dataset.id)))
  );
  el.querySelectorAll('.act-toggle').forEach((b) =>
    b.addEventListener('click', () => toggleTask(pjState.tasks.find((t) => t.id === b.dataset.id)))
  );
  el.querySelectorAll('.act-del').forEach((b) =>
    b.addEventListener('click', () => deleteTask(pjState.tasks.find((t) => t.id === b.dataset.id)))
  );
}

/* ============================================================
   FORM TAMBAH / EDIT TUGAS
   ============================================================ */
function openTaskForm(task) {
  const isEdit = !!task;
  const matkul = pjState.matkulList.find((x) => x.id === pjState.activeMatkulId);

  showModal({
    title: `${isEdit ? 'Edit' : 'Tambah'} Tugas — ${matkul?.name || ''}`,
    size: 'modal-lg',
    bodyHTML: `
      <div class="form-group">
        <label>Judul Tugas *</label>
        <input type="text" id="t-title" class="input" maxlength="200"
          placeholder="misal: Essay Pertemuan 3" value="${esc(task?.title || '')}" />
      </div>
      <div class="form-group">
        <label>Deskripsi</label>
        <textarea id="t-desc" class="input" rows="4"
          placeholder="Instruksi tugas, format pengumpulan, dll.">${esc(task?.description || '')}</textarea>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label>Deadline (WIB)</label>
          <input type="datetime-local" id="t-deadline" class="input" value="${toLocalInputValue(task?.deadline)}" />
        </div>
        <div class="form-group">
          <label>Link Pengumpulan</label>
          <input type="url" id="t-submission" class="input"
            placeholder="https://forms.gle/... atau drive" value="${esc(task?.submission_url || '')}" />
        </div>
      </div>
      <div class="form-group">
        <label>File Materi ${isEdit && task.material_file_url ? '(sudah ada — pilih file baru untuk mengganti)' : ''}</label>
        <input type="file" id="t-file" class="input" />
        ${
          isEdit && task.material_file_url
            ? `<div class="hint">Materi saat ini:
                 <a href="${esc(task.material_file_url)}" target="_blank" rel="noopener">lihat file</a></div>`
            : ''
        }
      </div>
      <div class="form-group">
        <label>Catatan</label>
        <textarea id="t-notes" class="input" rows="2"
          placeholder="Catatan tambahan (opsional)">${esc(task?.notes || '')}</textarea>
      </div>`,
    footerHTML: `
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" id="btn-save-task">
        <i class="fa-solid fa-floppy-disk"></i> Simpan Tugas
      </button>`,
  });

  document.getElementById('btn-save-task').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-task');
    const title = document.getElementById('t-title').value.trim();
    if (!title) return showToast('Judul tugas wajib diisi.', 'error');

    const deadlineRaw = document.getElementById('t-deadline').value;
    const fileInput = document.getElementById('t-file');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Menyimpan…';

    try {
      let materialUrl = task?.material_file_url || '';
      if (fileInput.files?.[0]) {
        materialUrl = await uploadMaterial(fileInput.files[0], pjState.ctx.profile.id);
      }

      const payload = {
        subject_id: pjState.activeMatkulId,
        created_by: pjState.ctx.profile.id,
        title,
        description: document.getElementById('t-desc').value.trim(),
        deadline: deadlineRaw
          ? new Date(`${deadlineRaw}:00+07:00`).toISOString() // input dianggap WIB
          : null,
        submission_url: document.getElementById('t-submission').value.trim(),
        material_file_url: materialUrl,
        notes: document.getElementById('t-notes').value.trim(),
        is_active: task ? task.is_active : true,
      };

      let error = null;
      if (isEdit) {
        // slug tidak diikutkan saat edit agar link lama tetap stabil
        ({ error } = await getClient().from('tasks').update(payload).eq('id', task.id));
      } else {
        // tasks.slug NOT NULL UNIQUE. Idealnya diisi trigger set_slug() di DB;
        // fallback ini membuat simpan tugas tetap berhasil walau trigger belum ada.
        const base = slugify(title) || 'tugas';
        ({ error } = await getClient().from('tasks').insert({ ...payload, slug: base }));
        // Judul sama (mis. "Tugas 1" di dua matkul) → coba sekali lagi dengan suffix unik
        if (error && error.code === '23505') {
          ({ error } = await getClient()
            .from('tasks')
            .insert({ ...payload, slug: `${base.slice(0, 200)}-${Math.random().toString(36).slice(2, 6)}` }));
        }
      }
      if (error) throw error;

      closeModal();
      showToast(isEdit ? 'Tugas diperbarui.' : 'Tugas ditambahkan.', 'success');
      loadTasks();
    } catch (e) {
      console.error(e);
      showToast(sbError(e, 'Gagal menyimpan tugas.'), 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Tugas';
    }
  });
}

async function toggleTask(task) {
  if (!task) return;
  const { error } = await getClient()
    .from('tasks')
    .update({ is_active: !task.is_active })
    .eq('id', task.id);
  if (error) return showToast(sbError(error, 'Gagal mengubah status tugas.'), 'error');
  showToast(task.is_active ? 'Tugas dinonaktifkan (soft delete).' : 'Tugas diaktifkan.', 'success');
  loadTasks();
}

async function deleteTask(task) {
  if (!task) return;
  const ok = await confirmDialog(
    'Hapus Tugas Permanen?',
    `"${task.title}" akan dihapus permanen dari database. Gunakan "Nonaktifkan" bila hanya ingin menyembunyikan.`
  );
  if (!ok) return;
  const { error } = await getClient().from('tasks').delete().eq('id', task.id);
  if (error) return showToast(sbError(error, 'Gagal menghapus tugas.'), 'error');
  showToast('Tugas dihapus.', 'success');
  loadTasks();
}

/* ---------------- Events ---------------- */
document.getElementById('select-matkul')?.addEventListener('change', (e) => {
  pjState.activeMatkulId = e.target.value;
  loadTasks();
});
document.getElementById('btn-add-task')?.addEventListener('click', () => openTaskForm(null));
document.getElementById('search-input')?.addEventListener('input', renderPjTasks);
document.getElementById('filter-status')?.addEventListener('change', renderPjTasks);
