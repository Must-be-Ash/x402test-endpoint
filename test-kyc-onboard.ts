import { privateKeyToAccount } from "viem/accounts";
import {
  createSIWxPayload,
  encodeSIWxHeader,
} from "@x402/extensions/sign-in-with-x";
import type { CompleteSIWxInfo } from "@x402/extensions/sign-in-with-x";

const PRIVATE_KEY = process.env.X402_WALLET_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);

console.log("Wallet:", account.address);

async function main() {
  // Build SIWX challenge info for KYC onboarding
  const now = new Date();
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 32);

  const siwxInfo: CompleteSIWxInfo = {
    domain: "kyc-panda.vercel.app",
    uri: "https://kyc-panda.vercel.app/api/onboard",
    version: "1",
    chainId: "eip155:84532",
    type: "eip191",
    nonce,
    issuedAt: now.toISOString(),
    expirationTime: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    statement: "Sign in to start KYC verification",
    resources: ["https://kyc-panda.vercel.app/api/onboard"],
  };

  // Sign with SIWX (chain-agnostic)
  const payload = await createSIWxPayload(siwxInfo, account);
  const siwxHeader = encodeSIWxHeader(payload);

  console.log("\nSIWX payload signed");
  console.log("Header length:", siwxHeader.length);

  // POST to onboard
  console.log("\nPOSTing to onboard API...");
  const res = await fetch("https://kyc-panda.vercel.app/api/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siwxHeader }),
  });

  console.log("Status:", res.status);
  const body = await res.json();
  console.log("Response:", JSON.stringify(body, null, 2));

  if (body.verificationUrl) {
    console.log("\nComplete KYC here:", body.verificationUrl);
  }
}

main().catch(console.error);
