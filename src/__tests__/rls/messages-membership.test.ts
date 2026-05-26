/**
 * Tests de aislamiento de membresía para conversaciones.
 *
 * Verifica que:
 *   - no participantes no pueden archivar ni silenciar conversaciones ajenas
 *   - archivar/silenciar es por usuario: el estado de A no afecta la vista de B
 *   - GET /api/conversations filtra estrictamente por user_id del token
 */

process.env.JWT_SECRET            = 'test-secret-at-least-32-chars-long-for-testing';
process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
type QueueEntry = { single?: any; maybeSingle?: any; data?: any; count?: number; error?: any };

function makeChain(r: QueueEntry) {
  const resolved = r.count !== undefined
    ? Promise.resolve({ count: r.count, error: null })
    : Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  const chain: any = {
    select:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    or:          jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(r.single ?? { data: null, error: r.error ?? null }),
    maybeSingle: jest.fn().mockResolvedValue(r.maybeSingle ?? { data: null, error: r.error ?? null }),
    then:  (f: any, rej: any) => resolved.then(f, rej),
    catch: (f: any) => resolved.catch(f),
  };
  return chain;
}

const mockFrom = jest.fn();
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { NextRequest } from 'next/server';
import { signJWT, createJWTPayload } from '@/lib/auth/jwt';
import { PATCH as archiveConversation } from '@/app/api/conversations/[id]/archive/route';
import { PATCH as muteConversation }    from '@/app/api/conversations/[id]/mute/route';
import { GET as listConversations }     from '@/app/api/conversations/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const USER_C = 'cccccccc-0000-0000-0000-000000000003'; // intruso
const CONV_ID = 'cccccccc-1111-0000-0000-000000000001';

const futureDate = new Date(Date.now() + 3_600_000).toISOString();

function token(userId: string, username: string) {
  return signJWT(createJWTPayload({ id: userId, email: `${username}@test.com`, username }));
}
const tokenA = token(USER_A, 'usera');
const tokenB = token(USER_B, 'userb');
const tokenC = token(USER_C, 'userc');

function req(method: string, url: string, body?: unknown, tok?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function setupQueue(responses: QueueEntry[]) {
  let i = 0;
  mockFrom.mockImplementation(() => makeChain(responses[i++] ?? {}));
}

const ctxConv = { params: Promise.resolve({ id: CONV_ID }) };

beforeEach(() => jest.clearAllMocks());

// ─── Sin autenticación ────────────────────────────────────────────────────────
describe('Sin token → 401', () => {
  test('GET /api/conversations', async () => {
    const res = await listConversations(req('GET', '/api/conversations'));
    expect(res.status).toBe(401);
  });

  test('PATCH /archive', async () => {
    const res = await archiveConversation(req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: true }), ctxConv);
    expect(res.status).toBe(401);
  });

  test('PATCH /mute', async () => {
    const res = await muteConversation(req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: futureDate }), ctxConv);
    expect(res.status).toBe(401);
  });
});

// ─── No participante (USER_C) ─────────────────────────────────────────────────
describe('No participante no puede modificar conversación ajena', () => {
  test('Archivar conversación ajena → 403', async () => {
    setupQueue([{ single: { data: null, error: null } }]); // membership de C → null
    const res = await archiveConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: true }, tokenC),
      ctxConv
    );
    expect(res.status).toBe(403);
  });

  test('Silenciar conversación ajena → 403', async () => {
    setupQueue([{ single: { data: null, error: null } }]);
    const res = await muteConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: futureDate }, tokenC),
      ctxConv
    );
    expect(res.status).toBe(403);
  });

  test('Desarchivar conversación ajena → 403', async () => {
    setupQueue([{ single: { data: null, error: null } }]);
    const res = await archiveConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: false }, tokenC),
      ctxConv
    );
    expect(res.status).toBe(403);
  });
});

