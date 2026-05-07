import { z } from 'zod';
import { sanitizeGroupName, sanitizeDescription, hasHtmlChars } from '@/lib/security/sanitize';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CreateGroupSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .max(50, 'El nombre no puede exceder 50 caracteres')
    .transform(sanitizeGroupName)
    .refine((v) => v.length >= 1, 'El nombre no puede estar vacío')
    .refine((v) => !hasHtmlChars(v), 'El nombre contiene caracteres no permitidos'),
  description: z
    .string()
    .max(200, 'La descripción no puede exceder 200 caracteres')
    .optional()
    .transform((v) => (v ? sanitizeDescription(v) : undefined))
    .refine((v) => v === undefined || !hasHtmlChars(v), 'La descripción contiene caracteres no permitidos'),
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
    .refine((v) => !hasHtmlChars(v), 'El nombre contiene caracteres no permitidos')
    .optional(),
  description: z
    .string()
    .max(200)
    .transform(sanitizeDescription)
    .refine((v) => !hasHtmlChars(v), 'La descripción contiene caracteres no permitidos')
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

export const GroupMessageSchema = z.object({
  e2eEncrypted: z.object({
    ciphertext: z.string().min(1, 'ciphertext es obligatorio').max(500_000, 'ciphertext excede el tamaño máximo'),
    iv:         z.string().min(1, 'iv es obligatorio').max(256, 'iv excede el tamaño máximo'),
    mac:        z.string().min(1, 'mac es obligatorio').max(256, 'mac excede el tamaño máximo'),
  }),
  message_type: z.enum(['text', 'voice', 'image', 'file']).optional().default('text'),
});

export type CreateGroupInput   = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupInput   = z.infer<typeof UpdateGroupSchema>;
export type AddMemberInput     = z.infer<typeof AddMemberSchema>;
export type ChangeRoleInput    = z.infer<typeof ChangeRoleSchema>;
export type GroupMessageInput  = z.infer<typeof GroupMessageSchema>;
