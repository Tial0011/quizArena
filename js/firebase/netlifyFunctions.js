import { auth } from "./config.js";

export async function callNetlifyFunction(name, payload = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again before continuing.");

  const response = await fetch(`/.netlify/functions/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "The service is temporarily unavailable. Please try again.");
  }
  return data;
}
