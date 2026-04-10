import webpush from "web-push"

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidEmail = process.env.VAPID_EMAIL

// Only valid if the public key looks like a URL-safe base64 string (not a placeholder command)
const isValidBase64Url = (s: string) => /^[A-Za-z0-9\-_]+$/.test(s)

export const isPushConfigured = Boolean(
  vapidPublicKey && vapidPrivateKey && vapidEmail &&
  isValidBase64Url(vapidPublicKey) && isValidBase64Url(vapidPrivateKey)
)

export interface PushPayload {
  title: string
  body: string
  url: string
}

export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<void> {
  if (!isPushConfigured || !vapidPublicKey || !vapidPrivateKey || !vapidEmail) {
    throw new Error("Push notifications not configured")
  }
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload)
  )
}
