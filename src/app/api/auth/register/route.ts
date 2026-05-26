/**
 * POST /api/auth/register
 *
 * Recibe:
 * { email, username, passwordHash, salt, dhPublicKey }
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabase/admin';

import {
  checkRateLimit,
  saveAttempt
} from '@/lib/auth/rateLimit';

import { logSecurityEvent } from '../../../../lib/auth/securityLogs';


export async function POST(
  request: NextRequest
) {

  try {

    const ip =
      request.headers.get(
        'x-forwarded-for'
      ) || 'unknown';

    const userAgent =
      request.headers.get(
        'user-agent'
      ) || 'unknown';


    // Anti bruteforce
    const allowed =
      await checkRateLimit(ip);

    if (!allowed) {

      await logSecurityEvent(
        'RATE_LIMIT_BLOCK',
        null,
        {
          ip,
          userAgent
        }
      );

      return NextResponse.json(
        {
          error:
          'Too many attempts. Try again later.'
        },
        {
          status:429
        }
      );

    }


    const body =
      await request.json();

    const {

      email,

      username,

      passwordHash,

      salt,

      dhPublicKey

    } = body;


    // Requeridos
    if (
      !email ||
      !username ||
      !passwordHash ||
      !salt ||
      !dhPublicKey
    ) {

      await saveAttempt(
        email || '',
        ip,
        false
      );

      await logSecurityEvent(
        'REGISTER_FAILED',
        null,
        {
          ip,
          reason:
          'Missing fields'
        }
      );

      return NextResponse.json(
        {
          error:
          'Missing required fields'
        },
        {
          status:400
        }
      );

    }


    // Email válido
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(email)
    ) {

      await saveAttempt(
        email,
        ip,
        false
      );

      return NextResponse.json(
        {
          error:
          'Invalid email'
        },
        {
          status:400
        }
      );

    }


    // Username válido
    if (
      !/^[a-zA-Z0-9_]{3,30}$/
      .test(username)
    ) {

      await saveAttempt(
        email,
        ip,
        false
      );

      return NextResponse.json(
        {
          error:
          'Username invalid'
        },
        {
          status:400
        }
      );

    }


    const supabase =
      getSupabaseAdmin();


    const {
      data:existing
    } =
    await supabase

    .from('users')

    .select('id')

    .or(
`email.eq.${email},username.eq.${username}`
    )

    .limit(1);


    if (
      existing &&
      existing.length>0
    ) {

      await saveAttempt(
        email,
        ip,
        false
      );

      return NextResponse.json(
        {
          error:
          'User already exists'
        },
        {
          status:409
        }
      );

    }


    const {

      data:user,

      error

    } =
    await supabase

    .from('users')

    .insert({

      email:
      email.toLowerCase(),

      username:
      username.toLowerCase(),

      password_hash:
      passwordHash,

      salt,

      dh_public_key:
      dhPublicKey

    })

    .select(
'id,email,username,created_at'
    )

    .single();


    if(error){

      await saveAttempt(
        email,
        ip,
        false
      );

      await logSecurityEvent(
        'REGISTER_FAILED',
        null,
        {
          ip,
          error
        }
      );

      return NextResponse.json(
        {
          error:
          'Failed creating user'
        },
        {
          status:500
        }
      );

    }


    await saveAttempt(
      email,
      ip,
      true
    );


    await logSecurityEvent(

      'REGISTER_SUCCESS',

      user.id,

      {

        ip,

        userAgent

      }

    );


    return NextResponse.json(
      {user},
      {status:201}
    );

  }

  catch(err){

    console.error(
      'Register error:',
      err
    );

    return NextResponse.json(
      {
        error:
        'Internal server error'
      },
      {
        status:500
      }
    );

  }

}