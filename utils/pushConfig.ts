// Web Push / reminder configuration. The VAPID *public* key is safe to ship in
// the client (like the Supabase anon key) — it only lets the browser subscribe.
// The matching PRIVATE key lives ONLY as a Supabase Edge Function secret and is
// never committed. Regenerate the pair with `npx web-push generate-vapid-keys`.
export const VAPID_PUBLIC_KEY =
  "BJ8iRVpSJuIuPUN9-k_7IQlWbeg6-LVcDhufZTQJqFt_5BFHKI_2c3wwmd_rqrYHYJ9FNJLkGWxkEB80xp15bZg";

export const REMINDER_TABLES = {
  settings: "reminder_settings",
  subscriptions: "push_subscriptions",
  status: "daily_status",
} as const;

export type Harshness = "gentle" | "firm" | "drill";

export type ReminderTrigger =
  | "morning" // no open / no plan by wake+buffer
  | "midday" // 0 progress / behind pace
  | "block" // missed a scheduled block's start
  | "streak"; // streak about to break at night

export interface ReminderSettings {
  enabled: boolean;
  harshness: Harshness;
  wakeHour: number; // local hour the day is expected to start (0-23)
  quietStart: number; // local hour quiet hours begin
  quietEnd: number; // local hour quiet hours end
  quotaMinutes: number; // the day's study target used for pace math
  triggers: ReminderTrigger[];
  timezone: string; // IANA tz, e.g. "Asia/Kolkata"
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  harshness: "drill",
  wakeHour: 8,
  quietStart: 23,
  quietEnd: 7,
  quotaMinutes: 360,
  triggers: ["morning", "midday", "block", "streak"],
  timezone:
    (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || "Asia/Kolkata",
};

/** Convert a base64url VAPID key to the Uint8Array pushManager.subscribe wants. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
