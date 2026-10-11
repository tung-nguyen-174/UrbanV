import React from 'react';

interface UrbanVLogoProps {
  variant?: 'primary' | 'secondary' | 'app-icon' | 'mark-only';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
}

/**
 * Vector Mark based on UrbanV Vector Variations in Branding Assets
 * Precision geometric V composed of spatial cadastral grid with up-right growth arrow
 */
export const UrbanVMark: React.FC<{
  size?: number;
  color?: string;
  className?: string;
}> = ({ size = 32, color = 'currentColor', className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Outer V Structure and Arrow */}
      {/* Left arm: from top-left (20, 30) down to apex (50, 88) */}
      {/* Right arm: from apex (50, 88) extending up to arrow tip (86, 18) */}
      <path
        d="M 22 30 L 50 88 L 86 18"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Arrowhead at top-right */}
      <path
        d="M 64 18 L 86 18 L 86 40"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Internal Spatial / Cadastral Grid Lines */}
      {/* Down-right diagonals */}
      <line
        x1="27"
        y1="40"
        x2="49"
        y2="54"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="33"
        y1="52"
        x2="59"
        y2="68"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="39"
        y1="64"
        x2="69"
        y2="42"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Down-left diagonals */}
      <line
        x1="76"
        y1="34"
        x2="50"
        y2="86"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="66"
        y1="50"
        x2="42"
        y2="70"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="56"
        y1="36"
        x2="35"
        y2="56"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * Apple HIG Squircle App Icon based on VietUrban Logo.png
 * Metallic / glass ribbon V with location pin locator sphere
 */
export const UrbanVAppIcon: React.FC<{
  size?: number;
  className?: string;
}> = ({ size = 40, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 rounded-2xl shadow-md ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Apple Canvas Dark Background Gradient */}
        <radialGradient
          id="appleCanvasBg"
          cx="50%"
          cy="25%"
          r="80%"
          fx="50%"
          fy="15%"
        >
          <stop offset="0%" stopColor="#1E2A44" />
          <stop offset="60%" stopColor="#0B101D" />
          <stop offset="100%" stopColor="#050811" />
        </radialGradient>

        {/* Metallic ribbon gradient */}
        <linearGradient id="metalRibbon" x1="20%" y1="20%" x2="80%" y2="85%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#E2E8F0" />
          <stop offset="75%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>

        {/* Inner glass highlight */}
        <linearGradient id="innerGlow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>

        {/* Subtle drop shadow */}
        <filter id="ribbonShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Squircle container background */}
      <rect
        x="2"
        y="2"
        width="116"
        height="116"
        rx="26"
        fill="url(#appleCanvasBg)"
      />
      <rect
        x="2"
        y="2"
        width="116"
        height="116"
        rx="26"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.5"
      />

      {/* Inner highlight ring */}
      <rect
        x="4"
        y="4"
        width="112"
        height="112"
        rx="24"
        fill="none"
        stroke="url(#innerGlow)"
        strokeWidth="1"
      />

      {/* Ribbon Loop V */}
      <g filter="url(#ribbonShadow)">
        {/* Left looping capsule */}
        <path
          d="M 40 32 C 34 32 30 36 30 42 L 48 80 C 53 89 66 89 72 80 L 89 44 C 91 38 87 32 80 32 C 74 32 70 36 68 42 L 56 68 L 44 42 C 42 36 38 32 40 32 Z"
          fill="none"
          stroke="url(#metalRibbon)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Overlapping ribbon loop track */}
        <path
          d="M 38 36 L 56 74 C 59 80 67 80 70 74 L 84 44"
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Location Pin Sphere inside the right loop */}
        <circle
          cx="79"
          cy="42"
          r="4.5"
          fill="url(#metalRibbon)"
        />
        <circle
          cx="78"
          cy="41"
          r="1.8"
          fill="#FFFFFF"
        />
      </g>
    </svg>
  );
};

/**
 * Full Brand Identity Component (Icon + Sora Typography)
 */
export const UrbanVLogo: React.FC<UrbanVLogoProps> = ({
  variant = 'primary',
  size = 'md',
  showSubtitle = true,
  className = '',
}) => {
  const isSm = size === 'sm';
  const isLg = size === 'lg';
  const isXl = size === 'xl';

  const iconPx = isSm ? 28 : isLg ? 42 : isXl ? 52 : 34;

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 select-none ${className}`}>
      {variant === 'app-icon' ? (
        <UrbanVAppIcon size={iconPx} />
      ) : (
        <div className="relative flex items-center justify-center p-1.5 rounded-xl bg-slate-900/90 dark:bg-white/10 text-white border border-white/10 shadow-xs">
          <UrbanVMark
            size={iconPx - 6}
            color={variant === 'secondary' ? '#2DD4BF' : '#FFFFFF'}
          />
        </div>
      )}

      <div className="flex flex-col min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-semibold tracking-tight text-slate-900 dark:text-white font-['Sora',sans-serif] ${
              isSm ? 'text-lg' : isLg ? 'text-2xl' : isXl ? 'text-3xl' : 'text-xl'
            }`}
          >
            Urban<span className="text-teal-600 dark:text-teal-400">V</span>
          </span>
          <span className="text-[11px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
            Hạc Thành
          </span>
        </div>

        {showSubtitle && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-['Sora',sans-serif] truncate leading-tight">
            Tra cứu quy hoạch
          </span>
        )}
      </div>
    </div>
  );
};
