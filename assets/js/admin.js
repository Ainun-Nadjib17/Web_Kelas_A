/**
 * ============================================================
 * admin.js — Dashboard Admin (Ketua Kelas)
 * ============================================================
 * Manajemen akun PJ via RPC: admin_create_user, admin_set_password,
 * admin_delete_user, + update tabel profiles langsung.
 */

document.addEventListener('DOMContentLoaded', async () => {
  let ctx;
  try {
    ctx = await requireAuth('ADMIN');
  } catch (e) {
    console.error(e);
    document.body.innerHTML =
      '<div class="auth-wrap"><div class="card auth-card"><h1>Gagal Memuat</h1>' +
      '<p class="auth-sub">' + esc(String(e?.message || e)) + '</p>' +
      '<p class="text-sm text-muted">Cek: schema.sql sudah dijalankan? Koneksi internet aktif?</p>' +
      '<a class="btn btn-ghost" href="index.html">Kembali</a></div></div>';
    return;
  }
  if (!ctx) return; // sudah di-redirect
  currentAdminId = ctx.profile.id;

  renderHeader(ctx);
  ensureFontAwesome();

  await loadAdminData();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('btn-add-matkul').addEventListener('click', () => openMatkulForm(null));
  document.getElementById('btn-add-pj').addEventListener('click', openCreateUserForm);
});

/* ============================================================
   DATA
   ============================================================ */
const adminState = { profiles: [], matkul: [], tasks: [] };

async function loadAdminData() {
  try {
    const client = getClient();
    const [profRes, mkRes, taskRes] = await Promise.all([
      client.from('profiles').select('*').order('full_name'),
      client.from('mata_kuliah').select('id, name, code, slug, description, pj_id, is_active').order('name'),
      client.from('tasks').select('id, subject_id, is_active'),
    ]);
    if (profRes.error) throw profRes.error;
    if (mkRes.error) throw mkRes.error;
    if (taskRes.error) throw taskRes.error;

    adminState.profiles = profRes.data || [];
    adminState.matkul = mkRes.data || [];
    adminState.tasks = taskRes.data || [];

    renderAdminStats();
    renderMatkulTable();
    renderPjTable();
  } catch (e) {
    console.error(e);
    showToast(sbError(e, 'Gagal memuat data admin.'), 'error');
  }
}

function renderAdminStats() {
  document.getElementById('stat-matkul').textContent = adminState.matkul.length;
  document.getElementById('stat-pj').textContent =
    adminState.profiles.filter((p) => p.role === 'PJ').length;
  document.getElementById('stat-tugas').textContent = adminState.tasks.length;
  document.getElementById('stat-aktif').textContent = adminState.tasks.filter((t) => t.is_active).length;
}

/* ============================================================
   TAB: MATA KULIAH
   ============================================================ */
function renderMatkulTable() {
  const tbody = document.getElementById('matkul-tbody');
  if (!adminState.matkul.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:30px;">
      Belum ada mata kuliah. Klik "Tambah Matkul".</td></tr>`;
    return;
  }

  tbody.innerHTML = adminState.matkul
    .map((m) => {
      const pj = adminState.profiles.find((p) => p.id === m.pj_id);
      const taskCount = adminState.tasks.filter((t) => t.subject_id === m.id).length;
      return `
      <tr>
        <td><code class="chip">${esc(m.code)}</code></td>
        <td><strong>${esc(m.name)}</strong></td>
        <td>${pj ? esc(pj.full_name || pj.username) : '<span class="text-muted">—</span>'}</td>
        <td>${taskCount}</td>
        <td>${
          m.is_active
            ? '<span class="badge badge-safe"><i class="fa-solid fa-check"></i> Aktif</span>'
            : '<span class="badge badge-muted">Nonaktif</span>'
        }</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${esc(m.id)}" title="Edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-ghost btn-sm" data-act="assign" data-id="${esc(m.id)}" title="Ganti PJ">
              <i class="fa-solid fa-user-pen"></i>
            </button>
            <button class="btn btn-danger btn-sm" data-act="toggle" data-id="${esc(m.id)}"
              title="${m.is_active ? 'Nonaktifkan' : 'Aktifkan'}">
              <i class="fa-solid fa-power-off"></i>
            </button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = adminState.matkul.find((x) => x.id === btn.dataset.id);
      if (!m) return;
      if (btn.dataset.act === 'edit') openMatkulForm(m);
      if (btn.dataset.act === 'assign') openAssignPjForm(m);
      if (btn.dataset.act === 'toggle') toggleMatkul(m);
    });
  });
}

