// Orbit reminder-cron — the drill sergeant's brain.
// Invoked every ~15 min by pg_cron. For each opted-in user it works out their
// local time, checks quiet hours, evaluates the trigger conditions against the
// daily_status the client synced, composes stakes-injected copy at the chosen
// harshness, and sends Web Push to every registered device. Throttled so it
// escalates without spamming. Dead subscriptions are pruned.
//
// Deploy: `supabase functions deploy reminder-cron --no-verify-jwt`
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (see runbook).
//
// AUTH: --no-verify-jwt means the platform lets every request through, so this
// function does its own checking (see `authorize` below). Two callers only:
//   • pg_cron, presenting the service-role key  → may run the full sweep
//   • a signed-in browser, presenting its JWT   → may test-push to ITSELF only
// Anything else is rejected with 401. Without this the test path would push to
// every subscription in the database for anyone who knows the URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Dedicated secret for the scheduled sweep.
 *
 * Cron auth deliberately does NOT depend on the service-role key. Two reasons:
 * the value injected as SUPABASE_SERVICE_ROLE_KEY is not guaranteed to be the
 * same string the cron job presents (projects migrated to the new
 * publishable/secret key scheme inject a different format, which silently broke
 * this), and a purpose-scoped secret means the scheduler is not carrying a key
 * that can read and write every table in the project.
 *
 * Set it with:  supabase secrets set CRON_SECRET=<random>
 * If unset, the service-role key is still accepted so existing installs keep
 * working.
 */
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:santoshcheethirala.me@gmail.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

type Harshness = "gentle" | "firm" | "drill";
interface Ctx {
  streak?: number;
  nextExam?: { subject: string; type: string; daysLeft: number };
  dueAssignment?: { title: string; daysLeft: number };
  nextBlock?: { subject: string; dueBy: string };
}

// Local wall-clock in an IANA timezone.
function local(tz: string) {
  const now = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  const hour = parseInt(p.hour === "24" ? "0" : p.hour, 10);
  return { now, dateStr: `${p.year}-${p.month}-${p.day}`, hour, minute: parseInt(p.minute, 10) };
}

function inQuietHours(hour: number, start: number, end: number): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

// Build the "real stakes" clause pulled from the user's own data.
function stake(ctx: Ctx): string {
  if (ctx.nextExam && ctx.nextExam.daysLeft <= 14)
    return `${ctx.nextExam.subject} ${ctx.nextExam.type.toUpperCase()} in ${ctx.nextExam.daysLeft}d.`;
  if (ctx.dueAssignment && ctx.dueAssignment.daysLeft <= 3)
    return `"${ctx.dueAssignment.title}" due in ${ctx.dueAssignment.daysLeft}d.`;
  if ((ctx.streak ?? 0) >= 3) return `${ctx.streak}-day streak on the line.`;
  return "";
}

interface Msg { title: string; body: string; sticky: boolean; }

function compose(
  trigger: string, h: Harshness, ctx: Ctx,
  s: { doneMinutes: number; quota: number; blocksDone: number; blocksTotal: number },
  hour: number, minsLate: number,
): Msg {
  const st = stake(ctx);
  const donePct = s.quota > 0 ? Math.round((s.doneMinutes / s.quota) * 100) : 0;
  const subj = ctx.nextBlock?.subject ?? "your next block";
  const streak = ctx.streak ?? 0;

  const T = {
    morning: {
      gentle: { title: "Morning — your plan's waiting", body: `Open Orbit and build today. ${st}`.trim(), sticky: false },
      firm: { title: "It's late to still be idle", body: `${hour}:00 and no plan yet. ${st} Set the day up.`.trim(), sticky: false },
      drill: { title: "Get up. The day's already moving.", body: `${hour}:00 and Orbit's still closed. ${st} Open it, build the plan, go.`.trim(), sticky: true },
    },
    block: {
      gentle: { title: `${subj} is ready`, body: `It was due to start a bit ago. ${st} Tap to begin.`.trim(), sticky: false },
      firm: { title: `${subj} started ${minsLate}m ago — without you`, body: `The block's overdue. ${st} Start it now.`.trim(), sticky: false },
      drill: { title: `${subj} was due ${minsLate}m ago.`, body: `You planned it. You skipped it. ${st} Tap and start — no more drift.`.trim(), sticky: true },
    },
    midday: {
      gentle: { title: "Gentle nudge — still time", body: `${donePct}% of today done. ${st} One block moves it.`.trim(), sticky: false },
      firm: { title: `${donePct}% done and it's past noon`, body: `${s.doneMinutes} of ${s.quota} min. ${st} Pick it up.`.trim(), sticky: false },
      drill: { title: `${donePct}% done. Half the day's gone.`, body: `${s.doneMinutes} of ${s.quota} min. This is a wasted day in progress. ${st} One block flips it.`.trim(), sticky: false },
    },
    streak: {
      gentle: { title: "Keep your streak alive", body: `Nothing logged yet today. ${st} 20 minutes does it.`.trim(), sticky: false },
      firm: { title: `Your ${streak}-day streak is at risk`, body: `Nothing today and the day's nearly gone. ${st} 20 minutes saves it.`.trim(), sticky: false },
      drill: { title: `Your ${streak}-day streak dies at midnight.`, body: `Zero logged today. ${st} 20 minutes saves it — or watch ${streak} days burn.`.trim(), sticky: true },
    },
  } as const;

  const bucket = (T as any)[trigger]?.[h] ?? (T as any)[trigger]?.drill;
  return bucket ?? { title: "Orbit", body: "Time to study.", sticky: false };
}

