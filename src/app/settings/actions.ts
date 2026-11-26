"use server";

import { refresh } from "next/cache";
import { newPairing, unpair } from "@/lib/pairing";

/** A new one-time pairing code for the extension. Any earlier pairing stops working. */
export async function createPairingCode() {
  const token = newPairing();
  refresh();
  return token;
}

export async function removePairing() {
  unpair();
  refresh();
}
