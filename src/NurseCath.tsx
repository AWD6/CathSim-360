type Props = {
  speaking: boolean;
  compact?: boolean;
};

// Minimalist Nurse Nong Four (พยาบาลน้องโฟร์)
// - No dark hair mass behind neck/chin (ไม่มีก้อนดำตรงคอ)
// - Neat hair bun in hairnet on the left side only (เหลือแค่มวยผมใส่เน็ตด้านซ้ายมือ)
// - Slender, well-proportioned torso & waist (ตัวผอมเพรียว ได้สัดส่วน)
// - Balanced, well-proportioned symmetrical arms & sleeves (แขนพอดี สมมาตร ได้สัดส่วน)
// - Single-stripe nurse cap, no eyelashes, natural non-red smile, white collared uniform
export default function NurseCath({ speaking, compact = false }: Props) {
  return (
    <svg
      className={`nurse-cath ${speaking ? 'is-speaking' : ''} ${compact ? 'is-compact' : ''}`}
      viewBox="0 0 320 360"
      role="img"
      aria-label="พยาบาลน้องโฟร์ พยาบาลผู้แนะนำการดูแลสายสวนปัสสาวะ โรงพยาบาลมหาราชนครเชียงใหม่"
    >
      <defs>
        <pattern id="hairnet-grid" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M 0 3 L 3 0 L 6 3 L 3 6 Z" fill="none" stroke="#111827" strokeWidth="0.85" opacity="0.6" />
        </pattern>
      </defs>

      {/* Soft Minimalist Aura */}
      <circle cx="160" cy="185" r="124" fill="#e9f6f3" opacity="0.65" />

      <g className="nurse-body">
        {/* Slender Neck (No dark hair behind neck) */}
        <path
          d="M 149 172 L 149 202 L 171 202 L 171 172 Z"
          fill="#f7dccf"
        />

        {/* Symmetrical, Well-Proportioned Left & Right Arms */}
        {/* Left Arm (Viewer's Left) - Gently poised at waist */}
        <g className="nurse-arm-left">
          <path
            d="M 118 212 C 98 232 95 268 106 308"
            stroke="#d5e3df"
            strokeWidth="31"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 118 212 C 98 232 95 268 106 308"
            stroke="#ffffff"
            strokeWidth="27"
            strokeLinecap="round"
            fill="none"
          />
          {/* Left sleeve cuff */}
          <ellipse cx="107" cy="306" rx="13" ry="6" transform="rotate(-14 107 306)" fill="#f0f9f7" stroke="#cbdcd7" strokeWidth="1.5" />
          {/* Left hand */}
          <circle cx="109" cy="316" r="11.5" fill="#fce8dc" stroke="#f0d0c0" strokeWidth="1" />
        </g>

        {/* Right Arm (Viewer's Right) - Polite welcoming wave, matching thickness */}
        <g className="nurse-wave">
          <path
            d="M 202 212 C 222 228 236 214 246 186"
            stroke="#d5e3df"
            strokeWidth="31"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 202 212 C 222 228 236 214 246 186"
            stroke="#ffffff"
            strokeWidth="27"
            strokeLinecap="round"
            fill="none"
          />
          {/* Right sleeve cuff */}
          <ellipse cx="244" cy="191" rx="13" ry="6" transform="rotate(22 244 191)" fill="#f0f9f7" stroke="#cbdcd7" strokeWidth="1.5" />
          {/* Right hand */}
          <circle cx="249" cy="179" r="11.5" fill="#fce8dc" stroke="#f0d0c0" strokeWidth="1" />
        </g>

        {/* Slender, Tailored White Collared Nurse Uniform Torso */}
        <path
          d="M 116 208
             C 116 200 126 196 138 196
             L 182 196
             C 194 196 204 200 204 208
             L 196 272
             L 202 340
             L 118 340
             L 124 272
             Z"
          fill="#ffffff"
          stroke="#d5e3df"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Tailored Princess Waist Seams for Slender Silhouette */}
        <path d="M 136 226 Q 142 274 136 338" stroke="#e8f0ee" strokeWidth="1.6" fill="none" />
        <path d="M 184 226 Q 178 274 184 338" stroke="#e8f0ee" strokeWidth="1.6" fill="none" />

        {/* Minimalist V-Neck Skin Opening */}
        <polygon points="148,196 172,196 160,220" fill="#f7dccf" />

        {/* Symmetrical Minimalist White Lapel Collar */}
        <polygon
          points="135,196 148,196 160,220 141,226"
          fill="#ffffff"
          stroke="#cbdcd7"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon
          points="185,196 172,196 160,220 179,226"
          fill="#ffffff"
          stroke="#cbdcd7"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Center Seam & Minimalist Buttons */}
        <line x1="160" y1="220" x2="160" y2="340" stroke="#e2ece9" strokeWidth="1.8" />
        <circle cx="160" cy="244" r="2.8" fill="#cbdcd7" />
        <circle cx="160" cy="272" r="2.8" fill="#cbdcd7" />
        <circle cx="160" cy="300" r="2.8" fill="#cbdcd7" />

        {/* Minimalist Name Badge */}
        <rect x="171" y="238" width="22" height="12" rx="3" fill="#f0f9f7" stroke="#99d5c9" strokeWidth="1.4" />
        <line x1="175" y1="244" x2="189" y2="244" stroke="#23685c" strokeWidth="1.8" strokeLinecap="round" />

        <g className="nurse-head">
          {/* Neat Hair Bun in Hairnet on the Left Side ONLY (มวยผมใส่เน็ตด้านซ้ายมือ ไม่มีก้อนดำตรงคอ) */}
          <g className="nurse-hairnet-bun">
            <ellipse cx="113" cy="149" rx="18" ry="15" transform="rotate(-12 113 149)" fill="#2c221e" />
            <ellipse
              cx="113"
              cy="149"
              rx="18"
              ry="15"
              transform="rotate(-12 113 149)"
              fill="url(#hairnet-grid)"
              stroke="#1f2937"
              strokeWidth="1.4"
            />
          </g>

          {/* Upper Hair Crown ONLY (stops at ear level y=136 so nothing ever hangs behind chin or neck) */}
          <path
            d="M 114 134 C 112 90 132 68 160 68 C 188 68 208 90 206 134 Z"
            fill="#2c221e"
          />

          {/* Minimalist Nurse Cap with ONE Single Stripe Near the Top */}
          <g className="nurse-cap">
            <path
              d="M 122 82 L 128 52 C 130 47 136 45 160 45 C 184 45 190 47 192 52 L 198 82 Z"
              fill="#ffffff"
              stroke="#d5e3df"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M 130 54 Q 160 51 190 54"
              stroke="#1f6f61"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Symmetrical Ears */}
          <circle cx="115" cy="138" r="8" fill="#f9e0d2" />
          <circle cx="205" cy="138" r="8" fill="#f9e0d2" />

          {/* Youthful Minimalist Face (clean jawline at y=178) */}
          <rect x="118" y="84" width="84" height="94" rx="42" fill="#fce8dc" />

          {/* Neat Front Hair Parted & Swept Back Behind Ears */}
          <path
            d="M 117 124 C 117 92 136 76 160 76 C 184 76 203 92 203 124 C 194 103 178 92 156 91 C 136 92 124 104 117 124 Z"
            fill="#2c221e"
          />

          {/* Soft Minimalist Eyebrows */}
          <path d="M 134 121 Q 142 117 149 120" stroke="#4a3731" strokeWidth="2.1" strokeLinecap="round" fill="none" />
          <path d="M 171 120 Q 178 117 186 121" stroke="#4a3731" strokeWidth="2.1" strokeLinecap="round" fill="none" />

          {/* Cute Cartoon Eyes - NO Eyelashes */}
          <g className="nurse-eyes">
            <circle cx="142" cy="135" r="6" fill="#231f20" />
            <circle cx="140" cy="132.8" r="2.2" fill="#ffffff" />
            <circle cx="144.2" cy="137.2" r="1" fill="#ffffff" />

            <circle cx="178" cy="135" r="6" fill="#231f20" />
            <circle cx="176" cy="132.8" r="2.2" fill="#ffffff" />
            <circle cx="180.2" cy="137.2" r="1" fill="#ffffff" />
          </g>

          {/* Subtle Light Blush */}
          <ellipse cx="129" cy="147" rx="7.5" ry="4" fill="#f6b8b0" opacity="0.45" />
          <ellipse cx="191" cy="147" rx="7.5" ry="4" fill="#f6b8b0" opacity="0.45" />

          {/* Tiny Minimalist Nose */}
          <path d="M 160 140 L 159 146" stroke="#e2bfb0" strokeWidth="1.9" strokeLinecap="round" />

          {/* Cute Smiling Talking Mouth (ยิ้มแย้ม น่ารัก ขยับชัดเจนแบบเป็นธรรมชาติ ไม่น่ากลัว) */}
          <g className="nurse-mouth">
            {/* Soft smiling mouth opening (D-smile curved top) visible & pulsing while speaking */}
            <path
              className="mouth-open-smile"
              d="M 152.5 157 Q 160 159.5 167.5 157 C 167.5 163.8 152.5 163.8 152.5 157 Z"
              fill="#d98279"
              opacity={speaking ? 1 : 0}
            />
            {/* Cute pastel pink inner tongue highlight inside the smile */}
            <path
              className="mouth-tongue"
              d="M 155.5 160.2 Q 160 158.8 164.5 160.2 C 163.5 162.8 156.5 162.8 155.5 160.2 Z"
              fill="#f4aba4"
              opacity={speaking ? 1 : 0}
            />
            {/* Upper smile line - always curved upward in a sweet friendly smile */}
            <path
              className="mouth-smile-curve"
              d="M 151.5 156.5 Q 160 162 168.5 156.5"
              stroke="#c97d74"
              strokeWidth="2.3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