async function run(): Promise<{ evaluated: number; sent: number }> {
  const { data: settings } = await db.from("reminder_settings").select("*").eq("enabled", true);
  let sent = 0;
  for (const cfg of settings ?? []) {
    const tz = cfg.timezone || "Asia/Kolkata";
    const { now, dateStr, hour } = local(tz);
    if (inQuietHours(hour, cfg.quiet_start ?? 23, cfg.quiet_end ?? 7)) continue;

    const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", cfg.user_id);
    if (!subs || subs.length === 0) continue;

    // today's status row (may not exist yet — treat as empty day)
    const { data: statusRows } = await db
      .from("daily_status").select("*").eq("user_id", cfg.user_id).eq("date", dateStr).limit(1);
    const status = statusRows?.[0] ?? {
      planned_minutes: 0, done_minutes: 0, blocks_total: 0, blocks_done: 0,
      plan_generated: false, last_active: null, context: {}, last_reminder_at: null,
      last_tier: 0, sent_triggers: [],
    };
    const ctx: Ctx = status.context ?? {};
    const triggersOn: string[] = cfg.triggers ?? ["morning", "midday", "block", "streak"];
    const sentTriggers: string[] = status.sent_triggers ?? [];

    // throttle: min gap since last send scales down with harshness
    const gapMin = cfg.harshness === "drill" ? 45 : cfg.harshness === "firm" ? 75 : 120;
    if (status.last_reminder_at && now.getTime() - new Date(status.last_reminder_at).getTime() < gapMin * 60_000) continue;

    const wake = cfg.wake_hour ?? 8;
    const quiet = cfg.quiet_start ?? 23;
    const expected = (cfg.quota_minutes ?? 360) * Math.max(0, Math.min(1, (hour - wake) / Math.max(1, quiet - wake)));

    // evaluate candidate triggers, most-urgent first; pick first unsent-and-true
    let picked: { trigger: string; key: string; minsLate: number } | null = null;

    const blockDueBy = ctx.nextBlock?.dueBy ? new Date(ctx.nextBlock.dueBy).getTime() : 0;
    const blockLate = blockDueBy ? Math.round((now.getTime() - blockDueBy) / 60_000) : 0;
    if (
      !picked && triggersOn.includes("block") && status.plan_generated && ctx.nextBlock &&
      blockLate > 10 && status.blocks_done < status.blocks_total
    ) {
      const key = `block:${ctx.nextBlock.dueBy}`;
      if (!sentTriggers.includes(key)) picked = { trigger: "block", key, minsLate: blockLate };
    }
    if (!picked && triggersOn.includes("streak") && hour >= quiet - 2 && status.done_minutes === 0 && (ctx.streak ?? 0) >= 1) {
      if (!sentTriggers.includes("streak")) picked = { trigger: "streak", key: "streak", minsLate: 0 };
    }
    if (!picked && triggersOn.includes("midday") && status.plan_generated && hour >= 12 && status.done_minutes < expected * 0.5) {
      const key = hour < 16 ? "pace:early" : "pace:late";
      if (!sentTriggers.includes(key)) picked = { trigger: "midday", key, minsLate: 0 };
    }
    if (!picked && triggersOn.includes("morning") && hour >= wake + 1 && hour < 12 && !status.plan_generated) {
      if (!sentTriggers.includes("morning")) picked = { trigger: "morning", key: "morning", minsLate: 0 };
    }
    if (!picked) continue;

    const msg = compose(
      picked.trigger, (cfg.harshness ?? "drill") as Harshness, ctx,
      { doneMinutes: status.done_minutes, quota: cfg.quota_minutes ?? 360, blocksDone: status.blocks_done, blocksTotal: status.blocks_total },
      hour, picked.minsLate,
    );
    const tier = (status.last_tier ?? 0) + 1;
    const payload = JSON.stringify({
      title: msg.title,
      body: msg.body,
      tag: `orbit-${picked.trigger}`,
      url: "/?action=focus",
      sticky: msg.sticky && cfg.harshness === "drill",
      vibrate: cfg.harshness === "drill" ? [260, 90, 260, 90, 400] : [200, 100, 200],
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("push failed", e?.statusCode, e?.body ?? e?.message);
        }
      }
    }

    await db.from("daily_status").upsert(
      {
        user_id: cfg.user_id, date: dateStr,
        last_reminder_at: now.toISOString(),
        last_tier: tier,
        sent_triggers: [...sentTriggers, picked.key],
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,date" },
    );
  }
  return { evaluated: settings?.length ?? 0, sent };
}

