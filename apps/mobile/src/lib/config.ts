// The ONLY server setting the app knows (handoff §2: secrets stay server-side).
// Set in apps/mobile/.env: EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:3000
// or https://<project>.vercel.app. Inlined at bundle time by Expo.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
