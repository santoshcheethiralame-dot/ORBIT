import React from "react";

export const GlassCard = ({ children, className = "", onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div onClick={onClick} className={`glass-panel p-4 rounded-2xl border border-white/5 transition-all active:scale-[0.98] ${className}`}>
    {children}
  </div>
);

export const Button = ({ children, onClick, disabled, variant = 'primary', className = "" }: any) => {
  const baseStyle = "w-full p-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-white text-black hover:bg-zinc-200 disabled:opacity-50",
    secondary: "bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50",
    danger: "bg-red-900/50 text-red-200 border border-red-800 hover:bg-red-900/70",
    ghost: "bg-transparent text-zinc-400 hover:text-white"
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}>
      {children}
    </button>
  );
};

export const Slider = ({ value, min, max, onChange, label }: any) => (
  <div className="w-full">
    {label && <div className="text-xs font-bold text-zinc-500 mb-2 uppercase">{label}</div>}
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
    />
  </div>
);

export const Input = (props: any) => (
  <input
    {...props}
    className={`w-full bg-zinc-900 border border-zinc-800 p-4 rounded-xl focus:border-indigo-500 outline-none text-white placeholder-zinc-600 ${props.className || ''}`}
  />
);
