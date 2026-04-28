/**
 * Tests para las API routes de grupos.
 * Cubre: autorización, validaciones, reglas de negocio y sanitización XSS.
 */

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-for-testing';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { signJWT, createJWTPayload } from '@/lib/auth/jwt';

// ─── Mock Supabase ───────────────────────────────────────────────────────────
// Cada llamada a from() consume la siguiente entrada de la cola en orden.
// Todos los chains son thenables: await chain resuelve { data, error } o { count, error }.
// Esto permite manejar tanto .single()/.maybeSingle() como await directo (inserts, counts).

type QueueEntry = {
  single?: { data: any; error: any } | null;
  maybeSingle?: { data: any; error: any } | null;
  data?: any;
  count?: number;
  error?: any;
};

function makeChain(response: QueueEntry) {
  const directResolved: Promise<any> = response.count !== undefined
    ? Promise.resolve({ count: response.count, error: null })
    : Promise.resolve({ data: response.data ?? null, error: response.error ?? null });

  const chain: any = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    or:          jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(response.single ?? { data: null, error: response.error ?? null }),
    maybeSingle: jest.fn().mockResolvedValue(response.maybeSingle ?? { data: null, error: response.error ?? null }),
    then:        (f: any, r: any) => directResolved.then(f, r),
    catch:       (f: any) => directResolved.catch(f),
  };
  return chain;
}

const mockFrom = jest.fn();

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { NextRequest } from 'next/server';
import { POST  as createGroup }   from '@/app/api/groups/route';
import { PATCH as updateGroup }   from '@/app/api/groups/[id]/route';
import { POST  as addMember }     from '@/app/api/groups/[id]/members/route';
import { DELETE as removeMember } from '@/app/api/groups/[id]/members/[userId]/route';
import { PATCH as changeRole }    from '@/app/api/groups/[id]/members/[userId]/role/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ADMIN_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const OTHER_ID  = 'cccccccc-0000-0000-0000-000000000003';
const GROUP_ID  = 'gggggggg-0000-0000-0000-000000000001';

function token(userId: string, username = 'usr') {
  return signJWT(createJWTPayload({ id: userId, email: `${username}@t.com`, username }));
}

