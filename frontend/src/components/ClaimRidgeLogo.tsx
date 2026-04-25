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
  // The full logo is 1049x240 (ratio ~4.37)
  const width = showText ? size * (1049 / 240) : size * 0.75;
  const height = size;

  return (
    <div className={`flex items-center ${className}`}>
      {showText ? (
        <img
          src="/full-claim-logo.svg"
          alt="ClaimRidge Logo"
          width={width}
          height={height}
          style={{ 
            height: height, 
            width: 'auto',
            // If the user requested a dark variant but the file has black text, 
            // we can apply a brightness filter to make it white-ish for dark backgrounds.
            filter: variant === "dark" ? "brightness(0) invert(1)" : "none"
          }}
        />
      ) : (
        <div style={{ 
          width: size * 0.75, 
          height: size, 
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center'
        }}>
          <img
            src="/full-claim-logo.svg"
            alt="ClaimRidge Icon"
            style={{ 
              height: size, 
              width: 'auto', 
              maxWidth: 'none',
              filter: variant === "dark" ? "brightness(0) invert(1)" : "none"
            }}
          />
        </div>
      )}
    </div>
  );
}