// ─── Aislamiento de archivado ─────────────────────────────────────────────────
describe('Archivado es personal: el estado de A no afecta la vista de B', () => {
  test('User A archiva → User B sigue viendo la conversación en su lista activa', async () => {
    // User A archiva exitosamente
    setupQueue([
      { single: { data: { id: 'part-a' }, error: null } },
      { single: { data: { is_archived: true, archived_at: new Date().toISOString() }, error: null } },
    ]);
    const archiveRes = await archiveConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: true }, tokenA),
      ctxConv
    );
    expect(archiveRes.status).toBe(200);

    // User B consulta su lista (sin ?archived=true) → su fila sigue con is_archived=false
    setupQueue([
      // Q1: participante de B — su fila no cambió
      { data: [{ conversation_id: CONV_ID, encrypted_shared_key: 'ek', shared_key_iv: 'iv', shared_key_mac: 'mac', is_archived: false, archived_at: null, muted_until: null }] },
      // Q2: otros participantes
      { data: [{ conversation_id: CONV_ID, user_id: USER_A }] },
      // Q3: datos del otro usuario
      { data: [{ id: USER_A, username: 'usera' }] },
      // Q4: mensajes
      { data: [] },
    ]);
    const listRes = await listConversations(req('GET', '/api/conversations', undefined, tokenB));
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].isArchived).toBe(false);
  });

  test('User A archiva → su propia lista activa queda vacía', async () => {
    // La BD no devuelve filas activas para A (is_archived=false) porque A archivó
    setupQueue([
      { data: [], error: null }, // Q1: sin participantes activos para A
    ]);
    const listRes = await listConversations(req('GET', '/api/conversations', undefined, tokenA));
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.conversations).toHaveLength(0);
  });

  test('User A archiva → aparece en su lista archivada', async () => {
    setupQueue([
      { data: [{ conversation_id: CONV_ID, encrypted_shared_key: 'ek', shared_key_iv: 'iv', shared_key_mac: 'mac', is_archived: true, archived_at: new Date().toISOString(), muted_until: null }] },
      { data: [{ conversation_id: CONV_ID, user_id: USER_B }] },
      { data: [{ id: USER_B, username: 'userb' }] },
      { data: [] },
    ]);
    const listRes = await listConversations(req('GET', '/api/conversations?archived=true', undefined, tokenA));
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].isArchived).toBe(true);
  });
});

// ─── Aislamiento de silenciado ────────────────────────────────────────────────
describe('Silenciado es personal: el muted_until de A no afecta la respuesta de B', () => {
  test('User A silencia → User B recibe mutedUntil null en su GET', async () => {
    // User A silencia
    setupQueue([
      { single: { data: { id: 'part-a' }, error: null } },
      { single: { data: { muted_until: futureDate }, error: null } },
    ]);
    const muteRes = await muteConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: futureDate }, tokenA),
      ctxConv
    );
    expect(muteRes.status).toBe(200);

    // User B consulta su lista → su fila tiene muted_until=null (la suya propia)
    setupQueue([
      { data: [{ conversation_id: CONV_ID, encrypted_shared_key: 'ek', shared_key_iv: 'iv', shared_key_mac: 'mac', is_archived: false, archived_at: null, muted_until: null }] },
      { data: [{ conversation_id: CONV_ID, user_id: USER_A }] },
      { data: [{ id: USER_A, username: 'usera' }] },
      { data: [] },
    ]);
    const listRes = await listConversations(req('GET', '/api/conversations', undefined, tokenB));
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.conversations[0].mutedUntil).toBeNull();
  });

  test('Desmutar con null → 200 y muted_until null', async () => {
    setupQueue([
      { single: { data: { id: 'part-a' }, error: null } },
      { single: { data: { muted_until: null }, error: null } },
    ]);
    const res = await muteConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: null }, tokenA),
      ctxConv
    );
    expect(res.status).toBe(200);
    expect((await res.json()).muted_until).toBeNull();
  });
});

// ─── Participante legítimo puede operar ───────────────────────────────────────
describe('Participante legítimo puede archivar y silenciar', () => {
  test('User A archiva su propia conversación → 200', async () => {
    setupQueue([
      { single: { data: { id: 'part-a' }, error: null } },
      { single: { data: { is_archived: true, archived_at: new Date().toISOString() }, error: null } },
    ]);
    const res = await archiveConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/archive`, { archived: true }, tokenA),
      ctxConv
    );
    expect(res.status).toBe(200);
    expect((await res.json()).is_archived).toBe(true);
  });

  test('User B silencia su propia conversación → 200', async () => {
    setupQueue([
      { single: { data: { id: 'part-b' }, error: null } },
      { single: { data: { muted_until: futureDate }, error: null } },
    ]);
    const res = await muteConversation(
      req('PATCH', `/api/conversations/${CONV_ID}/mute`, { muted_until: futureDate }, tokenB),
      ctxConv
    );
    expect(res.status).toBe(200);
    expect((await res.json()).muted_until).toBe(futureDate);
  });
});
