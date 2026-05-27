/**
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { signJWT, createJWTPayload } from '@/lib/auth/jwt';
import { constantTimeEqual, fromHex } from '@/lib/crypto/utils';

interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  salt: string;
  dh_public_key: string;
}

export async function POST(request: NextRequest) {

  try {

    const body = await request.json();

    const {
      email,
      passwordHash
    } = body;

    if (
      !email ||
      !passwordHash
    ) {

      return NextResponse.json(
        {
          error:'Email and passwordHash required'
        },
        {
          status:400
        }
      );

    }

    const supabase =
      getSupabaseAdmin();

    const {
      data
    } =
    await supabase

    .from(
      'users'
    )

    .select(
      `
      id,
      email,
      username,
      password_hash,
      salt,
      dh_public_key
      `
    )

    .eq(
      'email',
      email.toLowerCase()
    )

    .single();

    const user =
      data as UserRow | null;

    if(!user){

      console.log(
        'USUARIO NO ENCONTRADO'
      );

      return NextResponse.json(
        {
          error:'Invalid credentials'
        },
        {
          status:401
        }
      );

    }

    // logs
    console.log(
      'EMAIL:',
      email
    );

    console.log(
      'SALT DB:',
      user.salt
    );

    console.log(
      'HASH FRONT:',
      passwordHash
    );

    console.log(
      'HASH DB:',
      user.password_hash
    );


    const storedHash =
      fromHex(
        user.password_hash
      );

    const providedHash =
      fromHex(
        passwordHash
      );


    const valid =
      constantTimeEqual(
        storedHash,
        providedHash
      );

    console.log(
      'MATCH:',
      valid
    );


    if(!valid){

      return NextResponse.json(
        {
          error:'Invalid credentials'
        },
        {
          status:401
        }
      );

    }


    const payload =
    createJWTPayload({

      id:user.id,

      email:user.email,

      username:user.username

    });


    const token =
      signJWT(
        payload
      );


    return NextResponse.json({

      token,

      user:{

        id:user.id,

        email:user.email,

        username:user.username

      }

    });

  }
  catch(err){

    console.error(
      'LOGIN ERROR:',
      err
    );

    return NextResponse.json(
      {
        error:'Internal server error'
      },
      {
        status:500
      }
    );

  }

}