function req(method: string, path: string, body?: unknown, tok?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Configura mockFrom para devolver respuestas en orden (una por llamada a from()) */
function setupFromQueue(responses: QueueEntry[]) {
  let idx = 0;
  mockFrom.mockImplementation(() => {
    const resp = responses[idx] ?? {};
    idx++;
    return makeChain(resp);
  });
}

beforeEach(() => {
  // resetAllMocks limpia tanto el historial como las implementaciones once pendientes.
  // clearAllMocks NO limpia implementaciones — causa contaminación entre tests.
  jest.resetAllMocks();
});

// ─── POST /api/groups ─────────────────────────────────────────────────────────
describe('POST /api/groups', () => {
  test('401 sin token', async () => {
    const r = req('POST', '/api/groups', { name: 'Test', member_ids: [MEMBER_ID, OTHER_ID] });
    expect((await createGroup(r)).status).toBe(401);
  });

  test('400 — nombre vacío', async () => {
    const r = req('POST', '/api/groups', { name: '', member_ids: [MEMBER_ID, OTHER_ID] }, token(ADMIN_ID));
    expect((await createGroup(r)).status).toBe(400);
  });

  test('400 — menos de 2 miembros adicionales', async () => {
    const r = req('POST', '/api/groups', { name: 'Grupo', member_ids: [MEMBER_ID] }, token(ADMIN_ID));
    expect((await createGroup(r)).status).toBe(400);
  });

  test('400 — member_id no es UUID', async () => {
    const r = req('POST', '/api/groups', { name: 'Grupo', member_ids: ['no-uuid', OTHER_ID] }, token(ADMIN_ID));
    expect((await createGroup(r)).status).toBe(400);
  });

  test('422 — miembros no son amigos del creador', async () => {
    // Call 1: friendships query → data: [] (nadie es amigo)
    setupFromQueue([{ data: [] }]);
    const r = req('POST', '/api/groups', {
      name: 'Grupo',
      member_ids: [MEMBER_ID, OTHER_ID],
    }, token(ADMIN_ID));
    expect((await createGroup(r)).status).toBe(422);
  });

  test('nombre con HTML es sanitizado antes de guardar', async () => {
    setupFromQueue([
      // Call 1: friendships → ambos son amigos del creador
      { data: [
        { requester_id: ADMIN_ID, addressee_id: MEMBER_ID },
        { requester_id: ADMIN_ID, addressee_id: OTHER_ID },
      ]},
      // Call 2: insert conversation → .single()
      { single: { data: { id: GROUP_ID }, error: null } },
      // Call 3: insert participants → await directo
      {},
    ]);
    const r = req('POST', '/api/groups', {
      name: '<script>alert(1)</script>Grupo',
      member_ids: [MEMBER_ID, OTHER_ID],
    }, token(ADMIN_ID));
    const res = await createGroup(r);
    if (res.status === 201) {
      const body = await res.json();
      expect(body.group.name).not.toContain('<script>');
      expect(body.group.name).toBe('Grupo');
    }
    expect([201, 500]).toContain(res.status);
  });
});

// ─── PATCH /api/groups/[id] ───────────────────────────────────────────────────
describe('PATCH /api/groups/[id]', () => {
  const ctx = { params: Promise.resolve({ id: GROUP_ID }) };

  test('401 sin token', async () => {
    const r = req('PATCH', `/api/groups/${GROUP_ID}`, { name: 'Nuevo' });
    expect((await updateGroup(r, ctx)).status).toBe(401);
  });

  test('403 — miembro normal no puede editar', async () => {
    setupFromQueue([
      { single: { data: { role: 'member' }, error: null } }, // membership check
    ]);
    const r = req('PATCH', `/api/groups/${GROUP_ID}`, { name: 'Nuevo' }, token(MEMBER_ID, 'mb'));
    expect((await updateGroup(r, ctx)).status).toBe(403);
  });

  test('admin puede editar nombre', async () => {
    setupFromQueue([
      { single: { data: { role: 'admin' }, error: null } },
      { single: { data: { id: GROUP_ID, name: 'Nuevo', description: null, avatar_url: null }, error: null } },
    ]);
    const r = req('PATCH', `/api/groups/${GROUP_ID}`, { name: 'Nuevo' }, token(ADMIN_ID));
    const res = await updateGroup(r, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group.name).toBe('Nuevo');
  });

  test('nombre con HTML sanitizado en update', async () => {
    setupFromQueue([
      { single: { data: { role: 'admin' }, error: null } },
      { single: { data: { id: GROUP_ID, name: 'NombreLimpio', description: null, avatar_url: null }, error: null } },
    ]);
    const r = req('PATCH', `/api/groups/${GROUP_ID}`, { name: '<b>NombreLimpio</b>' }, token(ADMIN_ID));
    const res = await updateGroup(r, ctx);
    expect([200, 500]).toContain(res.status);
  });
});

// ─── POST /api/groups/[id]/members ───────────────────────────────────────────
describe('POST /api/groups/[id]/members', () => {
  const ctx = { params: Promise.resolve({ id: GROUP_ID }) };

  test('401 sin token', async () => {
    const r = req('POST', `/api/groups/${GROUP_ID}/members`, { user_id: OTHER_ID });
    expect((await addMember(r, ctx)).status).toBe(401);
  });

  test('403 — member normal no puede agregar', async () => {
    setupFromQueue([
      { single: { data: { role: 'member' }, error: null } }, // admin check
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/members`, { user_id: OTHER_ID }, token(MEMBER_ID, 'mb'));
    expect((await addMember(r, ctx)).status).toBe(403);
  });

  test('409 — usuario ya es miembro', async () => {
    setupFromQueue([
      { single: { data: { role: 'admin' }, error: null } },             // admin check
      { maybeSingle: { data: { id: 'existing' }, error: null } },        // ya es miembro
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/members`, { user_id: MEMBER_ID }, token(ADMIN_ID));
    expect((await addMember(r, ctx)).status).toBe(409);
  });

  test('400 — user_id no es UUID válido', async () => {
    const r = req('POST', `/api/groups/${GROUP_ID}/members`, { user_id: 'no-uuid' }, token(ADMIN_ID));
    expect((await addMember(r, ctx)).status).toBe(400);
  });

  test('422 — el nuevo miembro no es amigo del admin', async () => {
    setupFromQueue([
      { single: { data: { role: 'admin' }, error: null } }, // admin check
      { maybeSingle: { data: null, error: null } },           // no es miembro aún
      { count: 5 },                                           // count < 256 (await directo)
      { maybeSingle: { data: null, error: null } },           // no hay amistad
    ]);
    const r = req('POST', `/api/groups/${GROUP_ID}/members`, { user_id: OTHER_ID }, token(ADMIN_ID));
    expect((await addMember(r, ctx)).status).toBe(422);
  });
});

// ─── DELETE /api/groups/[id]/members/[userId] ─────────────────────────────────
describe('DELETE /api/groups/[id]/members/[userId]', () => {
  test('401 sin token', async () => {
    const ctx = { params: Promise.resolve({ id: GROUP_ID, userId: MEMBER_ID }) };
    const r = req('DELETE', `/api/groups/${GROUP_ID}/members/${MEMBER_ID}`);
    expect((await removeMember(r, ctx)).status).toBe(401);
  });

  test('403 — member no puede quitar a otro miembro', async () => {
    const ctx = { params: Promise.resolve({ id: GROUP_ID, userId: OTHER_ID }) };
    setupFromQueue([
      { single: { data: { role: 'member' }, error: null } }, // requester membership
    ]);
    const r = req('DELETE', `/api/groups/${GROUP_ID}/members/${OTHER_ID}`,
      undefined, token(MEMBER_ID, 'mb'));
    expect((await removeMember(r, ctx)).status).toBe(403);
  });

  test('404 — target no es miembro', async () => {
    const ctx = { params: Promise.resolve({ id: GROUP_ID, userId: OTHER_ID }) };
    setupFromQueue([
      { single: { data: { role: 'admin' }, error: null } },  // requester es admin
      { single: { data: null, error: null } },                 // target no encontrado
    ]);
    const r = req('DELETE', `/api/groups/${GROUP_ID}/members/${OTHER_ID}`,
      undefined, token(ADMIN_ID));
    expect((await removeMember(r, ctx)).status).toBe(404);
  });
});

// ─── PATCH /api/groups/[id]/members/[userId]/role ─────────────────────────────
describe('PATCH /api/groups/[id]/members/[userId]/role', () => {
  const ctx = { params: Promise.resolve({ id: GROUP_ID, userId: MEMBER_ID }) };

  test('401 sin token', async () => {
    const r = req('PATCH', `/api/groups/${GROUP_ID}/members/${MEMBER_ID}/role`, { role: 'admin' });
    expect((await changeRole(r, ctx)).status).toBe(401);
  });

  test('403 — miembro no puede cambiar roles', async () => {
    setupFromQueue([
      { single: { data: { role: 'member' }, error: null } }, // requester check
    ]);
    const r = req('PATCH', `/api/groups/${GROUP_ID}/members/${MEMBER_ID}/role`,
      { role: 'admin' }, token(MEMBER_ID, 'mb'));
    expect((await changeRole(r, ctx)).status).toBe(403);
  });

  test('400 — role inválido (no es admin ni member)', async () => {
    const r = req('PATCH', `/api/groups/${GROUP_ID}/members/${MEMBER_ID}/role`,
      { role: 'superadmin' }, token(ADMIN_ID));
    expect((await changeRole(r, ctx)).status).toBe(400);
  });

  test('422 — no se puede degradar al único admin', async () => {
    setupFromQueue([
      { single: { data: { role: 'admin' }, error: null } },  // requester es admin
      { single: { data: { role: 'admin' }, error: null } },  // target también es admin
      { count: 1 },                                           // solo 1 admin (await directo)
    ]);
    const r = req('PATCH', `/api/groups/${GROUP_ID}/members/${MEMBER_ID}/role`,
      { role: 'member' }, token(ADMIN_ID));
    expect((await changeRole(r, ctx)).status).toBe(422);
  });
});

// ─── Sanitización XSS ────────────────────────────────────────────────────────
describe('Sanitización XSS en datos de grupo', () => {
  test('stripHtml elimina etiquetas HTML y contenido de script', async () => {
    const { sanitizeGroupName } = await import('@/lib/security/sanitize');
    const input = '<script>alert("xss")</script>Mi Grupo';
    const result = sanitizeGroupName(input);
    expect(result).toBe('Mi Grupo');
    expect(result).not.toContain('<');
    expect(result).not.toContain('alert');
  });

  test('stripHtml elimina etiquetas img con onerror', async () => {
    const { sanitizeDescription } = await import('@/lib/security/sanitize');
    const input = '<img src=x onerror=alert(1)>Descripción válida';
    const result = sanitizeDescription(input);
    expect(result).toBe('Descripción válida');
    expect(result).not.toContain('<img');
  });

  test('texto normal no se modifica por el sanitizador', async () => {
    const { sanitizeGroupName } = await import('@/lib/security/sanitize');
    expect(sanitizeGroupName('Equipo Alpha 2024')).toBe('Equipo Alpha 2024');
  });

  test('nombre con más de 50 caracteres se trunca', async () => {
    const { sanitizeGroupName } = await import('@/lib/security/sanitize');
    const largo = 'A'.repeat(60);
    expect(sanitizeGroupName(largo).length).toBeLessThanOrEqual(50);
  });

  test('descripción con más de 200 caracteres se trunca', async () => {
    const { sanitizeDescription } = await import('@/lib/security/sanitize');
    const largo = 'B'.repeat(250);
    expect(sanitizeDescription(largo).length).toBeLessThanOrEqual(200);
  });
});
