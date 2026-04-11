import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "noreply@example.com"
  try {
    await resend.emails.send({ from, to, subject, html })
  } catch (err) {
    console.error("[email] Failed to send email to", to, err)
  }
}
