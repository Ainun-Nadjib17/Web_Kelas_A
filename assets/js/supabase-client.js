/**
 * Supabase client (dibuat setelah UMD bundle dimuat).
 * CATATAN: nama variabel BUKAN `supabase` — supaya tidak bentrok
 * dengan global `var supabase` dari bundle supabase-js UMD.
 */
let _sbClient = null;

function getClient() {
  if (!_sbClient) {
    if (!window.supabase) {
      throw new Error('supabase-js belum dimuat. Pastikan assets/vendor/supabase.js termuat.');
    }
    if (
      SUPABASE_CONFIG.URL.includes('YOUR_PROJECT_REF') ||
      SUPABASE_CONFIG.ANON_KEY.includes('YOUR_ANON_KEY') ||
      !SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY
    ) {
      throw new Error(
        'Konfigurasi Supabase belum diisi. Buka assets/js/config.js dan isi URL & ANON_KEY.'
      );
    }
    _sbClient = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: false },
    });
  }
  return _sbClient;
}