function openMatkulForm(matkul) {
  const isEdit = !!matkul;
  showModal({
    title: isEdit ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah',
    bodyHTML: `
      <div class="form-group">
        <label>Kode Matkul *</label>
        <input type="text" id="f-code" class="input" maxlength="20"
          placeholder="misal: TIF3204" value="${esc(matkul?.code || '')}" />
      </div>
      <div class="form-group">
        <label>Nama Mata Kuliah *</label>
        <input type="text" id="f-name" class="input" maxlength="150"
          placeholder="misal: Pemrograman Web" value="${esc(matkul?.name || '')}" />
      </div>
      <div class="form-group">
        <label>Deskripsi</label>
        <textarea id="f-desc" class="input" rows="3" placeholder="Deskripsi singkat (opsional)">${esc(matkul?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Penanggung Jawab (PJ)</label>
        <select id="f-pj" class="input">
          <option value="">— Belum ditentukan —</option>
          ${adminState.profiles
            .filter((p) => p.role === 'PJ' && p.is_active)
            .map((p) => `<option value="${esc(p.id)}" ${matkul?.pj_id === p.id ? 'selected' : ''}>
              ${esc(p.full_name || p.username)} (@${esc(p.username)})
            </option>`)
            .join('')}
        </select>
        <div class="hint">PJ bisa diubah kapan saja lewat ikon <i class="fa-solid fa-user-pen"></i>.</div>
      </div>`,
    footerHTML: `
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" id="btn-save-matkul">
        <i class="fa-solid fa-floppy-disk"></i> Simpan
      </button>`,
  });

  document.getElementById('btn-save-matkul').addEventListener('click', async () => {
    const code = document.getElementById('f-code').value.trim().toUpperCase();
    const name = document.getElementById('f-name').value.trim();
    const description = document.getElementById('f-desc').value.trim();
    const pj_id = document.getElementById('f-pj').value || null;

    if (!code || !name) {
      showToast('Kode dan nama mata kuliah wajib diisi.', 'error');
      return;
    }

    const payload = { code, name, description, pj_id };
    // Slug dikirim sebagai cadangan; trigger set_slug() di DB menggantinya
    // dengan slug unik hasil generate_slug() saat INSERT.
    if (!isEdit) payload.slug = slugify(name);
    try {
      const { error } = isEdit
        ? await getClient().from('mata_kuliah').update(payload).eq('id', matkul.id)
        : await getClient().from('mata_kuliah').insert(payload);
      if (error) throw error;
      closeModal();
      showToast(isEdit ? 'Mata kuliah diperbarui.' : 'Mata kuliah ditambahkan.', 'success');
      loadAdminData();
    } catch (e) {
      console.error(e);
      showToast(sbError(e, 'Gagal menyimpan mata kuliah.'), 'error');
    }
  });
}

function openAssignPjForm(matkul) {
  showModal({
    title: `Ganti PJ — ${matkul.name}`,
    bodyHTML: `
      <div class="form-group">
        <label>Pilih PJ baru</label>
        <select id="f-assign-pj" class="input">
          <option value="">— Kosongkan PJ —</option>
          ${adminState.profiles
            .filter((p) => p.role === 'PJ' && p.is_active)
            .map((p) => `<option value="${esc(p.id)}" ${matkul.pj_id === p.id ? 'selected' : ''}>
              ${esc(p.full_name || p.username)} (@${esc(p.username)})
            </option>`)
            .join('')}
        </select>
        <div class="hint">PJ lama otomatis kehilangan akses edit untuk matkul ini (diatur RLS).</div>
      </div>`,
    footerHTML: `
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" id="btn-do-assign">
        <i class="fa-solid fa-user-check"></i> Simpan
      </button>`,
  });

  document.getElementById('btn-do-assign').addEventListener('click', async () => {
    const pj_id = document.getElementById('f-assign-pj').value || null;
    try {
      const { error } = await getClient()
        .from('mata_kuliah')
        .update({ pj_id })
        .eq('id', matkul.id);
      if (error) throw error;
      closeModal();
      showToast('PJ diperbarui.', 'success');
      loadAdminData();
    } catch (e) {
      showToast(sbError(e, 'Gagal mengganti PJ.'), 'error');
    }
  });
}

