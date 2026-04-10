import { InputHTMLAttributes, forwardRef } from "react"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-[#c0c0d0]">{label}</label>}
      <input
        ref={ref}
        className={`block w-full bg-[#111125] border rounded px-3 py-2 text-sm text-[#c0c0d0] placeholder-[#666688] focus:outline-none focus:ring-1 focus:ring-[#00ff88] focus:border-[#00ff88] ${error ? "border-red-500" : "border-[rgba(0,255,136,0.2)]"} ${className}`}
        {...props}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
)
Input.displayName = "Input"
