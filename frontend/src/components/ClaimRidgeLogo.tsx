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

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      
      {showText && (
        <span 
          className="text-2xl font-extrabold font-display flex items-center"
        >
          <span style={{ color: variant === "dark" ? "white" : "black" }}>Claim</span>
          <span className="text-[#16a34a]">Ridge</span>
        </span>
      )}
    </div>
  );
}
