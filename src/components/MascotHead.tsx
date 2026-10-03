import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface MascotHeadProps {
  status: 'idle' | 'connecting' | 'success' | 'error';
  size?: number;
  message?: string;
}

export const MascotHead: React.FC<MascotHeadProps> = ({
  status,
  size = 140,
  message,
}) => {
  const isSuccess = status === 'success';
  const isConnecting = status === 'connecting';
  const isError = status === 'error';

  // Dynamic colors based on status
  const headFill = isSuccess
    ? '#4ade80' // Bright Vibrant Green
    : isError
    ? '#fda4af' // Rose tint on error
    : isConnecting
    ? '#fef08a' // Warm Yellow while handshaking
    : '#fbcfe8'; // Classic J-Grid Pink

  const glowFill = isSuccess
    ? '#bbf7d0' // Green aura
    : isError
    ? '#ffe4e6'
    : isConnecting
    ? '#fef9c3'
    : '#fdf0f4';

  const strokeColor = isSuccess
    ? '#064e3b' // Deep Emerald
    : isError
    ? '#881337'
    : '#0f172a'; // Deep Slate

  return (
    <div className="flex flex-col items-center justify-center py-2 select-none">
      {/* Animated Aura Container */}
      <div className="relative flex items-center justify-center">
        {/* Glowing radar ring on success or connecting */}
        {isSuccess && (
          <div
            className="absolute rounded-full bg-emerald-400/30 animate-ping pointer-events-none"
            style={{ width: size * 1.3, height: size * 1.3 }}
          />
        )}
        {isConnecting && (
          <div
            className="absolute rounded-full border-2 border-amber-400 border-dashed animate-spin pointer-events-none"
            style={{ width: size * 1.25, height: size * 1.25 }}
          />
        )}

        {/* Mascot SVG */}
        <div
          className={`transition-all duration-500 ease-out transform ${
            isSuccess ? 'scale-110 drop-shadow-[0_12px_24px_rgba(74,222,128,0.45)]' : 'scale-100'
          }`}
          style={{ width: size, height: size }}
        >
          <svg viewBox="0 0 512 512" fill="none" className="w-full h-full">
            {/* Subtle soft glow backdrop */}
            <circle cx="256" cy="275" r="195" fill={glowFill} />

            {/* Mascot circular head */}
            <circle
              cx="256"
              cy="275"
              r="170"
              fill={headFill}
              stroke={strokeColor}
              strokeWidth="14"
              className="transition-colors duration-500"
            />

            {/* Mascot Curly J Hair Swoop */}
            <path
              d="M 215 130 C 215 65 260 30 295 15 C 312 8 326 35 292 56 C 260 76 244 100 244 135"
              stroke={strokeColor}
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
              className="transition-colors duration-500"
            />

            {/* Eyes */}
            {isSuccess ? (
              // Joyful curved squinting eyes
              <>
                <path
                  d="M 190 252 Q 205 235 220 252"
                  stroke={strokeColor}
                  strokeWidth="12"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 292 252 Q 307 235 322 252"
                  stroke={strokeColor}
                  strokeWidth="12"
                  strokeLinecap="round"
                  fill="none"
                />
              </>
            ) : (
              // Classic wide eyes
              <>
                <circle cx="205" cy="250" r="13" fill={strokeColor} />
                <circle cx="307" cy="250" r="13" fill={strokeColor} />
                {/* Cute eye light reflection */}
                <circle cx="209" cy="246" r="4" fill="#ffffff" />
                <circle cx="311" cy="246" r="4" fill="#ffffff" />
              </>
            )}

            {/* Subtle Blush Cheeks */}
            <circle
              cx="175"
              cy="285"
              r="20"
              fill={isSuccess ? '#22c55e' : '#f472b6'}
              fillOpacity={isSuccess ? '0.4' : '0.4'}
            />
            <circle
              cx="337"
              cy="285"
              r="20"
              fill={isSuccess ? '#22c55e' : '#f472b6'}
              fillOpacity={isSuccess ? '0.4' : '0.4'}
            />

            {/* Cute Nose */}
            <path
              d="M 252 268 V 286 H 262"
              stroke={strokeColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Smile: Big Happy Open Mouth on Success, Sweet Smile on Normal */}
            {isSuccess ? (
              <path
                d="M 188 308 Q 256 390 324 308 Z"
                fill={strokeColor}
                stroke={strokeColor}
                strokeWidth="10"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d="M 198 316 Q 256 372 314 316"
                stroke={strokeColor}
                strokeWidth="12"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </svg>
        </div>

        {/* Success floating badge */}
        {isSuccess && (
          <div className="absolute -bottom-2 right-1/2 translate-x-1/2 bg-emerald-600 text-white p-1.5 rounded-full shadow-lg border-2 border-white flex items-center justify-center animate-bounce">
            <CheckCircle2 className="w-5 h-5 stroke-[3]" />
          </div>
        )}
      </div>

      {/* Status Label & Message */}
      <div className="mt-3 text-center">
        {isSuccess ? (
          <div className="space-y-0.5">
            <div className="text-sm font-black text-emerald-600 tracking-tight flex items-center justify-center gap-1.5">
              <span>Deriv Account Connected</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Account connection is active
            </p>
          </div>
        ) : isConnecting ? (
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-amber-600 flex items-center justify-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{message || 'Connecting to Deriv Liquidity Pool...'}</span>
            </div>
            <p className="text-[10px] text-slate-400">Verifying API permissions</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="text-xs font-extrabold text-slate-800 tracking-tight">
              J-Grid Intelligent Assistant
            </div>
            <p className="text-[11px] text-slate-400">
              Ready to deploy automated buy & sell ladders
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
