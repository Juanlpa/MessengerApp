import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function PATCH(request: NextRequest) {

  try {

    const authHeader =
      request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { error:'Unauthorized' },
        { status:401 }
      );
    }

    const token =
      authHeader.replace(
        'Bearer ',
        ''
      );

    const decoded:any =
      jwt.verify(
        token,
        process.env.JWT_SECRET!
      );
      console.log("JWT:", decoded);

    const body =
      await request.json();

    const {
      currentPassword,
      newPassword
    } = body;

    if(
      !currentPassword ||
      !newPassword
    ){

      return NextResponse.json(
      {
        error:'Missing fields'
      },
      {
        status:400
      });

    }

    const supabase =
      getSupabaseAdmin();

    const {
 data:user
}=
await supabase
.from('users')
.select(`
 id,
 password_hash,
 salt
`)
.eq(
 'id',
 decoded.sub
)
.single();


    if(!user){

      return NextResponse.json(
      {
        error:'User not found'
      },
      {
        status:404
      });

    }


    // recrear hash actual

    const currentHash = crypto
.createHash('sha256')
.update(

crypto
.pbkdf2Sync(
currentPassword,
Buffer.from(user.salt,'hex'),
100000,
32,
'sha256'
)

)
.digest('hex');


console.log(
"GENERADO:",
currentHash
);

console.log(
"DB:",
user.password_hash
);


if(
currentHash !== user.password_hash
){

      return NextResponse.json(
      {
      error:'Contraseña actual incorrecta'
      },
      {
      status:401
      });

    }


    // nuevo salt

    const newSalt =
      crypto
      .randomBytes(16)
      .toString('hex');


    const newHash = crypto
.createHash('sha256')
.update(

crypto
.pbkdf2Sync(
newPassword,
Buffer.from(newSalt,'hex'),
100000,
32,
'sha256'
)

)
.digest('hex');


    await supabase
    .from('users')
    .update({

      salt:newSalt,

      password_hash:newHash

    })
    .eq(
      'id',
      user.id
    );


    return NextResponse.json({

      message:
      'Contraseña actualizada correctamente'

    });

  }

  catch(err){

    console.log(err);

    return NextResponse.json(
    {
      error:'Server error'
    },
    {
      status:500
    });

  }

}