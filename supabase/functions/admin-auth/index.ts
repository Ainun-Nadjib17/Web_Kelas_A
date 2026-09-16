// ============================================================
// Edge Function: admin-auth
// Aksi manajemen user yang membutuhkan service_role:
//   - create-user  : buat akun PJ/Admin baru
//   - reset-password
//   - set-active   : aktif/nonaktifkan akun
//   - delete-user  : hapus permanen (opsional)
// Semua request WAJIB membawa JWT user dengan role ADMIN (profiles).
// Deploy:
//   supabase functions deploy admin-auth --project-ref <ref>
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Payload {
  action: 'create-user' | 'reset-password' | 'set-active' | 'delete-user';
  userId?: string;
  email?: string;
  password?: string;
  fullName?: string;
  username?: string;
  role?: 'ADMIN' | 'PJ';
  isActive?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return json({ error: 'Tidak ada sesi login.' }, 401);
    }

    // 1) Client dengan service role (server-side only)
    const admin = createClient(
      Deno.env.get('https://kwtahwrjxlaqsrygtjey.supabase.co') ?? '',
      Deno.env.get('sb_publishable_b3TYupnCQj4Fr9THAeKDNQ_IfbFZBQa') ?? '',
    );

    // 2) Verifikasi pemanggil adalah ADMIN aktif via profiles
    const userClient = createClient(
      Deno.env.get('https://kwtahwrjxlaqsrygtjey.supabase.co') ?? '',
      Deno.env.get('https://kwtahwrjxlaqsrygtjey.supabase.co') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Sesi tidak valid.' }, 401);

    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', userData.user.id)
      .single();
    if (profErr || !profile || profile.role !== 'ADMIN' || !profile.is_active) {
      return json({ error: 'Hanya Admin yang diizinkan.' }, 403);
    }

    const body = (await req.json()) as Payload;

    switch (body.action) {
      // ------------------------------------------------------
      case 'create-user': {
        if (!body.email || !body.password || !body.username) {
          return json({ error: 'Email, password, dan username wajib diisi.' }, 400);
        }
        if (body.password.length < 8) {
          return json({ error: 'Password minimal 8 karakter.' }, 400);
        }
        const role = body.role === 'ADMIN' ? 'ADMIN' : 'PJ';

        // Cek username unik di profiles
        const { data: taken } = await admin
          .from('profiles')
          .select('id')
          .eq('username', body.username)
          .maybeSingle();
        if (taken) return json({ error: 'Username sudah dipakai.' }, 409);

        const { data: created, error: createErr } =
          await admin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: {
              full_name: body.fullName || body.username,
              username: body.username,
              role,
            },
          });
        if (createErr) return json({ error: createErr.message }, 400);

        // Pastikan profile tersedia (trigger handle_new_user juga membuat)
        await admin.from('profiles').upsert({
          id: created.user!.id,
          full_name: body.fullName || body.username,
          username: body.username,
          role,
          is_active: true,
        });

        return json({ user: { id: created.user!.id, email: created.user!.email } }, 201);
      }

      // ------------------------------------------------------
      case 'reset-password': {
        if (!body.userId || !body.password) {
          return json({ error: 'userId & password wajib.' }, 400);
        }
        if (body.password.length < 8) {
          return json({ error: 'Password minimal 8 karakter.' }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(body.userId, {
          password: body.password,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true }, 200);
      }

      // ------------------------------------------------------
      case 'set-active': {
        if (!body.userId || typeof body.isActive !== 'boolean') {
          return json({ error: 'userId & isActive wajib.' }, 400);
        }
        // Nonaktifkan via ban (mencegah login) + flag profiles
        if (!body.isActive) {
          await admin.auth.admin.updateUserById(body.userId, { ban_duration: '876000h' }); // ~100 th
        } else {
          await admin.auth.admin.updateUserById(body.userId, { ban_duration: 'none' });
        }
        const { error } = await admin
          .from('profiles')
          .update({ is_active: body.isActive })
          .eq('id', body.userId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true }, 200);
      }

      // ------------------------------------------------------
      case 'delete-user': {
        if (!body.userId) return json({ error: 'userId wajib.' }, 400);
        if (body.userId === userData.user.id) {
          return json({ error: 'Tidak bisa menghapus akun sendiri.' }, 400);
        }
        const { error } = await admin.auth.admin.deleteUser(body.userId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true }, 200);
      }

      default:
        return json({ error: 'Aksi tidak dikenal.' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Kesalahan server.' }, 500);
  }
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
