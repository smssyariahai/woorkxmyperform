import React from 'react';

interface AyahOrnamentProps {
  number: number;
  className?: string;
  size?: number;
  color?: string;
}

export function toArabicNumeral(num: number): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num
    .toString()
    .split('')
    .map((d) => arabicDigits[parseInt(d, 10)] ?? d)
    .join('');
}

/**
 * Authentic Mushaf Ornamental Ayah End Marker
 * Inspired by the classical Quranic medallion enclosing Eastern Arabic numerals
 * (as seen in the reference mushaf photo)
 */
export const AyahOrnament: React.FC<AyahOrnamentProps> = ({
  number,
  className = '',
  size = 32,
  color = '#966035', // Bronze/Gold tone matching the user's reference image
}) => {
  const arabicNum = toArabicNumeral(number);
  const numLength = arabicNum.length;

  // Scale font size based on number of digits (1, 2, or 3 digits)
  const fontSize = numLength === 1 ? '13' : numLength === 2 ? '11.5' : '9.5';

  return (
    <span
      className={`inline-flex items-center justify-center align-middle select-none mx-1.5 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        verticalAlign: 'middle',
        lineHeight: 1,
      }}
      title={`Ayat ${number}`}
    >
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        className="overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer decorative arabesque curves - Top Flourish */}
        <path
          d="M16 6.5 C16 4 20 2 20 2 C20 2 24 4 24 6.5 C24 8 22 9.5 20 10 C18 9.5 16 8 16 6.5 Z"
          stroke={color}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Bottom Flourish */}
        <path
          d="M16 33.5 C16 36 20 38 20 38 C20 38 24 36 24 33.5 C24 32 22 30.5 20 30 C18 30.5 16 32 16 33.5 Z"
          stroke={color}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Left Flourish */}
        <path
          d="M6.5 16 C4 16 2 20 2 20 C2 20 4 24 6.5 24 C8 24 9.5 22 10 20 C9.5 18 8 16 6.5 16 Z"
          stroke={color}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Right Flourish */}
        <path
          d="M33.5 16 C36 16 38 20 38 20 C38 20 36 24 33.5 24 C32 24 30.5 22 30 20 C30.5 18 32 16 33.5 16 Z"
          stroke={color}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* Decorative corner loops */}
        <path
          d="M10 10 C12 7 15 8 16 9"
          stroke={color}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <path
          d="M30 10 C28 7 25 8 24 9"
          stroke={color}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <path
          d="M10 30 C12 33 15 32 16 31"
          stroke={color}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <path
          d="M30 30 C28 33 25 32 24 31"
          stroke={color}
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Outer Circular Ring */}
        <circle
          cx="20"
          cy="20"
          r="14"
          stroke={color}
          strokeWidth="1.3"
        />

        {/* Inner Delicate Ring */}
        <circle
          cx="20"
          cy="20"
          r="11.5"
          stroke={color}
          strokeWidth="0.75"
          strokeDasharray="2 1.2"
          opacity="0.85"
        />

        {/* Eastern Arabic Number in Center */}
        <text
          x="20"
          y="24.5"
          textAnchor="middle"
          fontSize={fontSize}
          fontFamily="'Amiri Quran', 'Amiri', 'Noto Naskh Arabic', serif"
          fontWeight="bold"
          fill={color}
          className="select-none"
        >
          {arabicNum}
        </text>
      </svg>
    </span>
  );
};
