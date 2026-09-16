# 🎓 TugasKelas — Manajemen Tugas Kelas

Aplikasi web untuk memusatkan informasi tugas mata kuliah, agar mahasiswa tidak perlu terus bertanya kepada PJ.

**Stack:** HTML5 + CSS3 + Vanilla JS · Supabase (Postgres, Auth, Storage, Realtime)

## Fitur

| Role | Kemampuan |
|---|---|
| **Mahasiswa/Public** | Lihat matkul & PJ, detail tugas, badge deadline (🔴 Hari Ini / 🟡 1–3 hari / 🟢 >3 hari), link pengumpulan, unduh materi, search & filter — **tanpa login** |
| **PJ Mata Kuliah** | Login, CRUD tugas matkul yang diampu, upload file materi, soft-delete tugas, catatan & link pengumpulan |
| **Admin/Ketua Kelas** | Login, statistik, CRUD mata kuliah, assign/ganti PJ, buat akun PJ, reset password, aktif/nonaktifkan akun |

## Struktur Proyek

```
├── index.html                  # Dashboard publik
├── matkul.html                 # Detail mata kuliah (publik)
├── login.html                  # Login PJ/Admin
├── admin.html                  # Panel Admin
├── pj.html                     # Panel PJ
├── schema.sql                  # Skema DB + RLS + storage + seed admin
├── assets/
│   ├── css/style.css           # Tema dark academic dashboard
│   └── js/
│       ├── config.js           # ⚠️ WAJIB DIISI (URL & anon key)
│       ├── supabase-client.js  # Singleton client
│       ├── utils.js            # WIB, deadline, modal, toast, auth guard
│       ├── ui.js               # Navbar, skeleton, kartu tugas
│       ├── public.js           # Logika dashboard publik
│       ├── matkul.js           # Logika detail matkul
│       ├── auth.js             # Logika login
│       ├── admin.js            # Logika panel admin
│       └── pj.js               # Logika panel PJ
└── supabase/functions/admin-auth/index.ts   # Edge Function manajemen user
```

## 🚀 Setup (15 menit)

