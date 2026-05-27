import { Resend } from 'resend';

const resend=
new Resend(
process.env.RESEND_API_KEY
);

export async function sendResetEmail(
email:string,
resetLink:string
){

await resend.emails.send({

from:
process.env.EMAIL_FROM!,

to:email,

subject:
'Restablecer contraseña',

html:`

<h2>Reset Password</h2>

<p>
Haz clic:
</p>

<a href="${resetLink}">
${resetLink}
</a>

<p>
Expira en 30 minutos
</p>

`

});

}