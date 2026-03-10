# TL;DR — What the Agent Sees

## 1. Agent hits the endpoint

Gets back `402 Payment Required` with a `payment-required` header containing:

- **Payment info** — $0.02 USDC on Base Sepolia (`eip155:84532`)
- **`sign-in-with-x` extension** — SIWX challenge (domain, nonce, 5-min expiry, supported chains)
- **`kyc-gate` extension** — `required: true`, onboarding URL, provider name

The agent now knows: "I need to sign in with my wallet (SIWX), pass KYC, AND pay $0.02 USDC."

## 2. Agent signs SIWX and sends it (no payment yet)

If **not KYC'd** → `403`:
```json
{
  "error": "KYC_NOT_FOUND",
  "message": "KYC verification required to access this resource.",
  "onboardingUrl": "https://kyc-panda.vercel.app/api/onboard"
}
```

If **KYC'd** → `402` (still needs to pay).

## 3. Agent signs SIWX and pays (not KYC'd)

Server validates the SIWX signature, checks KYC → not verified → **403 before the payment is ever processed**. No money taken. The agent gets the onboarding URL to complete KYC.

## 4. Agent completes KYC, signs SIWX, and pays

Server validates SIWX → checks KYC → verified → payment processed → **200** with the data.

## What the `kyc-gate` extension tells agents

```json
{
  "required": true,
  "onboardingUrl": "https://kyc-panda.vercel.app/api/onboard",
  "provider": "didit",
  "onboarding": {
    "method": "POST",
    "contentType": "application/json",
    "body": {
      "siwxHeader": "Base64-encoded SIWX payload. Domain must match the onboarding host."
    },
    "response": {
      "onboardingId": "UUID tracking this session",
      "verificationUrl": "URL where the human completes identity verification"
    },
    "docsUrl": "https://kyc-panda.vercel.app/api/onboard"
  }
}
```

The agent sees exactly what to POST and what it gets back. `GET /api/onboard` also returns full API docs with examples, error codes, and a step-by-step flow.
