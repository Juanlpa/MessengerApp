/**
 * Envío de email de recuperación de contraseña vía Resend.
 *
 * NOTA: el cliente Resend se inicializa de forma perezosa (lazy) — si lo
 * creáramos en el top-level del módulo, `new Resend(undefined)` rompería el
 * build estático cuando RESEND_API_KEY no está definida (CI, primer deploy, etc).
 */

import { Resend } from 'resend';

let cachedClient: Resend | null = null;

function getResendClient(): Resend {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY no está configurado. Define la variable de entorno en producción.'
    );
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export async function sendResetEmail(email: string, resetLink: string): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('EMAIL_FROM no está configurado.');
  }

  const client = getResendClient();
  await client.emails.send({
    from,
    to: email,
    subject: 'Restablecer contraseña',
    html: `
      <h2>Restablecer contraseña</h2>
      <p>Solicitaste restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>El enlace expira en 30 minutos. Si tú no solicitaste este cambio, ignora este correo.</p>
    `,
  });
}