async function toggleMatkul(m) {
  const turningOff = m.is_active;
  const ok = await confirmDialog(
    turningOff ? 'Nonaktifkan Mata Kuliah?' : 'Aktifkan Mata Kuliah?',
    turningOff
      ? `"${m.name}" akan disembunyikan dari mahasiswa (soft delete).`
      : `"${m.name}" akan tampil kembali di dashboard publik.`
  );
  if (!ok) return;
  const { error } = await getClient()
    .from('mata_kuliah')
    .update({ is_active: !m.is_active })
    .eq('id', m.id);
  if (error) return showToast(sbError(error, 'Gagal mengubah status.'), 'error');
  showToast('Status mata kuliah diperbarui.', 'success');
  loadAdminData();
}

/* ============================================================
   TAB: AKUN PJ (via RPC — tanpa Edge Function)
   ============================================================ */
async function rpcAdminCall(fnName, params) {
  const { data, error } = await getClient().rpc(fnName, params);
  if (error) {
    // Catat detail mentah ke console: code/message/details/hint PostgREST
    // adalah satu-satunya cara cepat tahu kenapa RPC ditolak.
    console.error('[rpc:' + fnName + ']', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      args: Object.keys(params || {}),
    });
    // PGRST202 = PostgREST tidak menemukan fungsi/signature-nya di schema cache.
    // Selalu terjadi kalau schema.sql belum dijalankan, dan bisa juga sesaat
    // setelah fungsi dibuat (cache belum reload).
    const hint =
      error.code === 'PGRST202'
        ? ' RPC ' + fnName + ' belum ada di database — jalankan schema.sql (bagian ADMIN USER MANAGEMENT), lalu coba lagi.'
        : '';
    throw new Error(sbError(error, 'Request gagal.') + hint);
  }
  return data;
}

async function callAdminAuth(payload) {
  switch (payload.action) {
    case 'create-user':
      return rpcAdminCall('admin_create_user', {
        p_full_name: payload.fullName,
        p_username: payload.username,
        p_password: payload.password,
        p_role: payload.role,
        p_email: payload.email || null,
      });
    case 'reset-password':
      return rpcAdminCall('admin_set_password', {
        p_user_id: payload.userId,
        p_password: payload.password,
      });
    case 'set-active':
      return updateProfileRow(payload.userId, { is_active: payload.isActive });
    case 'delete-user':
      return rpcAdminCall('admin_delete_user', { p_user_id: payload.userId });
    default:
      throw new Error('Aksi tidak dikenal.');
  }
}

/** Admin punya policy ALL di profiles — update langsung lewat tabel. */
async function updateProfileRow(userId, fields) {
  const { error } = await getClient().from('profiles').update(fields).eq('id', userId);
  if (error) throw new Error(sbError(error, 'Gagal memperbarui akun.'));
}

