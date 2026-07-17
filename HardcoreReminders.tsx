import React, { useState } from "react";
import { Flame, Smartphone, AlertTriangle } from "lucide-react";
import {
  getReminderSettings,
  saveReminderSettings,
  enableReminders,
  disableReminders,
  isPushSupported,
  isInstalledPWA,
} from "./utils/reminders";
import type { ReminderSettings, Harshness, ReminderTrigger } from "./utils/pushConfig";
import { useToast } from "./Toast";

const HARSH: { k: Harshness; label: string; desc: string }[] = [
  { k: "gentle", label: "Gentle", desc: "Soft nudges" },
  { k: "firm", label: "Firm", desc: "Direct pressure" },
  { k: "drill", label: "Drill", desc: "Brutal + stakes" },
];

const TRIGGERS: { k: ReminderTrigger; label: string; desc: string }[] = [
  { k: "morning", label: "Morning kick", desc: "No plan by wake + 1h" },
  { k: "block", label: "Missed block", desc: "A block's start time passed" },
  { k: "midday", label: "Behind pace", desc: "Little done by midday" },
  { k: "streak", label: "Streak saver", desc: "Streak at risk at night" },
];

const fmtHour = (h: number) => (h === 0 ? "12AM" : h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`);

export const HardcoreReminders = () => {
  const toast = useToast();
  const [s, setS] = useState<ReminderSettings>(getReminderSettings());
  const [busy, setBusy] = useState(false);
  const supported = isPushSupported();
  const installed = isInstalledPWA();

  // Persist edits (to Supabase only once enabled; local cache always).
  const patch = (next: Partial<ReminderSettings>) => {
    const merged = { ...s, ...next };
    setS(merged);
    if (merged.enabled) void saveReminderSettings(merged);
    else localStorage.setItem("orbit-reminder-settings", JSON.stringify(merged));
  };

  const onToggle = async (on: boolean) => {
    if (!supported) {
      toast.error("Push isn't supported on this browser.");
      return;
    }
    setBusy(true);
    try {
      if (on) {
        const res = await enableReminders(s);
        if (res.ok) {
          setS({ ...s, enabled: true });
          toast.success("Hardcore mode armed. Orbit will come after you.");
        } else if (res.reason === "not-signed-in") {
          toast.error("Turn on Cloud sync and sign in first — the server needs to know who to chase.");
        } else if (res.reason === "denied") {
          toast.error("Notification permission was denied.");
        } else if (res.reason === "unsupported") {
          toast.error("Push isn't supported on this browser.");
        } else {
          toast.error("Couldn't arm reminders — try again.");
        }
      } else {
        await disableReminders();
        setS({ ...s, enabled: false });
        toast.info("Hardcore reminders off.");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleTrigger = (k: ReminderTrigger) => {
    const has = s.triggers.includes(k);
    patch({ triggers: has ? s.triggers.filter((t) => t !== k) : [...s.triggers, k] });
  };

  const on = s.enabled;

  return (
    <div className="rounded-3xl border border-orange-500/25 bg-orange-500/[0.05] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
            <Flame size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-bold text-sm text-white">Hardcore mode</div>
            <div className="text-xs text-mute mt-0.5 leading-snug">
              Push that reaches your phone even when Orbit's closed — if you skip your day, it comes after you.
            </div>
          </div>
        </div>
        <button
          disabled={busy}
          onClick={() => onToggle(!on)}
          className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${on ? "bg-orange-500" : "bg-white/15"} ${busy ? "opacity-50" : ""}`}
          aria-pressed={on}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {!installed && (
        <div className="flex items-center gap-2 text-[11px] text-yellow-300/90 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">
          <Smartphone size={13} className="shrink-0" />
          Install Orbit to your Home Screen for reliable delivery (required on iOS).
        </div>
      )}

      {on && (
        <div className="space-y-4 pt-1">
          {/* Harshness */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-mute mb-2">Harshness</div>
            <div className="grid grid-cols-3 gap-2">
              {HARSH.map((h) => (
                <button
                  key={h.k}
                  onClick={() => patch({ harshness: h.k })}
                  className={`rounded-2xl px-2 py-2.5 text-center border-2 transition-all ${s.harshness === h.k ? "border-orange-500 bg-orange-500/15" : "border-white/10 bg-ink3 hover:border-white/20"}`}
                >
                  <div className={`text-xs font-bold ${s.harshness === h.k ? "text-orange-400" : "text-white"}`}>{h.label}</div>
                  <div className="text-[9px] text-mute mt-0.5">{h.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Triggers */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-mute mb-2">When it fires</div>
            <div className="space-y-2">
              {TRIGGERS.map((t) => {
                const active = s.triggers.includes(t.k);
                return (
                  <button
                    key={t.k}
                    onClick={() => toggleTrigger(t.k)}
                    className="w-full flex items-center justify-between bg-ink3 rounded-2xl px-4 py-2.5 text-left"
                  >
                    <div>
                      <div className="font-semibold text-sm text-white">{t.label}</div>
                      <div className="text-[11px] text-mute">{t.desc}</div>
                    </div>
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${active ? "bg-orange-500 border-orange-500" : "border-white/25"}`}>
                      {active && <span className="text-ink text-xs font-black">✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Numeric config */}
          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Day starts" value={fmtHour(s.wakeHour)} onDec={() => patch({ wakeHour: Math.max(0, s.wakeHour - 1) })} onInc={() => patch({ wakeHour: Math.min(23, s.wakeHour + 1) })} />
            <Stepper label="Daily target" value={`${Math.round(s.quotaMinutes / 60)}h`} onDec={() => patch({ quotaMinutes: Math.max(60, s.quotaMinutes - 30) })} onInc={() => patch({ quotaMinutes: Math.min(720, s.quotaMinutes + 30) })} />
            <Stepper label="Quiet from" value={fmtHour(s.quietStart)} onDec={() => patch({ quietStart: Math.max(0, s.quietStart - 1) })} onInc={() => patch({ quietStart: Math.min(23, s.quietStart + 1) })} />
            <Stepper label="Quiet until" value={fmtHour(s.quietEnd)} onDec={() => patch({ quietEnd: Math.max(0, s.quietEnd - 1) })} onInc={() => patch({ quietEnd: Math.min(23, s.quietEnd + 1) })} />
          </div>

          <div className="flex items-start gap-2 text-[11px] text-mute leading-snug">
            <AlertTriangle size={13} className="shrink-0 mt-0.5 text-mute" />
            No web app can override silent/DND or sound a locked-screen alarm. Brutal here means frequency, stickiness, badge and copy.
          </div>
        </div>
      )}
    </div>
  );
};

const Stepper = ({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) => (
  <div className="bg-ink3 rounded-2xl px-4 py-3">
    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-mute mb-1.5">{label}</div>
    <div className="flex items-center justify-between">
      <button onClick={onDec} className="w-7 h-7 rounded-full text-mute hover:text-white transition-colors">−</button>
      <span className="font-display font-black text-base">{value}</span>
      <button onClick={onInc} className="w-7 h-7 rounded-full bg-orange-500 text-ink font-bold transition-colors">+</button>
    </div>
  </div>
);
