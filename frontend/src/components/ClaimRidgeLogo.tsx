interface ClaimRidgeLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  /** "dark" for navy/black backgrounds (white wordmark), "light" for white backgrounds (dark wordmark). Default: light. */
  variant?: "light" | "dark";
}

export default function ClaimRidgeLogo({
  size = 36,
  showText = true,
  className = "",
  variant = "light",
}: ClaimRidgeLogoProps) {
  const height = size;
  const width = size * (44 / 50);
  const wordColor = variant === "dark" ? "#ffffff" : "#0a0a0a";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Shield icon */}
      <svg
        width={width}
        height={height}
        viewBox="0 0 44 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 2H36L42 10V30C42 39 33 46 22 49C11 46 2 39 2 30V10L8 2Z"
          fill="#16a34a"
        />
        <path
          d="M11 6H33L38 12V29C38 37 31 43 22 45.5C13 43 6 37 6 29V12L11 6Z"
          fill="none"
          stroke="#14532d"
          strokeWidth="1.2"
          strokeLinejoin="round"
          opacity="0.5"
        />
        <path
          d="M13 25L19 32L31 17"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Wordmark */}
      {showText && (
        <span
          className="font-serif-display"
          style={{
            color: wordColor,
            fontSize: size * 0.52,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          Claim<span style={{ color: "#16a34a" }}>Ridge</span>
        </span>
      )}
    </div>
  );
}
