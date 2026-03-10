import { privateKeyToAccount } from "viem/accounts";
import { encodeSIWxHeader, createSIWxPayload } from "@x402/extensions/sign-in-with-x";

const ENDPOINT = "https://x402test-endpoint.vercel.app/api/random";
const PRIVATE_KEY = process.env.X402_WALLET_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);

console.log("Wallet:", account.address);

async function main() {
  // Step 1: Get the 402 challenge
  console.log("Step 1: Fetching 402 challenge...");
  const res402 = await fetch(ENDPOINT);
  console.log("402 Status:", res402.status);
  const header = res402.headers.get("payment-required");
  if (!header) {
    console.log("No payment-required header! Headers:");
    res402.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));
    const body = await res402.text();
    console.log("Body:", body);
    return;
  }

  const decoded = JSON.parse(Buffer.from(header, "base64").toString());
  const siwxExt = decoded.extensions["sign-in-with-x"];
  const chain = siwxExt.supportedChains[0];
  const completeInfo = { ...siwxExt.info, chainId: chain.chainId, type: chain.type };

  // Step 2: Sign the SIWX challenge
  console.log("\nStep 2: Signing SIWX challenge...");
  const payload = await createSIWxPayload(completeInfo, account);
  const siwxHeader = encodeSIWxHeader(payload);
  console.log("SIWX header length:", siwxHeader.length);

  // Step 3: Send with SIWX header only (no payment)
  console.log("\nStep 3: Sending SIWX-only request (no payment)...");
  const res = await fetch(ENDPOINT, {
    headers: { "SIGN-IN-WITH-X": siwxHeader },
  });

  console.log("Status:", res.status);
  console.log("Headers:");
  res.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));
  const body = await res.text();
  console.log("Body:", body);
}

main().catch(console.error);
