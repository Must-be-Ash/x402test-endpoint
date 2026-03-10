/**
 * Test script for the x402-protected endpoint with KYC gate.
 * KYC'd wallets must pay every time. No free access.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import {
  encodeSIWxHeader,
  createSIWxPayload,
} from "@x402/extensions/sign-in-with-x";

const ENDPOINT = "https://x402test-endpoint.vercel.app/api/random";
const PRIVATE_KEY = process.env.X402_WALLET_PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error("Missing X402_WALLET_PRIVATE_KEY in .env.local");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const signer = toClientEvmSigner(account, publicClient);

console.log(`Using wallet: ${account.address}\n`);

function decode402(header: string) {
  return JSON.parse(Buffer.from(header, "base64").toString());
}

/** Get a fresh SIWX header by fetching the 402, signing the challenge */
async function getSIWxHeader(): Promise<string | null> {
  const res = await fetch(ENDPOINT);
  const header = res.headers.get("payment-required");
  if (!header) return null;
  const decoded = decode402(header);
  const siwxExt = decoded?.extensions?.["sign-in-with-x"];
  if (!siwxExt?.info || !siwxExt?.supportedChains?.length) return null;
  const chain = siwxExt.supportedChains[0];
  const completeInfo = { ...siwxExt.info, chainId: chain.chainId, type: chain.type };
  const payload = await createSIWxPayload(completeInfo, account);
  return encodeSIWxHeader(payload);
}

// ─── Test 1: 402 with payment + KYC extensions ───
async function test1() {
  console.log("═══ Test 1: 402 with payment + KYC extensions ═══");
  const res = await fetch(ENDPOINT);
  console.log(`Status: ${res.status}`);

  const header = res.headers.get("payment-required");
  if (res.status !== 402 || !header) {
    console.log("FAIL\n");
    return false;
  }

  const decoded = decode402(header);
  const siwx = decoded?.extensions?.["sign-in-with-x"];
  const kycGate = decoded?.extensions?.["kyc-gate"];

  console.log(`sign-in-with-x: ${siwx ? "present" : "MISSING"}`);
  console.log(`kyc-gate: ${kycGate ? JSON.stringify(kycGate) : "MISSING"}`);

  const pass = !!siwx && kycGate?.required === true;
  console.log(pass ? "PASS\n" : "FAIL\n");
  return pass;
}

// ─── Test 2: Payment without SIWX is blocked ───
async function test2() {
  console.log("═══ Test 2: Payment WITHOUT SIWX is blocked ═══");

  const client = new x402Client().register("eip155:84532", new ExactEvmScheme(signer));
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  try {
    const res = await fetchWithPay(ENDPOINT);
    console.log(`Status: ${res.status}`);
    const body = await res.text();
    console.log(`Body: ${body}`);

    if (res.status === 403 || res.status === 402) {
      console.log("PASS: Payment blocked without SIWX\n");
      return true;
    }
    if (res.ok) {
      console.log("FAIL: Payment went through without KYC\n");
      return false;
    }
    return false;
  } catch (err) {
    console.log(`Error (expected): ${err}`);
    console.log("PASS: Payment blocked\n");
    return true;
  }
}

// ─── Test 3: SIWX without KYC is blocked ───
async function test3() {
  console.log("═══ Test 3: SIWX without KYC is blocked ═══");

  const siwxHeaderValue = await getSIWxHeader();
  if (!siwxHeaderValue) {
    console.log("FAIL: Could not get SIWX challenge\n");
    return false;
  }

  const res = await fetch(ENDPOINT, {
    headers: { "SIGN-IN-WITH-X": siwxHeaderValue },
  });
  console.log(`Status: ${res.status}`);
  const body = await res.text();
  console.log(`Body: ${body}`);

  if (res.status === 403) {
    console.log("PASS: Non-KYC'd wallet blocked\n");
    return true;
  }
  console.log(`FAIL: Expected 403, got ${res.status}\n`);
  return false;
}

// ─── Test 4: KYC'd wallet + SIWX + payment = access ───
async function test4() {
  console.log("═══ Test 4: KYC'd wallet can SIWX + pay ═══");

  // Check KYC first
  const kycCheck = await fetch(`https://kyc-panda.vercel.app/api/verify/${account.address}`);
  const kycData = await kycCheck.json();
  console.log(`KYC status: ${JSON.stringify(kycData)}`);

  if (!kycData.verified) {
    console.log("SKIP: Wallet not KYC'd. Complete KYC at https://kyc-panda.vercel.app/ first.\n");
    return false;
  }

  // Get SIWX header
  const siwxHeaderValue = await getSIWxHeader();
  if (!siwxHeaderValue) {
    console.log("FAIL: Could not get SIWX challenge\n");
    return false;
  }

  // Wrap fetch to always include SIWX header
  const fetchWithSIWx = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("SIGN-IN-WITH-X", siwxHeaderValue);
    return fetch(input, { ...init, headers });
  };

  const client = new x402Client().register("eip155:84532", new ExactEvmScheme(signer));
  const fetchWithPay = wrapFetchWithPayment(fetchWithSIWx, client);

  try {
    const res = await fetchWithPay(ENDPOINT);
    console.log(`Status: ${res.status}`);

    if (res.ok) {
      const data = await res.json();
      console.log(`Response: ${JSON.stringify(data)}`);
      console.log("PASS: KYC'd wallet paid and got result\n");
      return true;
    }
    const body = await res.text();
    console.log(`Body: ${body}`);
    console.log("FAIL\n");
    return false;
  } catch (err) {
    console.log(`Error: ${err}`);
    console.log("FAIL\n");
    return false;
  }
}

// ─── Test 5: KYC'd wallet must still pay on next request (no free rides) ───
async function test5() {
  console.log("═══ Test 5: KYC'd wallet must pay again (no free access) ═══");

  const kycCheck = await fetch(`https://kyc-panda.vercel.app/api/verify/${account.address}`);
  const kycData = await kycCheck.json();
  if (!kycData.verified) {
    console.log("SKIP: Wallet not KYC'd.\n");
    return false;
  }

  // Send SIWX-only (no payment) — should get 402
  const siwxHeaderValue = await getSIWxHeader();
  if (!siwxHeaderValue) {
    console.log("FAIL: Could not get SIWX challenge\n");
    return false;
  }

  const res = await fetch(ENDPOINT, {
    headers: { "SIGN-IN-WITH-X": siwxHeaderValue },
  });
  console.log(`Status: ${res.status}`);

  if (res.status === 402) {
    console.log("PASS: KYC'd wallet still needs to pay (no free rides)\n");
    return true;
  }
  if (res.ok) {
    console.log("FAIL: Got free access — should require payment every time\n");
    return false;
  }
  console.log(`Unexpected status ${res.status}\n`);
  return false;
}

// ─── Run ───
async function main() {
  const results: Record<string, boolean> = {};

  results["Test 1: 402 + KYC extensions"] = await test1();
  results["Test 2: Payment blocked without SIWX"] = await test2();
  results["Test 3: SIWX blocked without KYC"] = await test3();
  results["Test 4: KYC'd wallet can pay"] = await test4();
  results["Test 5: Must pay every time"] = await test5();

  console.log("═══ SUMMARY ═══");
  for (const [name, passed] of Object.entries(results)) {
    console.log(`${passed ? "✅" : "❌"} ${name}`);
  }
}

main().catch(console.error);
