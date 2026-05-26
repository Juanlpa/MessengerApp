import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function checkRateLimit(ip: string) {
  const supabase = getSupabaseAdmin();

  const oneMinuteAgo =
    new Date(Date.now() - 60000).toISOString();

  const { count } = await supabase
    .from("login_attempts")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq("ip", ip)
    .eq("success", false)
    .gte(
      "attempted_at",
      oneMinuteAgo
    );

  return (count ?? 0) < 5;
}

export async function saveAttempt(
  email: string,
  ip: string,
  success: boolean
) {

  const supabase =
    getSupabaseAdmin();

  await supabase
    .from("login_attempts")
    .insert({
      email,
      ip,
      success
    });
}