function renderPjTable() {
  const tbody = document.getElementById('pj-tbody');
  if (!adminState.profiles.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:30px;">
      Belum ada akun.</td></tr>`;
    return;
  }

  tbody.innerHTML = adminState.profiles
    .map((p) => {
      const matkulDiampu = adminState.matkul.filter((m) => m.pj_id === p.id);
      const isSelf = p.id === currentAdminId;
      return `
      <tr style="${p.is_active ? '' : 'opacity:.55;'}">
        <td><strong>${esc(p.full_name || p.username)}</strong>${isSelf ? ' <span class="badge badge-primary">Kamu</span>' : ''}</td>
        <td>@${esc(p.username)}</td>
        <td><span class="badge ${p.role === 'ADMIN' ? 'badge-primary' : 'badge-muted'}">${esc(p.role)}</span></td>
        <td>${
          matkulDiampu.length
            ? matkulDiampu.map((m) => esc(m.name)).join(', ')
            : '<span class="text-muted">—</span>'
        }</td>
        <td>${
          p.is_active
            ? '<span class="badge badge-safe"><i class="fa-solid fa-check"></i> Aktif</span>'
            : '<span class="badge badge-late"><i class="fa-solid fa-ban"></i> Nonaktif</span>'
        }</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-pact="reset" data-id="${esc(p.id)}" title="Reset password">
              <i class="fa-solid fa-key"></i>
            </button>
            <button class="btn btn-ghost btn-sm" data-pact="toggle" data-id="${esc(p.id)}"
              title="${p.is_active ? 'Nonaktifkan' : 'Aktifkan'}">
              <i class="fa-solid fa-power-off"></i>
            </button>
            ${!isSelf ? `
            <button class="btn btn-danger btn-sm" data-pact="delete" data-id="${esc(p.id)}" title="Hapus permanen">
              <i class="fa-solid fa-trash"></i>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('button[data-pact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = adminState.profiles.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      if (btn.dataset.pact === 'reset') openResetPasswordForm(p);
      if (btn.dataset.pact === 'toggle') togglePjActive(p);
      if (btn.dataset.pact === 'delete') deletePjUser(p);
    });
  });
}

let currentAdminId = null;

function openCreateUserForm() {
  showModal({
    title: 'Buat Akun Baru',
    bodyHTML: `
      <div class="form-row form-row-2">
        <div class="form-group">
          <label>Nama Lengkap *</label>
          <input type="text" id="f-fullname" class="input" placeholder="misal: Budi Santoso" />
        </div>
        <div class="form-group">
          <label>Username *</label>
          <input type="text" id="f-username" class="input" placeholder="misal: budi" />
        </div>
      </div>
      <div class="form-group">
        <label>Email <span class="text-muted">(opsional — login tetap pakai username)</span></label>
        <input type="email" id="f-email" class="input" placeholder="kosongkan jika tidak ada" />
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label>Password * <span class="text-muted">(min. 8 karakter)</span></label>
          <input type="text" id="f-password" class="input" placeholder="min. 8 karakter" />
        </div>
        <div class="form-group">
          <label>Role</label>
          <select id="f-role" class="input">
            <option value="PJ" selected>PJ Mata Kuliah</option>
            <option value="ADMIN">Admin / Ketua Kelas</option>
          </select>
        </div>
      </div>`,
    footerHTML: `
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" id="btn-create-user">
        <i class="fa-solid fa-user-plus"></i> Buat Akun
      </button>`,
  });

  document.getElementById('btn-create-user').addEventListener('click', async () => {
    const btn = document.getElementById('btn-create-user');
    const payload = {
      action: 'create-user',
      fullName: document.getElementById('f-fullname').value.trim(),
      username: document.getElementById('f-username').value.trim().toLowerCase(),
      email: document.getElementById('f-email').value.trim(),
      password: document.getElementById('f-password').value,
      role: document.getElementById('f-role').value,
    };
    if (!payload.fullName || !payload.username || payload.password.length < 8) {
      showToast('Lengkapi nama, username. Password minimal 8 karakter.', 'error');
      return;
    }
    btn.disabled = true;
    try {
      await callAdminAuth(payload);
      closeModal();
      showToast(`Akun ${payload.username} dibuat.`, 'success');
      loadAdminData();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

function openResetPasswordForm(p) {
  showModal({
    title: `Reset Password — ${p.full_name || p.username}`,
    bodyHTML: `
      <div class="form-group">
        <label>Password baru (min. 8 karakter)</label>
        <input type="text" id="f-new-password" class="input" placeholder="password baru" />
      </div>
      <p class="text-muted text-sm">User akan langsung bisa login dengan password baru ini.</p>`,
    footerHTML: `
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" id="btn-do-reset"><i class="fa-solid fa-key"></i> Reset</button>`,
  });

  document.getElementById('btn-do-reset').addEventListener('click', async () => {
    const password = document.getElementById('f-new-password').value;
    if (password.length < 8) return showToast('Minimal 8 karakter.', 'error');
    try {
      await callAdminAuth({ action: 'reset-password', userId: p.id, password });
      closeModal();
      showToast('Password direset.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function togglePjActive(p) {
  const turningOff = p.is_active;
  const ok = await confirmDialog(
    turningOff ? 'Nonaktifkan Akun?' : 'Aktifkan Akun?',
    turningOff
      ? `${p.full_name || p.username} tidak akan bisa login (soft-disable).`
      : `${p.full_name || p.username} akan bisa login kembali.`
  );
  if (!ok) return;
  try {
    await callAdminAuth({ action: 'set-active', userId: p.id, isActive: !p.is_active });
    showToast('Status akun diperbarui.', 'success');
    loadAdminData();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deletePjUser(p) {
  const ok = await confirmDialog(
    'Hapus Akun Permanen?',
    `Akun ${p.full_name || p.username} dan profilenya akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
  );
  if (!ok) return;
  try {
    await callAdminAuth({ action: 'delete-user', userId: p.id });
    showToast('Akun dihapus.', 'success');
    loadAdminData();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
