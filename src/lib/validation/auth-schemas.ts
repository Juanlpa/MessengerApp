import { z } from 'zod';

export const UsernameSchema = z
  .string()
  .min(3, 'El username debe tener al menos 3 caracteres')
  .max(30, 'El username no puede exceder 30 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'El username solo puede contener letras, números y guion bajo');

export const EmailSchema = z
  .string()
  .email('El email no es válido')
  .max(254, 'El email no puede exceder 254 caracteres');

export const PasswordHashSchema = z
  .string()
  .length(64, 'El hash de contraseña debe tener exactamente 64 caracteres hex')
  .regex(/^[0-9a-f]+$/i, 'El hash de contraseña debe ser hexadecimal');

export const RegisterSchema = z.object({
  username: UsernameSchema,
  email: EmailSchema,
  password_hash: PasswordHashSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
