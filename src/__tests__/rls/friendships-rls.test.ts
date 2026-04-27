/**
 * Tests de aislamiento RLS para la tabla friendships.
 *
 * Estos tests simulan el comportamiento que las políticas RLS deben garantizar.
 * Verifican que la lógica de autorización en las API routes impide acceso cruzado.
 *
 * Nota: Los tests de RLS en producción requieren acceso directo a Supabase.
 * Esta suite valida la lógica de autorización en la capa de API Routes,
 * que es la primera línea de defensa junto con RLS.
 */

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-for-testing';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { signJWT, createJWTPayload } from '@/lib/auth/jwt';

const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockOr = jest.fn();

const mockChain = {
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  or: mockOr.mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
};

const mockFrom = jest.fn(() => mockChain);

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { NextRequest } from 'next/server';
import { PATCH as respondRequest } from '@/app/api/contacts/[id]/respond/route';
import { DELETE as deleteContact } from '@/app/api/contacts/[id]/route';

function makeToken(userId: string, username = 'user') {
  return signJWT(createJWTPayload({ id: userId, email: `${username}@test.com`, username }));
}

function makeRequest(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const USER_C = 'cccccccc-0000-0000-0000-000000000003'; // Intruso
const FRIENDSHIP_AB = 'ffffffff-0000-0000-0000-000000000001';

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockChain, {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    or: mockOr.mockReturnThis(),
  });
  mockFrom.mockReturnValue(mockChain);
});

describe('Aislamiento RLS — Friendships', () => {
  /**
   * Política: solo el addressee puede aceptar/rechazar una solicitud.
   * Usuario C no puede responder una solicitud entre A y B.
   */
  test('Usuario C NO puede aceptar solicitud de amistad entre A y B', async () => {
    const tokenC = makeToken(USER_C, 'userc');
    const context = { params: Promise.resolve({ id: FRIENDSHIP_AB }) };

    // La friendship existe entre A y B
    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_AB, requester_id: USER_A, addressee_id: USER_B, status: 'pending' },
      error: null,
    });

    const req = makeRequest(
      'PATCH',
      `/api/contacts/${FRIENDSHIP_AB}/respond`,
      { status: 'accepted' },
      tokenC
    );

    const res = await respondRequest(req, context);
    // Debe ser 403 — usuario C no es addressee
    expect(res.status).toBe(403);
  });

  /**
   * Política: solo el requester puede enviar la solicitud en su nombre.
   * USER_A no puede aceptar su propia solicitud (es el requester).
   */
  test('El requester (A) NO puede responder su propia solicitud', async () => {
    const tokenA = makeToken(USER_A, 'usera');
    const context = { params: Promise.resolve({ id: FRIENDSHIP_AB }) };

    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_AB, requester_id: USER_A, addressee_id: USER_B, status: 'pending' },
      error: null,
    });

    const req = makeRequest(
      'PATCH',
      `/api/contacts/${FRIENDSHIP_AB}/respond`,
      { status: 'accepted' },
      tokenA
    );

    const res = await respondRequest(req, context);
    expect(res.status).toBe(403);
  });

  /**
   * Política: solo participantes de la friendship pueden eliminarla.
   * Usuario C no puede eliminar la friendship entre A y B.
   */
  test('Usuario C NO puede eliminar friendship entre A y B', async () => {
    const tokenC = makeToken(USER_C, 'userc');
    const context = { params: Promise.resolve({ id: FRIENDSHIP_AB }) };

    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_AB, requester_id: USER_A, addressee_id: USER_B },
      error: null,
    });

    const req = makeRequest('DELETE', `/api/contacts/${FRIENDSHIP_AB}`, undefined, tokenC);
    const res = await deleteContact(req, context);
    expect(res.status).toBe(403);
  });

  /**
   * Un usuario no puede responder una solicitud que ya fue aceptada.
   * Previene double-accept o cambio de estado post-aceptación.
   */
  test('No se puede aceptar una solicitud ya aceptada', async () => {
    const tokenB = makeToken(USER_B, 'userb');
    const context = { params: Promise.resolve({ id: FRIENDSHIP_AB }) };

    mockSingle.mockResolvedValueOnce({
      data: { id: FRIENDSHIP_AB, requester_id: USER_A, addressee_id: USER_B, status: 'accepted' },
      error: null,
    });

    const req = makeRequest(
      'PATCH',
      `/api/contacts/${FRIENDSHIP_AB}/respond`,
      { status: 'accepted' },
      tokenB
    );

    const res = await respondRequest(req, context);
    expect(res.status).toBe(409);
  });

  /**
   * Sin autenticación, ningún endpoint de contactos debe responder.
   */
  test('Sin token → 401 en todos los endpoints', async () => {
    const context = { params: Promise.resolve({ id: FRIENDSHIP_AB }) };

    const respondReq = makeRequest('PATCH', `/api/contacts/${FRIENDSHIP_AB}/respond`, { status: 'accepted' });
    const deleteReq = makeRequest('DELETE', `/api/contacts/${FRIENDSHIP_AB}`);

    const [respondRes, deleteRes] = await Promise.all([
      respondRequest(respondReq, context),
      deleteContact(deleteReq, context),
    ]);

    expect(respondRes.status).toBe(401);
    expect(deleteRes.status).toBe(401);
  });

  /**
   * Ataque de escalada: intentar responder con status no permitido (ej: 'blocked').
   * El schema Zod debe rechazarlo antes de llegar a la BD.
   */
  test('Status "blocked" en respond → rechazado por validación', async () => {
    const tokenB = makeToken(USER_B, 'userb');
    const context = { params: Promise.resolve({ id: FRIENDSHIP_AB }) };

    const req = makeRequest(
      'PATCH',
      `/api/contacts/${FRIENDSHIP_AB}/respond`,
      { status: 'blocked' },
      tokenB
    );

    const res = await respondRequest(req, context);
    expect(res.status).toBe(400);
  });
});
