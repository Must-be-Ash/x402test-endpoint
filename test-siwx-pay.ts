import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { encodeSIWxHeader, createSIWxPayload } from "@x402/extensions/sign-in-with-x";

const ENDPOINT = "https://x402test-endpoint.vercel.app/api/random";
const PRIVATE_KEY = process.env.X402_WALLET_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const signer = toClientEvmSigner(account, publicClient);

console.log("Wallet:", account.address);

async function main() {
  // Step 1: Get the 402 challenge
  console.log("Step 1: Fetching 402 challenge...");
  const res402 = await fetch(ENDPOINT);
  console.log("Status:", res402.status);
  const header = res402.headers.get("payment-required");
  if (!header) {
    console.log("No payment-required header!");
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

  // Step 3: Wrap fetch with SIWX header + payment
  console.log("\nStep 3: Sending SIWX + payment request...");
  // wrapFetchWithPayment retries with a Request object (not init.headers),
  // so we need to merge headers from both the Request and init.
  const fetchWithSIWx = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : init?.headers,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    }
    headers.set("SIGN-IN-WITH-X", siwxHeader);
    return fetch(input, { ...init, headers });
  };

  const client = new x402Client().register("eip155:84532", new ExactEvmScheme(signer));
  const fetchWithPay = wrapFetchWithPayment(fetchWithSIWx, client);

  try {
    const res = await fetchWithPay(ENDPOINT);
    console.log("Status:", res.status);
    console.log("Headers:");
    res.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));
    const body = await res.text();
    console.log("Body:", body);

    if (res.status === 403) {
      console.log("\n✅ BLOCKED — KYC gate rejected us before taking payment");
    } else if (res.ok) {
      console.log("\n❌ FAIL — Payment went through without KYC!");
    } else {
      console.log(`\nUnexpected status: ${res.status}`);
    }
  } catch (err) {
    console.log("Error:", err);
    console.log("\n✅ BLOCKED — Request failed (KYC gate likely rejected)");
  }
}

main().catch(console.error);
