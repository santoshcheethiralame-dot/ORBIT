import React from "react";
import { Button } from "./components";
import { db } from "./db";
import { Trash2, RefreshCw } from "lucide-react";

export const SettingsView = () => {
  const handleResetDay = () => {
    // Clear localStorage check
    localStorage.removeItem('orbit_last_check_date');
    
    // Force reload
    alert('✅ Day reset! Refreshing...');
    window.location.reload();
  };

  return (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2">
        <div className="text-sm text-zinc-500 font-mono uppercase tracking-wider">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">Settings</h1>
      </div>

      <div className="space-y-4 max-w-2xl">
        {/* Current Status */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6">
          <h3 className="text-sm font-bold text-zinc-400 uppercase mb-4">Current Status</h3>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-zinc-500">Stored Date:</span>
              <span className="text-white">{localStorage.getItem('orbit_last_check_date') || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Current IST Time:</span>
              <span className="text-white">
                {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </span>
            </div>
          </div>
        </div>

        {/* Day Reset */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6">
          <h3 className="text-sm font-bold text-zinc-400 uppercase mb-2">Debug Tools</h3>
          <p className="text-xs text-zinc-500 mb-4">Use this to manually trigger a new day</p>
          
          <button
            onClick={handleResetDay}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl font-bold transition-colors bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <RefreshCw size={18} />
            Force New Day Context
          </button>
        </div>

        {/* Factory Reset */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-2xl p-6">
          <h3 className="text-sm font-bold text-red-400 uppercase mb-2">Danger Zone</h3>
          <p className="text-xs text-zinc-500 mb-4">This will delete ALL your data permanently</p>
          
          <button
            onClick={() => { 
              if (confirm("⚠️ Reset Orbit? This will delete ALL data!")) {
                db.delete().then(() => window.location.reload()); 
              }
            }}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl font-bold transition-colors bg-red-900/50 text-red-200 border border-red-800 hover:bg-red-900/70"
          >
            <Trash2 size={18} />
            Factory Reset
          </button>
        </div>
      </div>
    </div>
  );
};