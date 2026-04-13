import { Resend } from "resend"

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "noreply@example.com"
  try {
    await getResend().emails.send({ from, to, subject, html })
  } catch (err) {
    console.error("[email] Failed to send email to", to, err)
  }
}
