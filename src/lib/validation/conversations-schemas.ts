import { z } from 'zod';

export const ArchiveSchema = z.object({
  archived: z.boolean(),
});

export const MuteSchema = z.object({
  /** ISO 8601 datetime (o null para desactivar silenciamiento) */
  muted_until: z.string().datetime({ offset: true }).nullable(),
});

export type ArchiveInput = z.infer<typeof ArchiveSchema>;
export type MuteInput    = z.infer<typeof MuteSchema>;
