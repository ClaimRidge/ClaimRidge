"use client";

import { InputHTMLAttributes, forwardRef, ElementType } from "react";
import { AlertTriangle } from "lucide-react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ElementType;
  confidence?: number; // NEW: AI Confidence Score
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, icon: Icon, id, confidence, value, ...props }, ref) => {
    
    // Default styling (High Confidence or Manual Entry)
    let confidenceClasses = "bg-white border-[#e5e7eb] focus:ring-[#16a34a]/10 focus:border-[#16a34a]";
    let warningMsg = null;
    let warningColor = "";

    // If AI extracted this field and it's not empty, check confidence
    if (confidence !== undefined && value !== "") {
      if (confidence > 0 && confidence < 50) {
        confidenceClasses = "bg-red-50 border-red-400 focus:ring-red-500/20 focus:border-red-500 text-red-900";
        warningMsg = "Low AI confidence. Please verify.";
        warningColor = "text-red-500";
      } else if (confidence >= 50 && confidence < 80) {
        confidenceClasses = "bg-amber-50 border-amber-400 focus:ring-amber-500/20 focus:border-amber-500 text-amber-900";
        warningMsg = "AI is unsure. Please verify.";
        warningColor = "text-amber-600";
      }
    }

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-[#374151] mb-1.5 flex justify-between items-center">
            <span className="flex items-center gap-2">
              {label}
              {confidence !== undefined && value !== "" && !warningMsg && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]">
                  {confidence}%
                </span>
              )}
            </span>
            {warningMsg && (
              <span className={`text-xs flex items-center gap-1 font-medium ${warningColor}`}>
                <AlertTriangle className="h-3 w-3" /> {warningMsg}
              </span>
            )}
          </label>
        )}
        <div className="relative group">
          {Icon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors group-focus-within:text-[#16a34a]">
              <Icon className="h-4.5 w-4.5 text-[#9ca3af]" />
            </div>
          )}
          <input
            ref={ref}
            id={id}
            value={value}
            className={`w-full ${Icon ? 'pl-11' : 'px-4'} py-2.5 rounded-xl placeholder:text-[#9ca3af] focus:outline-none focus:ring-4 transition-all duration-200 border ${
              error ? "border-red-500 bg-white focus:ring-red-500/10 focus:border-red-500" : confidenceClasses
            } ${className}`}
            {...props}
          />
        </div>
        {error && <p className="mt-1.5 text-sm text-red-500 font-medium">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;