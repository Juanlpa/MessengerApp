import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SendRequestSchema = z.object({
  addressee_id: z
    .string()
    .regex(UUID_REGEX, 'addressee_id debe ser un UUID válido'),
});

export const RespondRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected']).refine(
    (v) => v === 'accepted' || v === 'rejected',
    { message: 'status debe ser "accepted" o "rejected"' }
  ),
});

export const MuteDurationSchema = z.object({
  duration: z.enum(['1h', '8h', '1week', 'always']),
});

export type SendRequestInput = z.infer<typeof SendRequestSchema>;
export type RespondRequestInput = z.infer<typeof RespondRequestSchema>;
