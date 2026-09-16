-- ============================================================
-- APLIKASI MANAJEMEN TUGAS KELAS — Supabase Schema
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor
-- ============================================================

-- 1) ENUM ROLE
do $$ begin
  create type public.user_role as enum ('ADMIN', 'PJ');
exception
  when duplicate_object then null;
end $$;

-- 2) PROFILES (1:1 dengan auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  username text not null unique,
  role public.user_role not null default 'PJ',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) MATA KULIAH
create table if not exists public.mata_kuliah (
  id uuid primary key default gen_random_uuid(),
  name varchar(150) not null,
  code varchar(20) not null unique,
  slug varchar(180) not null unique,
  description text default '',
  pj_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) TASKS
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.mata_kuliah (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title varchar(200) not null,
  slug varchar(230) not null unique,
  description text default '',
  deadline timestamptz,
  submission_url text default '',
  material_file_url text default '',
  notes text default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_subject on public.tasks (subject_id);
create index if not exists idx_tasks_deadline on public.tasks (deadline);
create index if not exists idx_mata_kuliah_pj on public.mata_kuliah (pj_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile saat user baru signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, username, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'PJ'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at otomatis
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_mata_kuliah_updated on public.mata_kuliah;
create trigger trg_mata_kuliah_updated before update on public.mata_kuliah
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

-- Helper: apakah user saat ini admin aktif?
create or replace function public.is_active_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN' and p.is_active
  );
$$;

-- ============================================================
-- REPAIR AUTH: kolom teks di auth.users TIDAK BOLEH NULL
-- ============================================================
-- GoTrue men-scan kolom-kolom ini ke tipe Go string. Jika NULL,
-- login gagal dengan HTTP 500 "Database error querying schema".
-- Muncul pada user yang dibuat manual lewat SQL (seed / RPC di bawah),
-- karena INSERT tidak mengisi semua kolom token.
-- Fungsi ini juga menormalkan auth.identities.provider_id: untuk provider
-- 'email'/'phone', provider_id harus sama dengan id user (dokumentasi Supabase).
-- Idempotent. p_user_id NULL = perbaiki semua user.
create or replace function public.repair_auth_strings(p_user_id uuid default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_col text;
  v_fixed int;
  v_total int := 0;
begin
  foreach v_col in array array[
    'confirmation_token', 'recovery_token', 'email_change',
    'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'auth' and c.table_name = 'users'
        and c.column_name = v_col
    ) then
      execute format(
        'update auth.users set %I = '''' where %I is null and ($1 is null or id = $1)',
        v_col, v_col
      ) using p_user_id;
      get diagnostics v_fixed = row_count;
      v_total := v_total + v_fixed;
    end if;
  end loop;

  update auth.identities i
     set provider_id = i.user_id::text
   where i.provider in ('email', 'phone')
     and i.provider_id is distinct from i.user_id::text
     and (p_user_id is null or i.user_id = p_user_id)
     and not exists (
       select 1 from auth.identities x
       where x.provider = i.provider
         and x.provider_id = i.user_id::text
         and x.id <> i.id
     );
  get diagnostics v_fixed = row_count;
  v_total := v_total + v_fixed;

  return v_total;
end;
$$;

revoke execute on function public.repair_auth_strings(uuid) from public, anon, authenticated;

-- Slug generator sederhana (judul -> slug unik dengan suffix)
create or replace function public.generate_slug(base text, table_name text)
returns text
language plpgsql
as $$
declare
  s text;
  suffix int := 0;
  candidate text;
  exists_row boolean;
begin
  s := lower(regexp_replace(base, '[^a-zA-Z0-9]+', '-', 'g'));
  s := btrim(s, '-');
  if s = '' or s is null then
    s := 'item';
  end if;
  s := left(s, 180);
  candidate := s;
  loop
    if table_name = 'mata_kuliah' then
      select exists (select 1 from public.mata_kuliah where slug = candidate) into exists_row;
    else
      select exists (select 1 from public.tasks where slug = candidate) into exists_row;
    end if;
    exit when not exists_row;
    suffix := suffix + 1;
    candidate := left(s, 175) || '-' || suffix::text;
  end loop;
  return candidate;
end;
$$;

-- Isi slug otomatis (tasks.slug & mata_kuliah.slug NOT NULL UNIQUE).
-- Klien tidak wajib mengirim slug; kalau tetap dikirim, nilai itu diganti
-- dengan slug unik hasil generate_slug() supaya tidak pernah bentrok
-- (mis. dua tugas berjudul "Tugas 1" di matkul berbeda).
-- Saat UPDATE, slug lama dipertahankan agar URL matkul.html?slug=... stabil.
create or replace function public.set_slug()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_table_name = 'mata_kuliah' then
    if tg_op = 'INSERT' or new.slug is null or btrim(new.slug) = '' then
      new.slug := public.generate_slug(new.name, 'mata_kuliah');
    end if;
  elsif tg_table_name = 'tasks' then
    if tg_op = 'INSERT' or new.slug is null or btrim(new.slug) = '' then
      new.slug := public.generate_slug(new.title, 'tasks');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mata_kuliah_slug on public.mata_kuliah;
create trigger trg_mata_kuliah_slug
  before insert or update on public.mata_kuliah
  for each row execute function public.set_slug();

drop trigger if exists trg_tasks_slug on public.tasks;
create trigger trg_tasks_slug
  before insert or update on public.tasks
  for each row execute function public.set_slug();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.mata_kuliah enable row level security;
alter table public.tasks enable row level security;

-- ---- PROFILES ----
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true); -- PJ ditampilkan publik pada detail matkul

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"
  on public.profiles for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- user tidak boleh mengangkat role / mengaktifkan diri sendiri
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
  );

-- ---- MATA KULIAH ----
drop policy if exists "mata_kuliah_public_read" on public.mata_kuliah;
create policy "mata_kuliah_public_read"
  on public.mata_kuliah for select
  using (
    is_active
    or public.is_active_admin()
    or pj_id = auth.uid()
  );

drop policy if exists "mata_kuliah_admin_write" on public.mata_kuliah;
create policy "mata_kuliah_admin_write"
  on public.mata_kuliah for insert
  with check (public.is_active_admin());

drop policy if exists "mata_kuliah_admin_update" on public.mata_kuliah;
create policy "mata_kuliah_admin_update"
  on public.mata_kuliah for update
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists "mata_kuliah_admin_delete" on public.mata_kuliah;
create policy "mata_kuliah_admin_delete"
  on public.mata_kuliah for delete
  using (public.is_active_admin());

-- ---- TASKS ----
drop policy if exists "tasks_public_read" on public.tasks;
create policy "tasks_public_read"
  on public.tasks for select
  using (
    (
      is_active
      and exists (
        select 1 from public.mata_kuliah m
        where m.id = subject_id and m.is_active
      )
    )
    or public.is_active_admin()
    or exists (
      select 1 from public.mata_kuliah m
      where m.id = subject_id and m.pj_id = auth.uid()
    )
  );

drop policy if exists "tasks_pj_insert" on public.tasks;
create policy "tasks_pj_insert"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.mata_kuliah m
      where m.id = subject_id
        and m.pj_id = auth.uid()
        and m.is_active
    )
    and created_by = auth.uid()
  );

drop policy if exists "tasks_pj_update" on public.tasks;
create policy "tasks_pj_update"
  on public.tasks for update
  using (
    exists (
      select 1 from public.mata_kuliah m
      where m.id = subject_id and m.pj_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.mata_kuliah m
      where m.id = subject_id and m.pj_id = auth.uid()
    )
  );

drop policy if exists "tasks_pj_delete" on public.tasks;
create policy "tasks_pj_delete"
  on public.tasks for delete
  using (
    exists (
      select 1 from public.mata_kuliah m
      where m.id = subject_id and m.pj_id = auth.uid()
    )
  );

drop policy if exists "tasks_admin_all" on public.tasks;
create policy "tasks_admin_all"
  on public.tasks for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- ============================================================
-- STORAGE BUCKET "materials" (public read)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', true, 104857600)
on conflict (id) do update set public = true, file_size_limit = 104857600;

drop policy if exists "materials_public_read" on storage.objects;
create policy "materials_public_read"
  on storage.objects for select
  using (bucket_id = 'materials');

-- PJ boleh upload hanya ke folder-nya: materials/{pj_id}/...
drop policy if exists "materials_pj_upload" on storage.objects;
create policy "materials_pj_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "materials_pj_manage" on storage.objects;
create policy "materials_pj_manage"
  on storage.objects for update
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "materials_pj_delete" on storage.objects;
create policy "materials_pj_delete"
  on storage.objects for delete
  using (
    bucket_id = 'materials'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_active_admin()
    )
  );

-- ============================================================
-- REALTIME (agar dashboard publik update otomatis)
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.mata_kuliah;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- ============================================================
-- ADMIN USER MANAGEMENT (RPC — tanpa Edge Function)
-- Dipanggil dari dashboard admin via supabase.rpc().
-- Semua fungsi security definer + cek is_active_admin() di dalam.
-- ============================================================

-- Bersihkan versi lama (overload) dari skema sebelumnya.
-- Kalau signature-nya beda dengan yang dipanggil frontend, PostgREST menjawab
-- 404 "Could not find the function ... in the schema cache".
drop function if exists public.admin_create_user(text, text, text, text);
drop function if exists public.admin_create_user(text, text, text, public.user_role);
drop function if exists public.admin_create_user(text, text, text, public.user_role, text);
drop function if exists public.admin_set_password(uuid, text);
drop function if exists public.admin_delete_user(uuid);

-- Login pakai username: resolve username -> email terdaftar.
-- Dipanggil anon (belum login), hanya membocorkan email sintetis.
create or replace function public.lookup_login_email(p_username text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select u.email
  from auth.users u
  where lower(u.email) = lower(btrim(p_username))
     or lower(u.email) = lower(btrim(p_username)) || '@kelas.local'
     or lower(u.email) = lower(btrim(p_username)) || '@gmail.com'
  limit 1;
$$;

revoke execute on function public.lookup_login_email(text) from public;
grant execute on function public.lookup_login_email(text) to anon, authenticated;

-- Buat akun baru (login cukup username + password; email dibuat sintetis)
create or replace function public.admin_create_user(
  p_full_name text,
  p_username text,
  p_password text,
  p_role public.user_role,
  p_email text default null
)
returns uuid
language plpgsql
-- WAJIB menyertakan `extensions`: pgcrypto (crypt/gen_salt) terpasang di skema
-- itu di Supabase. Tanpa ini muncul 42883 "function gen_salt(unknown) does not
-- exist", dan PostgREST menerjemahkannya jadi HTTP 404 yang menyesatkan.
security definer set search_path = public, extensions
as $$
declare
  v_new_id uuid;
  v_email text;
begin
  if not public.is_active_admin() then
    raise exception 'Hanya admin yang dapat membuat akun.';
  end if;

  if p_password is null or length(btrim(p_password)) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;

  p_username := lower(btrim(p_username));
  if p_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username hanya huruf/angka/. _ - (3-30 karakter).';
  end if;

  if exists (select 1 from public.profiles where username = p_username) then
    raise exception 'Username "%" sudah dipakai.', p_username;
  end if;

  v_email := coalesce(nullif(btrim(coalesce(p_email, '')), ''), p_username || '@kelas.local');

  if exists (select 1 from auth.users where lower(email) = lower(v_email)) then
    raise exception 'Email % sudah terdaftar.', v_email;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', coalesce(nullif(btrim(p_full_name), ''), p_username),
                       'username', p_username, 'role', p_role::text),
    now(), now(), '', ''
  ) returning id into v_new_id;

  -- Baris identities (kolom id beda antar versi GoTrue: uuid vs text)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities'
      and column_name = 'id' and data_type = 'uuid'
  ) then
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      v_new_id, v_new_id, v_new_id::text, 'email',
      jsonb_build_object('sub', v_new_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  else
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid()::text, v_new_id, v_new_id::text, 'email',
      jsonb_build_object('sub', v_new_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  end if;

  -- Kolom teks auth.users tidak boleh NULL (kalau tidak, login user ini 500)
  perform public.repair_auth_strings(v_new_id);

  return v_new_id;
end;
$$;

-- Reset password akun
create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer set search_path = public, extensions  -- pgcrypto ada di `extensions`
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Hanya admin yang dapat reset password.';
  end if;
  if p_password is null or length(btrim(p_password)) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User tidak ditemukan.';
  end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
end;
$$;

-- Hapus akun permanen (profile ikut ter-cascade)
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Hanya admin yang dapat menghapus akun.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Tidak bisa menghapus akun sendiri.';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

-- Hanya user yang login (authenticated) boleh memanggil
revoke execute on function public.admin_create_user(text, text, text, public.user_role, text) from anon, public;
revoke execute on function public.admin_set_password(uuid, text) from anon, public;
revoke execute on function public.admin_delete_user(uuid) from anon, public;
grant execute on function public.admin_create_user(text, text, text, public.user_role, text) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ============================================================
-- SEED: buat 1 akun admin awal (admin@kelas.local / Admin#12345)
-- Idempotent — aman dijalankan ulang. Ganti password setelah login pertama!
-- Catatan: JANGAN pakai ON CONFLICT (email) di auth.users — index uniknya
-- ada di lower(email) (ekspresi), jadi ON CONFLICT (email) error 42P10.
-- ============================================================
create extension if not exists pgcrypto;

do $$
declare
  admin_id uuid;
begin
  -- pgcrypto (crypt/gen_salt) ada di skema `extensions` pada Supabase
  perform set_config('search_path', 'public, extensions', true);

  -- Lewati jika email sudah terdaftar, tapi pastikan username login = 'admin'
  if exists (select 1 from auth.users where lower(email) = 'admin@kelas.local') then
    update public.profiles
       set username = 'admin', role = 'ADMIN', is_active = true
     where id = (select id from auth.users where lower(email) = 'admin@kelas.local');
    raise notice 'Admin sudah ada, seed dilewati (username disamakan ke "admin").';
    return;
  end if;

  admin_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    admin_id,
    'authenticated',
    'authenticated',
    'admin@kelas.local',
    crypt('Admin#12345', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin Kelas","username":"admin","role":"ADMIN"}',
    now(), now(), '', ''
  );

  -- Baris identities untuk provider email (dibutuhkan GoTrue versi baru).
  -- Tipe kolom auth.identities.id beda antar versi GoTrue:
  -- modern: uuid default gen_random_uuid(), lawas: text.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'identities'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      admin_id,
      admin_id,
      admin_id::text,
      'email',
      jsonb_build_object(
        'sub', admin_id::text,
        'email', 'admin@kelas.local',
        'email_verified', true
      ),
      now(), now(), now()
    );
  else
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid()::text,
      admin_id,
      admin_id::text,
      'email',
      jsonb_build_object(
        'sub', admin_id::text,
        'email', 'admin@kelas.local',
        'email_verified', true
      ),
      now(), now(), now()
    );
  end if;

  -- Pastikan profile ADMIN tersedia (trigger handle_new_user juga membuat)
  insert into public.profiles (id, full_name, username, role, is_active)
  values (admin_id, 'Admin Kelas', 'admin', 'ADMIN', true)
  on conflict (id) do update
    set role = 'ADMIN', is_active = true;
end $$;

-- ============================================================
-- 9) REPAIR AUTH (idempotent, boleh dijalankan ulang kapan saja)
-- Jalankan blok ini bila login membalas HTTP 500
-- "Database error querying schema": biasanya ada baris auth.users yang
-- dibuat manual dan punya kolom token NULL.
-- ============================================================
do $$
declare
  v_total int;
begin
  v_total := public.repair_auth_strings();
  raise notice 'Repair auth selesai: % kolom/baris diperbaiki.', v_total;
end $$;

-- ============================================================
-- 10) Muat ulang schema cache PostgREST
-- Wajib setelah membuat/mengubah fungsi, agar supabase.rpc() langsung
-- mengenali signature-nya (kalau tidak: 404 "Could not find the function
-- ... in the schema cache").
-- ============================================================
notify pgrst, 'reload schema';
