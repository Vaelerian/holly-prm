interface BadgeProps {
  children: React.ReactNode
  variant?: "default" | "success" | "warning" | "danger" | "info"
}

const variants = {
  default: "bg-[rgba(0,255,136,0.08)] text-[#00ff88] border border-[rgba(0,255,136,0.2)]",
  success: "bg-[rgba(0,255,136,0.12)] text-[#00ff88] border border-[rgba(0,255,136,0.3)]",
  warning: "bg-[rgba(255,200,0,0.1)] text-yellow-300 border border-[rgba(255,200,0,0.25)]",
  danger: "bg-[rgba(255,60,60,0.1)] text-red-400 border border-[rgba(255,60,60,0.25)]",
  info: "bg-[rgba(0,160,255,0.1)] text-blue-300 border border-[rgba(0,160,255,0.25)]",
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