### 1. Buat Project Supabase
1. Buka [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Simpan database password (jangan sampai hilang).

### 2. Jalankan Skema Database
1. Di Dashboard → **SQL Editor** → **New query**
2. Salin **seluruh isi `schema.sql`** → **Run**
3. Ini membuat: tabel `profiles`, `mata_kuliah`, `tasks`, enum `user_role`, trigger `updated_at` & auto-profile, semua **RLS policy**, bucket **`materials`** (public read), publication **realtime**, dan **1 akun admin awal**.

### 3. Isi Konfigurasi Frontend
Buka `assets/js/config.js`:
```js
const SUPABASE_CONFIG = {
  URL: 'https://xxxxxxxxxxxx.supabase.co',   // Settings → API → Project URL
  ANON_KEY: 'eyJhbGciOi...',                 // Settings → API → anon public
};
```

### 4. Login Admin Pertama
- URL: `login.html`
- Email: `admin@kelas.local`
- Password: `Admin#12345`

> ⚠️ **Segera ganti password admin** lewat panel Admin → Akun PJ → reset password diri sendiri, atau ubah seed di `schema.sql` sebelum dijalankan.

### 5. Deploy Edge Function `admin-auth`
Dibutuhkan Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy admin-auth
```

Fitur yang bergantung padanya: buat akun PJ, reset password, nonaktifkan akun, hapus akun. `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` otomatis tersedia di runtime Edge Function — **tidak pernah dikirim ke browser**.

### 6. Buka Aplikasi
Jalankan server statis lokal (agar path relatif aman):
```bash
python -m http.server 8080
# atau
npx serve .
```
Lalu akses `http://localhost:8080`.

## 🔐 Keamanan (RLS)

- **Anonim/publik**: hanya `SELECT` `mata_kuliah` & `tasks` (dan `profiles` untuk nama PJ) dengan `is_active = true`.
- **PJ**: `INSERT/UPDATE/DELETE` hanya pada `tasks` yang `subject_id` → `mata_kuliah.pj_id = auth.uid()`; upload storage hanya ke folder `materials/{auth.uid()}/...`.
- **Admin**: full akses via policy `is_active_admin()`.
- Perubahan `role`/`is_active` oleh user biasa diblokir policy `profiles_self_update`.
- Edge Function memverifikasi JWT pemanggil adalah ADMIN sebelum memakai `service_role`.

RLS aktif meski seseorang memanggil API langsung dengan anon key — keamanan tidak bergantung pada menyembunyikan tombol di frontend.

## ⏰ Timezone

Deadline disimpan sebagai `timestamptz` (UTC) dan ditampilkan dalam **Asia/Jakarta (WIB)**: *"Hari Ini"*, *"Besok"*, *"X Hari lagi"*, *"Terlambat"*. Input form dianggap WIB (`+07:00`).

## 🧪 Testing RLS Secara Cepat

1. Buka situs tanpa login → bisa lihat tugas aktif, tidak ada tombol edit.
2. Login PJ → hanya matkul yang diampu yang muncul di panel; coba insert tugas ke `subject_id` matkul lain via console — harus ditolak RLS.
3. Nonaktifkan akun PJ → login ditolak.
4. Nonaktifkan matkul → hilang dari dashboard publik.

## 🛠️ Troubleshooting

**Tambah tugas di panel PJ gagal dengan `23502 null value in column "slug"`**

`tasks.slug` (dan `mata_kuliah.slug`) `NOT NULL UNIQUE`, sedangkan frontend tidak
mengirimnya. `schema.sql` mengisi kolom itu lewat trigger **`set_slug`** yang memanggil
`generate_slug()` — pastikan blok itu ada di database:

```sql
select tgname, tgrelid::regclass as tabel
from pg_trigger
where tgname in ('trg_tasks_slug', 'trg_mata_kuliah_slug');
```

Kalau kosong, jalankan ulang `schema.sql`. Catatan: PJ hanya melihat mata kuliah yang
`pj_id`-nya dirinya, jadi matkul harus dibuat **dan** di-assign PJ dulu di panel Admin —
sebelum itu tombol "Tambah Tugas" memang nonaktif.

**Login gagal dengan `500 Database error querying schema` (di console: `AuthRetryableFetchError`)**

GoTrue men-scan kolom teks di `auth.users` ke tipe string, jadi kolom seperti
`confirmation_token`, `email_change`, `email_change_token_new`, `phone_change`,
`recovery_token` **tidak boleh NULL**. Baris user yang dibuat manual lewat SQL
(seed admin, atau RPC `admin_create_user`) bisa menyisakan NULL → login 500.

Perbaikan (aman dijalankan berulang): jalankan ulang `schema.sql` di Supabase
→ SQL Editor, atau minimal blok **REPAIR AUTH** di akhir file itu:

```sql
select public.repair_auth_strings();  -- NULL -> '' + rapikan identities.provider_id
```

Penyebab detail selalu tercatat di Dashboard → **Logs → Auth**
(mis. `Scan error on column index 3, name "confirmation_token"`).

**Aksi admin gagal dengan `404` di `/rest/v1/rpc/admin_create_user` (atau `admin_set_password`)**

⚠️ **404 di endpoint RPC tidak selalu berarti fungsinya tidak ada.** PostgREST
memetakan SQLSTATE kelas `42` (syntax/access rule, mis. `42883 undefined_function`)
menjadi HTTP 404. Jadi lihat dulu **pesan** errornya, bukan statusnya. Pesannya
sudah dicatat ke console oleh `rpcAdminCall()` di `assets/js/admin.js` sebagai
`[rpc:nama_fungsi] { code, message, details, hint, args }`.

Tiga penyebab yang pernah terjadi di proyek ini:

1. **`42883 function gen_salt(unknown) does not exist`** — fungsi RPC memakai
   `crypt()/gen_salt()` dari `pgcrypto`, tapi pgcrypto di Supabase terpasang di
   skema **`extensions`**, sedangkan fungsinya dipin `set search_path = public`.
   Perbaikannya: `set search_path = public, extensions` (sudah ada di `schema.sql`
   untuk `admin_create_user` & `admin_set_password`).
2. **`PGRST202 Could not find the function ... in the schema cache`** — fungsi atau
   signature-nya memang belum dikenal PostgREST: `schema.sql` belum dijalankan,
   masih ada overload lama, atau cache belum reload (tunggu beberapa detik /
   `notify pgrst, 'reload schema';`).
3. **`42501 permission denied for function ...`** — pemanggil bukan role
   `authenticated` (belum login) atau grant-nya hilang.

Cek daftar fungsi yang terdaftar beserta schema cache-nya:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'admin%';
```
