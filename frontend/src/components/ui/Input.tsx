"use client";

import { InputHTMLAttributes, forwardRef, ElementType } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ElementType;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, icon: Icon, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-[#374151] mb-1.5">
            {label}
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
            className={`w-full ${Icon ? 'pl-11' : 'px-4'} py-2.5 bg-white border rounded-xl text-[#0a0a0a] placeholder:text-[#9ca3af] focus:outline-none focus:ring-4 focus:ring-[#16a34a]/10 focus:border-[#16a34a] transition-all duration-200 ${
              error ? "border-red-500" : "border-[#e5e7eb]"
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
