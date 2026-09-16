/**
 * ============================================================
 * auth.js — Login PJ & Admin (Supabase Auth)
 * ============================================================
 * Login cukup username + password. Username di-resolve ke email
 * sintetis lewat RPC lookup_login_email (fallback: kandidat email).
 * Semua error ditampilkan di kotak error — tidak ada fail diam-diam.
 */

// Pasang listener SEBELUM apapun yang bisa gagal.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (form) form.addEventListener('submit', handleLogin);
  initLoginPage();
});

async function initLoginPage() {
  try {
    if (!window.supabase) {
      showLoginError('Library Supabase gagal dimuat (assets/vendor/supabase.js). Hard refresh: Ctrl+Shift+R');
      return;
    }
    renderHeader(null);
    ensureFontAwesome();

    // Sudah login? Langsung arahkan sesuai role.
    const ctx = await getSessionContext();
    if (ctx) {
      location.href = ctx.profile.role === 'ADMIN' ? 'admin.html' : 'pj.html';
    }
  } catch (e) {
    console.error('[initLoginPage]', e);
    showLoginError('Init gagal: ' + (e?.message || e));
  }
}

/** Kandidat email dari username: user@kelas.local / user@gmail.com */
function emailCandidates(rawUsername) {
  const u = rawUsername.trim().toLowerCase();
  return u.includes('@') ? [u] : [`${u}@kelas.local`, `${u}@gmail.com`];
}

/** Resolve username -> email terdaftar di Supabase Auth. */
async function resolveEmail(rawUsername) {
  try {
    const { data, error } = await getClient().rpc('lookup_login_email', { p_username: rawUsername.trim() });
    if (!error && data) return data;
    console.warn('[resolveEmail] RPC gagal (fallback ke kandidat):', error?.message);
  } catch (e) {
    console.warn('[resolveEmail] RPC error:', e?.message);
  }
  // Fallback: kandidat pertama (username@kelas.local)
  return emailCandidates(rawUsername)[0];
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const errBox = document.getElementById('login-error');
  if (errBox) errBox.classList.remove('show');

  const username = document.getElementById('username')?.value.trim()
    ?? document.getElementById('email')?.value.trim() ?? '';
  const password = document.getElementById('password')?.value ?? '';

  if (!username || !password) {
    showLoginError('Isi username dan password.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Memproses…';
  }

  try {
    const email = await resolveEmail(username);
    console.info('[login] mencoba sebagai', email);

    const { error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Cek profile aktif + role
    const { data: { session } } = await getClient().auth.getSession();
    const { data: profile, error: pErr } = await getClient()
      .from('profiles')
      .select('role, is_active, full_name')
      .eq('id', session.user.id)
      .single();

    if (pErr || !profile) {
      await getClient().auth.signOut();
      throw new Error('Profile tidak ditemukan. Jalankan schema.sql / hubungi ketua kelas.');
    }
    if (!profile.is_active) {
      await getClient().auth.signOut();
      throw new Error('Akun dinonaktifkan. Hubungi ketua kelas.');
    }

    showToast(`Selamat datang, ${profile.full_name || ''}!`, 'success');
    location.href = profile.role === 'ADMIN' ? 'admin.html' : 'pj.html';
  } catch (err) {
    console.error('[login]', err);
    showLoginError(sbError(err, 'Login gagal.'));
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk';
    }
  }
}

function showLoginError(msg) {
  const errBox = document.getElementById('login-error');
  if (errBox) {
    errBox.textContent = msg;
    errBox.classList.add('show');
    errBox.style.display = 'block';
  } else {
    alert(msg);
  }
}
