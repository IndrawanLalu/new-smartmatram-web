"use client";

interface Props {
  loading: boolean;
  success?: boolean;
  icon?: string;
  title?: string;
  subtitle?: string;
  successTitle?: string;
  successSubtitle?: string;
}

export default function LoadingOverlay({
  loading,
  success = false,
  icon = "⏳",
  title = "Memproses...",
  subtitle = "Mohon tunggu sebentar...",
  successTitle = "Berhasil!",
  successSubtitle = "Proses selesai",
}: Props) {
  if (!loading && !success) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-md bg-black/60">
      {loading && (
        <div className="flex flex-col items-center gap-8 px-14 py-12 rounded-3xl bg-[#0d1b2a]/90 border border-[#1e3552] shadow-2xl">
          {/* Spinner berlapis */}
          <div className="relative w-32 h-32">
            <div className="absolute inset-0 rounded-full border-[6px] border-[#1e3552]" />
            <div className="absolute inset-0 rounded-full border-[6px] border-transparent border-t-[#00897B] animate-spin [animation-duration:1000ms]" />
            <div className="absolute inset-3 rounded-full border-[5px] border-transparent border-t-[#5eead4] animate-spin [animation-duration:650ms]" />
            <div className="absolute inset-0 flex items-center justify-center text-4xl">{icon}</div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-[#5eead4] font-bold text-xl tracking-wide">{title}</p>
            <p className="text-[#94a3b8] text-sm animate-pulse">{subtitle}</p>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#00897B] animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        </div>
      )}

      {!loading && success && (
        <div className="flex flex-col items-center gap-6 px-14 py-12 rounded-3xl bg-[#0d1b2a]/90 border border-green-500/40 shadow-2xl animate-in fade-in zoom-in duration-300">
          <div className="w-32 h-32 rounded-full bg-green-500/10 border-2 border-green-500/40 flex items-center justify-center text-6xl">
            ✅
          </div>
          <div className="text-center space-y-2">
            <p className="text-green-400 font-bold text-xl tracking-wide">{successTitle}</p>
            <p className="text-[#94a3b8] text-sm">{successSubtitle}</p>
          </div>
        </div>
      )}
    </div>
  );
}
