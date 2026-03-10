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
  createSIWxRequestHook,
  createSIWxSettleHook,
  InMemorySIWxStorage,
  parseSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
} from "@x402/extensions/sign-in-with-x";

const payTo = "0xF7C645b7600Fb6AaE07Fd0Cf31112A7788BE8F85";
const KYC_VERIFY_ENDPOINT = "https://kyc-panda.vercel.app/api/verify";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const storage = new InMemorySIWxStorage();

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(siwxResourceServerExtension)
  .onAfterSettle(createSIWxSettleHook({ storage }));

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
        statement: "Sign in to access random number generator",
        expirationSeconds: 300,
      }),
    },
  },
};

/**
 * KYC Gate hook: checks SIWX signature, then verifies KYC status
 * via the external KYC verification service.
 */
function createKYCGateHook(verifyEndpoint: string) {
  return async (context: {
    adapter: { getHeader(name: string): string | undefined; getUrl(): string };
    path: string;
  }) => {
    const siwxHeader = context.adapter.getHeader("sign-in-with-x");
    if (!siwxHeader) return; // No SIWX header, fall through to payment

    try {
      const payload = parseSIWxHeader(siwxHeader);
      const resourceUri = context.adapter.getUrl();

      const validation = await validateSIWxMessage(payload, resourceUri);
      if (!validation.valid) {
        console.log(`SIWX validation failed: ${validation.error}`);
        return; // Fall through to payment
      }

      const verification = await verifySIWxSignature(payload);
      if (!verification.valid) {
        console.log(`SIWX signature verification failed: ${verification.error}`);
        return; // Fall through to payment
      }

      const address = verification.address!;

      // Check KYC status
      const kycResponse = await fetch(`${verifyEndpoint}/${address}`);
      const kycData = await kycResponse.json();

      if (!kycData.verified) {
        console.log(`KYC check failed for ${address}: ${kycData.reason}`);
        return; // Fall through to payment
      }

      // KYC verified — check if already paid
      const hasPaid = await storage.hasPaid(context.path, address);
      if (hasPaid) {
        console.log(`Access granted via SIWX for ${address} (already paid)`);
        return { grantAccess: true as const };
      }

      // KYC verified but hasn't paid — fall through to payment
      console.log(`KYC verified for ${address}, proceeding to payment`);
      return;
    } catch (err) {
      console.error("KYC gate hook error:", err);
      return; // Fall through to payment on error
    }
  };
}

const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(createKYCGateHook(KYC_VERIFY_ENDPOINT))
  .onProtectedRequest(createSIWxRequestHook({ storage }));

export const middleware = paymentProxyFromHTTPServer(httpServer);

export const runtime = "nodejs";

export const config = {
  matcher: ["/api/random"],
};
