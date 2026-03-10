import {
  paymentProxyFromHTTPServer,
  x402ResourceServer,
  x402HTTPResourceServer,
} from "@x402/next";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  declareSIWxExtension,
  siwxResourceServerExtension,
  parseSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
} from "@x402/extensions/sign-in-with-x";

const payTo = "0xF7C645b7600Fb6AaE07Fd0Cf31112A7788BE8F85";
const KYC_VERIFY_ENDPOINT = "https://kyc-panda.vercel.app/api/verify";
const KYC_ONBOARDING_URL = "https://kyc-panda.vercel.app/api/onboard";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(siwxResourceServerExtension);

const routes = {
  "/api/random": {
    accepts: [
      {
        scheme: "exact" as const,
        price: "$0.02",
        network: "eip155:84532" as const,
        payTo,
      },
    ],
    description: "Get a random number 1-9",
    mimeType: "application/json",
    extensions: {
      ...declareSIWxExtension({
        statement: "Sign in to verify KYC status and access random number generator",
        expirationSeconds: 300,
      }),
      "kyc-gate": {
        required: true,
        onboardingUrl: KYC_ONBOARDING_URL,
        provider: "didit",
      },
    },
  },
};

/**
 * KYC Gate hook — only KYC'd wallets can pay.
 *
 * Flow:
 * - No SIWX, no payment      → fall through → 402 with extensions
 * - Payment without SIWX     → ABORT
 * - SIWX invalid              → ABORT
 * - SIWX valid + NOT KYC'd   → ABORT with onboarding URL
 * - SIWX valid + KYC'd       → fall through to payment
 */
function createKYCGateHook(verifyEndpoint: string) {
  return async (context: {
    adapter: { getHeader(name: string): string | undefined; getUrl(): string };
    path: string;
  }) => {
    const siwxHeader = context.adapter.getHeader("sign-in-with-x");
    const hasPayment = !!context.adapter.getHeader("payment-signature");

    // No SIWX, no payment → 402 with extensions (tells client what to do)
    if (!siwxHeader && !hasPayment) {
      return;
    }

    // Trying to pay without SIWX → block
    if (!siwxHeader && hasPayment) {
      return {
        abort: true as const,
        reason: "KYC verification required. Sign in with your wallet first.",
      };
    }

    // SIWX header present — validate it
    try {
      const payload = parseSIWxHeader(siwxHeader!);
      const resourceUri = context.adapter.getUrl();

      const validation = await validateSIWxMessage(payload, resourceUri);
      if (!validation.valid) {
        return {
          abort: true as const,
          reason: `Invalid signature: ${validation.error}`,
        };
      }

      const verification = await verifySIWxSignature(payload);
      if (!verification.valid) {
        return {
          abort: true as const,
          reason: `Signature verification failed: ${verification.error}`,
        };
      }

      const address = verification.address!;

      // Check KYC status
      const kycResponse = await fetch(`${verifyEndpoint}/${address}`);
      const kycData = await kycResponse.json();

      if (!kycData.verified) {
        return {
          abort: true as const,
          reason: JSON.stringify({
            error: kycData.reason || "KYC_NOT_FOUND",
            message: "KYC verification required to access this resource.",
            onboardingUrl: KYC_ONBOARDING_URL,
          }),
        };
      }

      // KYC verified → fall through to payment
      return;
    } catch (err) {
      return {
        abort: true as const,
        reason: `KYC gate error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}

const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(createKYCGateHook(KYC_VERIFY_ENDPOINT));

export const middleware = paymentProxyFromHTTPServer(httpServer);

export const runtime = "nodejs";

export const config = {
  matcher: ["/api/random"],
};
