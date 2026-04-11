function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function registrationReceivedEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Your Holly PRM registration is pending",
    html: `<p>Hi ${esc(name)},</p><p>Your registration request has been received. Your account is pending approval. You will be notified when access is granted.</p>`,
  }
}

export function accountApprovedEmail(name: string, signInUrl: string): { subject: string; html: string } {
  return {
    subject: "Your Holly PRM account has been approved",
    html: `<p>Hi ${esc(name)},</p><p>Your account has been approved. You can now sign in at <a href="${esc(signInUrl)}">${esc(signInUrl)}</a>.</p>`,
  }
}

export function accountRejectedEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Your Holly PRM registration was not approved",
    html: `<p>Hi ${esc(name)},</p><p>Your registration request was reviewed and was not approved. If you believe this is an error, please contact the administrator.</p>`,
  }
}

export function passwordResetEmail(name: string, resetUrl: string): { subject: string; html: string } {
  return {
    subject: "Reset your Holly PRM password",
    html: `<p>Hi ${esc(name)},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${esc(resetUrl)}">${esc(resetUrl)}</a></p><p>If you did not request a password reset, ignore this email.</p>`,
  }
}
