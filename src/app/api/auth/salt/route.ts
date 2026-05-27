import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error:'Email requerido' },
        { status:400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const {
      data:user,
      error
    } = await supabase
      .from('users')
      .select('salt')
      .eq(
        'email',
        email.toLowerCase()
      )
      .single();

    if(error || !user){

      return NextResponse.json(
        {
          error:'Usuario no encontrado'
        },
        {
          status:404
        }
      );

    }

    return NextResponse.json({
      salt:user.salt
    });

  }
  catch(err){

    console.error(
      'Salt error:',
      err
    );

    return NextResponse.json(
      {
        error:'Internal error'
      },
      {
        status:500
      }
    );

  }
}