import { paymentProxy, x402ResourceServer } from "@x402/next";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const payTo = "0xF7C645b7600Fb6AaE07Fd0Cf31112A7788BE8F85";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme());

export const middleware = paymentProxy(
  {
    "/api/random": {
      accepts: [
        {
          scheme: "exact",
          price: "$0.02",
          network: "eip155:84532",
          payTo,
        },
      ],
      description: "Get a random number 1-9",
      mimeType: "application/json",
    },
  },
  server,
);

export const config = {
  matcher: ["/api/random"],
};
