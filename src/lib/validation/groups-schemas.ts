import { z } from 'zod';
import { sanitizeGroupName, sanitizeDescription } from '@/lib/security/sanitize';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CreateGroupSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .max(50, 'El nombre no puede exceder 50 caracteres')
    .transform(sanitizeGroupName)
    .refine((v) => v.length >= 1, 'El nombre no puede estar vacío'),
  description: z
    .string()
    .max(200, 'La descripción no puede exceder 200 caracteres')
    .optional()
    .transform((v) => (v ? sanitizeDescription(v) : undefined)),
  member_ids: z
    .array(z.string().regex(UUID_REGEX, 'ID de miembro inválido'))
    .min(2, 'Se requieren al menos 2 miembros adicionales (mínimo 3 en total con el creador)')
    .max(255, 'No se pueden agregar más de 255 miembros'),
});

export const UpdateGroupSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .transform(sanitizeGroupName)
    .optional(),
  description: z
    .string()
    .max(200)
    .transform(sanitizeDescription)
    .optional(),
  avatar_url: z
    .string()
    .url('avatar_url debe ser una URL válida')
    .optional()
    .nullable(),
});

export const AddMemberSchema = z.object({
  user_id: z.string().regex(UUID_REGEX, 'user_id debe ser un UUID válido'),
});

export const ChangeRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
export type AddMemberInput = z.infer<typeof AddMemberSchema>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
