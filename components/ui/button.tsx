import { ButtonHTMLAttributes, forwardRef } from "react"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md"
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0a0a1a] disabled:opacity-40 disabled:cursor-not-allowed"
    const variants = {
      primary: "bg-[#00ff88] text-[#0a0a1a] hover:bg-[#00cc6f] focus:ring-[#00ff88]",
      secondary: "bg-transparent text-[#c0c0d0] border border-[rgba(0,255,136,0.3)] hover:border-[rgba(0,255,136,0.7)] hover:text-[#00ff88] focus:ring-[#00ff88]",
      ghost: "text-[#666688] hover:text-[#c0c0d0] hover:bg-[rgba(0,255,136,0.05)] focus:ring-[#00ff88]",
      danger: "bg-red-700 text-white hover:bg-red-600 focus:ring-red-500",
    }
    const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" }
    return <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  }
)
Button.displayName = "Button"
