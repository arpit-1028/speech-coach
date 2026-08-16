// ────────────────────────────────────────────────────────────────────────────
//  Mascot.jsx — Official Sapphire Crystal Companion Component
//  Visual identity: Cute smiling sapphire crystal + purple headphones + cyan facets
// ────────────────────────────────────────────────────────────────────────────
import React from 'react';

export default function Mascot({ 
  state = 'idle',      // 'idle' | 'waving' | 'listening' | 'celebrating' | 'crowned' | 'happy' | 'mini' | 'thinking'
  size = 120,          // pixel dimensions or string like '100%'
  className = '',
  speechBubble = null, // string message to show in bubble next to mascot
  style = {}
}) {
  const isMini = state === 'mini' || size <= 48;
  const isListening = state === 'listening';
  const isCelebrating = state === 'celebrating';
  const isCrowned = state === 'crowned';
  const isWaving = state === 'waving' || state === 'happy';
  const isThinking = state === 'thinking';

  return (
    <div 
      className={`sapphire-mascot-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        userSelect: 'none',
        ...style
      }}
    >
      {/* Optional Speech Bubble */}
      {speechBubble && (
        <div className="mascot-speech-bubble">
          {speechBubble}
          <div className="mascot-speech-arrow" />
        </div>
      )}

      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`mascot-svg mascot-state-${state} ${isListening ? 'mascot-pulse-anim' : ''} ${isCelebrating ? 'mascot-bounce-anim' : ''}`}
      >
        <defs>
          {/* Crystal Gradient Facets */}
          <linearGradient id="crystalMainGrad" x1="50" y1="20" x2="150" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7DD3FC" />
            <stop offset="45%" stopColor="#38BDF8" />
            <stop offset="85%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E40AF" />
          </linearGradient>

          <linearGradient id="crystalTopFacet" x1="100" y1="30" x2="100" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#BAE6FD" stopOpacity="0.6" />
          </linearGradient>

          <linearGradient id="crystalRightFacet" x1="140" y1="60" x2="170" y2="140" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>

          <linearGradient id="crystalLeftFacet" x1="30" y1="60" x2="60" y2="140" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0369A1" />
          </linearGradient>

          {/* Headphone Gradient */}
          <linearGradient id="headphoneGrad" x1="30" y1="30" x2="170" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>

          <linearGradient id="earpadGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#4C1D95" />
          </linearGradient>

          <linearGradient id="goldCrownGrad" x1="70" y1="0" x2="130" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* Soft Drop Shadow Filter */}
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#38BDF8" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Ambient Sparkles */}
        {!isMini && (
          <g className="mascot-sparkles">
            <path d="M175 45L178 55L188 58L178 61L175 71L172 61L162 58L172 55Z" fill="#FDE047" opacity="0.9" />
            <path d="M25 80L27 86L33 88L27 90L25 96L23 90L17 88L23 86Z" fill="#A78BFA" opacity="0.85" />
            <circle cx="178" cy="115" r="3" fill="#38BDF8" />
            <circle cx="28" cy="45" r="2.5" fill="#38BDF8" />
          </g>
        )}

        {/* Soundwaves if Listening */}
        {isListening && (
          <g className="mascot-soundwaves" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" opacity="0.8">
            <path d="M12 90C8 96 8 104 12 110" />
            <path d="M6 82C0 94 0 106 6 118" strokeWidth="2.5" />
            <path d="M188 90C192 96 192 104 188 110" />
            <path d="M194 82C200 94 200 106 194 118" strokeWidth="2.5" />
          </g>
        )}

        {/* Floating Shadow */}
        <ellipse cx="100" cy="184" rx="42" ry="7" fill="#64748B" opacity="0.18" />

        {/* ── MAIN SAPPHIRE CRYSTAL BODY ────────────────────────────────────── */}
        <g filter="url(#softGlow)">
          {/* Main Octagonal Crystal Silhouette */}
          <polygon
            points="100,28 148,56 168,114 100,172 32,114 52,56"
            fill="url(#crystalMainGrad)"
            stroke="#1E3A8A"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* Top Diamond Facet */}
          <polygon
            points="100,32 142,58 100,90 58,58"
            fill="url(#crystalTopFacet)"
            stroke="#93C5FD"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Left Angle Facet */}
          <polygon
            points="58,58 100,90 100,165 36,112 52,58"
            fill="url(#crystalLeftFacet)"
            opacity="0.35"
          />

          {/* Right Angle Facet */}
          <polygon
            points="142,58 100,90 100,165 164,112 148,58"
            fill="url(#crystalRightFacet)"
            opacity="0.45"
          />

          {/* Crystal Highlight Reflections */}
          <path
            d="M62 68L85 85"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.75"
          />
          <circle cx="72" cy="74" r="1.5" fill="#FFFFFF" />
        </g>

        {/* ── CROWN (if crowned level badge) ────────────────────────────────── */}
        {isCrowned && (
          <g className="mascot-crown">
            <polygon
              points="75,26 82,6 100,18 118,6 125,26"
              fill="url(#goldCrownGrad)"
              stroke="#B45309"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="82" cy="6" r="3" fill="#EF4444" />
            <circle cx="100" cy="18" r="3.5" fill="#3B82F6" />
            <circle cx="118" cy="6" r="3" fill="#10B981" />
          </g>
        )}

        {/* ── HEADPHONES / HEADSET ─────────────────────────────────────────── */}
        {/* Headphone Arch */}
        <path
          d="M40 98C40 50 62 26 100 26C138 26 160 50 160 98"
          stroke="url(#headphoneGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M52 86C52 54 70 34 100 34C130 34 148 54 148 86"
          stroke="#C084FC"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />

        {/* Left Ear Cushion */}
        <g>
          <rect
            x="24"
            y="82"
            width="18"
            height="36"
            rx="9"
            fill="url(#earpadGrad)"
            stroke="#3B0764"
            strokeWidth="2"
          />
          <rect x="28" y="87" width="10" height="26" rx="5" fill="#A855F7" opacity="0.6" />
        </g>

        {/* Right Ear Cushion */}
        <g>
          <rect
            x="158"
            y="82"
            width="18"
            height="36"
            rx="9"
            fill="url(#earpadGrad)"
            stroke="#3B0764"
            strokeWidth="2"
          />
          <rect x="162" y="87" width="10" height="26" rx="5" fill="#A855F7" opacity="0.6" />
        </g>

        {/* Microphone Boom & Tip */}
        <path
          d="M162 108C155 128 135 138 120 138"
          stroke="#1E1B4B"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="118" cy="138" r="5" fill="#38BDF8" stroke="#1E1B4B" strokeWidth="2" />
        <circle cx="117" cy="137" r="1.5" fill="#FFFFFF" />

        {/* ── EXPRESSIVE FACE ──────────────────────────────────────────────── */}
        <g className="mascot-face">
          {/* Cheerful Blush */}
          <ellipse cx="72" cy="118" rx="7" ry="4" fill="#F472B6" opacity="0.5" />
          <ellipse cx="128" cy="118" rx="7" ry="4" fill="#F472B6" opacity="0.5" />

          {/* Left Eye */}
          {isWaving ? (
            /* Winking Left Eye */
            <path
              d="M72 108C75 104 84 104 87 108"
              stroke="#0F172A"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          ) : isCelebrating ? (
            /* Joyful ^ Eye */
            <path
              d="M71 110L79 103L87 110"
              stroke="#0F172A"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : (
            /* Big Bright Shiny Eye */
            <g>
              <ellipse cx="78" cy="106" rx="8" ry="10" fill="#0F172A" />
              <circle cx="76" cy="103" r="3.5" fill="#FFFFFF" />
              <circle cx="81" cy="110" r="1.5" fill="#FFFFFF" />
            </g>
          )}

          {/* Right Eye */}
          {isCelebrating ? (
            /* Joyful ^ Eye */
            <path
              d="M113 110L121 103L129 110"
              stroke="#0F172A"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : (
            /* Big Bright Shiny Eye */
            <g>
              <ellipse cx="122" cy="106" rx="8" ry="10" fill="#0F172A" />
              <circle cx="120" cy="103" r="3.5" fill="#FFFFFF" />
              <circle cx="125" cy="110" r="1.5" fill="#FFFFFF" />
            </g>
          )}

          {/* Smile / Mouth */}
          {isCelebrating || isWaving ? (
            /* Big Happy Open Smile with pink tongue */
            <g>
              <path
                d="M88 116C88 116 93 130 100 130C107 130 112 116 112 116Z"
                fill="#DC2626"
                stroke="#0F172A"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="M93 124C96 120 104 120 107 124C104 128 96 128 93 124Z"
                fill="#FB7185"
              />
            </g>
          ) : isThinking ? (
            /* Cute Small O Mouth */
            <circle cx="100" cy="120" r="4.5" fill="#0F172A" />
          ) : (
            /* Gentle Friendly Smile */
            <path
              d="M91 117C94 123 106 123 109 117"
              stroke="#0F172A"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </g>

        {/* ── HANDS / GESTURES ─────────────────────────────────────────────── */}
        {isCelebrating && (
          /* Both Hands Up Celebrating */
          <g className="mascot-arms">
            {/* Left Arm Up */}
            <path
              d="M48 110C35 95 30 75 36 68C42 62 52 75 58 92"
              fill="#38BDF8"
              stroke="#1E3A8A"
              strokeWidth="2.5"
            />
            {/* Right Arm Up */}
            <path
              d="M152 110C165 95 170 75 164 68C158 62 148 75 142 92"
              fill="#38BDF8"
              stroke="#1E3A8A"
              strokeWidth="2.5"
            />
          </g>
        )}

        {isWaving && (
          /* Right Hand Waving */
          <g className="mascot-waving-hand">
            <path
              d="M150 115C168 110 182 96 182 86C182 78 172 82 165 92C160 98 152 108 150 115Z"
              fill="#38BDF8"
              stroke="#1E3A8A"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <circle cx="180" cy="84" r="3" fill="#60A5FA" />
          </g>
        )}

        {/* Tiny Cute Shoes/Feet */}
        {!isMini && (
          <g className="mascot-feet">
            <ellipse cx="84" cy="174" rx="14" ry="7" fill="#4F46E5" stroke="#1E1B4B" strokeWidth="2" />
            <ellipse cx="116" cy="174" rx="14" ry="7" fill="#4F46E5" stroke="#1E1B4B" strokeWidth="2" />
            <path d="M78 174L86 174" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
            <path d="M110 174L118 174" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
}
