/**
 * Tests para las API routes de contactos.
 * Se testea la lógica de validación y autorización usando mocks de Supabase.
 */

// Variables de entorno requeridas por los módulos
process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-for-testing';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { signJWT, createJWTPayload } from '@/lib/auth/jwt';

// ─────────────────────────────────────────────
// Mock de Supabase Admin
// ─────────────────────────────────────────────
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockOr = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn();
const mockNeq = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  neq: mockNeq.mockReturnThis(),
  or: mockOr.mockReturnThis(),
  in: mockIn.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
}));

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { NextRequest } from 'next/server';
import { POST as sendRequest } from '@/app/api/contacts/request/route';
import { PATCH as respondRequest } from '@/app/api/contacts/[id]/respond/route';
import { DELETE as deleteContact } from '@/app/api/contacts/[id]/route';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function makeRequest(method: string, path: string, body?: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeToken(userId: string, username = 'testuser') {
  return signJWT(createJWTPayload({ id: userId, email: `${username}@test.com`, username }));
}

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const FRIENDSHIP_ID = 'ffffffff-0000-0000-0000-000000000001';

beforeEach(() => {
  jest.clearAllMocks();
  // Restaurar cadena de mocks
  mockFrom.mockReturnValue({
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    neq: mockNeq.mockReturnThis(),
    or: mockOr.mockReturnThis(),
    in: mockIn.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
  });
});

// ─────────────────────────────────────────────
// POST /api/contacts/request
// ─────────────────────────────────────────────
describe('POST /api/contacts/request', () => {
  test('devuelve 401 sin token', async () => {
    const req = makeRequest('POST', '/api/contacts/request', { addressee_id: USER_B });
    const res = await sendRequest(req);
    expect(res.status).toBe(401);
  });

  test('devuelve 400 si addressee_id no es UUID válido', async () => {
    const token = makeToken(USER_A);
    const req = makeRequest('POST', '/api/contacts/request', { addressee_id: 'no-es-uuid' }, token);
    const res = await sendRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/UUID/);
  });

  test('devuelve 400 si intenta enviarse solicitud a sí mismo', async () => {
    const token = makeToken(USER_A);
    const req = makeRequest('POST', '/api/contacts/request', { addressee_id: USER_A }, token);
    const res = await sendRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ti mismo/);
  });

  test('devuelve 404 si el destinatario no existe', async () => {
    const token = makeToken(USER_A);
    // El destinatario no existe → single() devuelve null
    mockSingle.mockResolvedValueOnce({ data: null, error: null });

    const req = makeRequest('POST', '/api/contacts/request', { addressee_id: USER_B }, token);
    const res = await sendRequest(req);
    expect(res.status).toBe(404);
  });

  test('devuelve 409 si ya existe friendship', async () => {
    const token = makeToken(USER_A);
    // El destinatario existe
    mockSingle.mockResolvedValueOnce({ data: { id: USER_B }, error: null });
    // Ya existe friendship
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, status: 'pending' },
      error: null,
    });

    const req = makeRequest('POST', '/api/contacts/request', { addressee_id: USER_B }, token);
    const res = await sendRequest(req);
    expect(res.status).toBe(409);
  });

  test('crea friendship correctamente', async () => {
    const token = makeToken(USER_A);
    // Destinatario existe
    mockSingle.mockResolvedValueOnce({ data: { id: USER_B }, error: null });
    // No existe friendship previa
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // Inserción exitosa
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B, status: 'pending', created_at: new Date().toISOString() },
      error: null,
    });

    const req = makeRequest('POST', '/api/contacts/request', { addressee_id: USER_B }, token);
    const res = await sendRequest(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.friendship.status).toBe('pending');
  });
});