// On-demand delivery check — bypasses all trigger/time/quiet-hours logic and
// just fires one notification to the user's own devices. Triggered by the
// Settings "Send test push" button. The user id comes from the verified JWT,
// never from the request body, so a caller can only ever reach their own
// devices.
async function sendTest(userId: string): Promise<{ test: true; sent: number; devices: number }> {
  const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", userId);
  const payload = JSON.stringify({
    title: "Orbit — test push ✅",
    body: "Delivery works. When you slip, this is how the drill sergeant reaches you.",
    tag: "orbit-test",
    url: "/?action=focus",
    vibrate: [200, 100, 200],
  });
  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }
  return { test: true, sent, devices: subs?.length ?? 0 };
}

// CORS — the Settings "Send test push" button calls this from the browser, so
// the preflight (OPTIONS) and the response both need these headers. The cron
// (server-to-server) doesn't care, but they're harmless there.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/**
 * Who is calling?
 *   "cron" — the bearer token IS the service-role key (only pg_cron and the
 *            project owner have it). Allowed to sweep every user.
 *   uid    — a valid end-user JWT. Allowed to test-push to their own devices.
 *   null   — no/!valid credentials. Rejected.
 * Compared with a constant-time-ish check so the service key can't be probed
 * byte-by-byte through response timing.
 */
function secretMatches(token: string, secret: string): boolean {
  if (!secret || token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

async function authorize(req: Request): Promise<"cron" | string | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  // Scheduled sweep: a dedicated secret, or the service-role key for installs
  // that predate CRON_SECRET.
  if (secretMatches(token, CRON_SECRET) || secretMatches(token, SERVICE_ROLE)) return "cron";

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Cheap per-user cooldown on the test path so a signed-in user can't loop the
// button (or the endpoint) into a self-inflicted notification storm. Instance
// memory is enough — it only has to blunt a tight loop.
const TEST_COOLDOWN_MS = 30_000;
const lastTestAt = new Map<string, number>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const caller = await authorize(req);
    if (!caller) {
      // One line, no values. A rejected caller is usually a probe, but it is
      // also how a misconfigured scheduler looks — and that failure is
      // otherwise completely silent: reminders simply stop arriving. Worth a
      // log entry so it is greppable next time.
      console.warn("reminder-cron: rejected unauthorized request");
      return json({ error: "unauthorized" }, 401);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* no/empty body — treat as a cron tick */
    }

    if (body?.test) {
      // Own devices only — body.user_id is deliberately ignored.
      if (caller === "cron") return json({ error: "test requires a user session" }, 400);
      const now = Date.now();
      const previous = lastTestAt.get(caller) ?? 0;
      if (now - previous < TEST_COOLDOWN_MS) {
        return json({ error: "slow down", retryInSeconds: Math.ceil((TEST_COOLDOWN_MS - (now - previous)) / 1000) }, 429);
      }
      lastTestAt.set(caller, now);
      return json(await sendTest(caller));
    }

    if (caller !== "cron") return json({ error: "forbidden" }, 403);
    return json(await run());
  } catch (e) {
    console.error("reminder-cron fatal", e);
    return json({ error: "internal error" }, 500);
  }
});