// ─────────────────────────────────────────────
// PATCH /api/contacts/[id]/respond
// ─────────────────────────────────────────────
describe('PATCH /api/contacts/[id]/respond', () => {
  const context = { params: Promise.resolve({ id: FRIENDSHIP_ID }) };

  test('devuelve 401 sin token', async () => {
    const req = makeRequest('PATCH', `/api/contacts/${FRIENDSHIP_ID}/respond`, { status: 'accepted' });
    const res = await respondRequest(req, context);
    expect(res.status).toBe(401);
  });

  test('devuelve 400 con status inválido', async () => {
    const token = makeToken(USER_B);
    const req = makeRequest('PATCH', `/api/contacts/${FRIENDSHIP_ID}/respond`, { status: 'blocked' }, token);
    const res = await respondRequest(req, context);
    expect(res.status).toBe(400);
  });

  test('devuelve 403 si el usuario no es el addressee', async () => {
    const token = makeToken(USER_A); // USER_A es el requester, no puede responder
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B, status: 'pending' },
      error: null,
    });

    const req = makeRequest('PATCH', `/api/contacts/${FRIENDSHIP_ID}/respond`, { status: 'accepted' }, token);
    const res = await respondRequest(req, context);
    expect(res.status).toBe(403);
  });

  test('devuelve 409 si la solicitud ya fue procesada', async () => {
    const token = makeToken(USER_B);
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B, status: 'accepted' },
      error: null,
    });

    const req = makeRequest('PATCH', `/api/contacts/${FRIENDSHIP_ID}/respond`, { status: 'accepted' }, token);
    const res = await respondRequest(req, context);
    expect(res.status).toBe(409);
  });

  test('acepta correctamente una solicitud pendiente', async () => {
    const token = makeToken(USER_B);
    // Friendship existente y pendiente
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B, status: 'pending' },
      error: null,
    });
    // Update exitoso
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B, status: 'accepted', updated_at: new Date().toISOString() },
      error: null,
    });

    const req = makeRequest('PATCH', `/api/contacts/${FRIENDSHIP_ID}/respond`, { status: 'accepted' }, token);
    const res = await respondRequest(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.friendship.status).toBe('accepted');
  });
});

// ─────────────────────────────────────────────
// DELETE /api/contacts/[id]
// ─────────────────────────────────────────────
describe('DELETE /api/contacts/[id]', () => {
  const context = { params: Promise.resolve({ id: FRIENDSHIP_ID }) };

  test('devuelve 401 sin token', async () => {
    const req = makeRequest('DELETE', `/api/contacts/${FRIENDSHIP_ID}`);
    const res = await deleteContact(req, context);
    expect(res.status).toBe(401);
  });

  test('devuelve 403 si el usuario no es parte de la friendship', async () => {
    const OTHER_USER = 'cccccccc-0000-0000-0000-000000000003';
    const token = makeToken(OTHER_USER, 'otherusr');
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B },
      error: null,
    });

    const req = makeRequest('DELETE', `/api/contacts/${FRIENDSHIP_ID}`, undefined, token);
    const res = await deleteContact(req, context);
    expect(res.status).toBe(403);
  });

  test('el requester puede eliminar su friendship', async () => {
    const token = makeToken(USER_A);
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B },
      error: null,
    });
    mockDelete.mockReturnValue({ eq: jest.fn().mockResolvedValueOnce({ error: null }) });

    const req = makeRequest('DELETE', `/api/contacts/${FRIENDSHIP_ID}`, undefined, token);
    const res = await deleteContact(req, context);
    expect(res.status).toBe(200);
  });

  test('el addressee puede eliminar su friendship', async () => {
    const token = makeToken(USER_B, 'userb');
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_ID, requester_id: USER_A, addressee_id: USER_B },
      error: null,
    });
    mockDelete.mockReturnValue({ eq: jest.fn().mockResolvedValueOnce({ error: null }) });

    const req = makeRequest('DELETE', `/api/contacts/${FRIENDSHIP_ID}`, undefined, token);
    const res = await deleteContact(req, context);
    expect(res.status).toBe(200);
  });
});
