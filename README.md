# x402 KYC-Gated Endpoint Example

> **Not maintained.** x402 and the services this uses may have changed since it was built; check the latest x402 docs before relying on it.

A reference implementation showing how to add KYC verification to an x402-protected API endpoint. The endpoint returns a random number (1-9) behind a $0.02 USDC paywall — but only KYC-verified wallets are allowed to pay.

**Live endpoint:** `https://x402test-endpoint.vercel.app/api/random`
**KYC provider:** [kyc-panda.vercel.app](https://kyc-panda.vercel.app)

## How It Works

When an agent hits the endpoint, it gets back a `402 Payment Required` with three pieces of information:

1. **Payment requirements** — $0.02 USDC on Base Sepolia
2. **`sign-in-with-x` extension** — A SIWX (CAIP-122) challenge the agent must sign with its wallet
3. **`kyc-gate` extension** — Tells the agent KYC is required, with an onboarding URL

The agent must: sign the SIWX challenge → pass KYC verification → pay. All three, every time.

### Request Flow

```
Agent → GET /api/random
  ← 402 + payment-required header (SIWX challenge + KYC gate + payment info)

Agent → GET /api/random + SIGN-IN-WITH-X header (signed) + PAYMENT-SIGNATURE header
  → Middleware validates SIWX signature
  → Middleware checks KYC status via kyc-panda.vercel.app/api/verify/{address}
  → If not KYC'd: 403 with onboarding URL (payment is never processed)
  → If KYC'd: payment is verified via x402 facilitator
  ← 200 { "number": 7 }
```

### What Gets Blocked

| Scenario | Result |
|----------|--------|
| No headers | 402 — returns SIWX challenge + KYC gate info |
| Payment only (no SIWX) | 403 — "Sign in with your wallet first" |
| SIWX only, wallet not KYC'd | 403 — KYC_NOT_FOUND + onboarding URL |
| SIWX only, wallet is KYC'd | 402 — still needs to pay |
| SIWX + payment, not KYC'd | 403 — blocked before payment is processed |
| SIWX + payment, KYC'd | 200 — access granted |

## Project Structure

```
x402test/
├── middleware.ts                 # x402 payment proxy + KYC gate hook
├── app/api/random/route.ts      # Protected endpoint (random number 1-9)
├── test-endpoint.ts             # Full test suite (6 tests)
├── test-siwx-only.ts            # Quick test: SIWX without payment
├── test-siwx-pay.ts             # Quick test: SIWX + payment
├── test-kyc-onboard.ts          # Quick test: KYC onboarding flow
└── .env.local                   # Your wallet keys (not committed)
```

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure

Create `.env.local`:

```
X402_WALLET_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

### 3. Deploy

```bash
vercel deploy --prod
```

No server-side environment variables needed — the x402 facilitator (`x402.org/facilitator`) and KYC service (`kyc-panda.vercel.app`) are public testnet services.

## The Middleware

`middleware.ts` is where everything happens. It combines three things:

**1. x402 payment proxy** — handles 402 responses and payment verification via the facilitator.

**2. SIWX extension** — adds a Sign-In-With-X challenge to every 402 response so agents can prove wallet ownership.

**3. KYC gate hook** — runs before payment is processed. Validates the SIWX signature, then checks the wallet's KYC status. Non-KYC'd wallets are blocked with a 403 and an onboarding URL.

```typescript
// The hook logic:
// No SIWX, no payment     → fall through → 402 with extensions
// Payment without SIWX    → 403 (can't pay without proving identity)
// SIWX invalid             → 403
// SIWX valid + NOT KYC'd  → 403 with onboarding URL
// SIWX valid + KYC'd      → fall through to payment verification
```

The key insight: the hook returns before payment is ever processed. A non-KYC'd wallet's money is never touched.

## Testing

Run the full test suite against your deployed endpoint:

```bash
npx tsx --env-file=.env.local test-endpoint.ts
```

### Test Coverage

| Test | What it verifies |
|------|-----------------|
| **1: 402 + extensions** | Endpoint returns SIWX challenge and kyc-gate extension |
| **2: Payment without SIWX** | Payment alone is rejected — must prove identity first |
| **3: SIWX-only (KYC'd wallet)** | KYC'd wallet still needs to pay every time |
| **3b: SIWX (non-KYC'd wallet)** | Fresh wallet is blocked with KYC_NOT_FOUND + onboarding URL |
| **4: SIWX + payment (KYC'd)** | Full flow works — KYC verification passes, payment accepted, data returned |
| **5: Must pay again** | No free rides — every request requires payment |

### Individual Test Scripts

```bash
# Test SIWX signature without payment
npx tsx --env-file=.env.local test-siwx-only.ts

# Test SIWX + payment (full flow)
npx tsx --env-file=.env.local test-siwx-pay.ts

# Test KYC onboarding (creates a Didit verification session)
npx tsx --env-file=.env.local test-kyc-onboard.ts
```

### Testing Your Own KYC-Gated Endpoint

To adapt these tests for your endpoint:

1. Change `ENDPOINT` in the test files to your URL
2. Set your wallet's private key in `.env.local`
3. Run `test-endpoint.ts` — tests 1, 2, and 3b should pass immediately (no KYC needed)
4. Complete KYC at the onboarding URL from the 403 response
5. Run again — all tests should pass

## Stack

| Component | Value |
|-----------|-------|
| Runtime | Next.js (App Router) on Vercel |
| Network | Base Sepolia (`eip155:84532`) |
| Payment | $0.02 USDC via x402 protocol v2 |
| Auth | SIWX (CAIP-122) — chain-agnostic wallet auth |
| KYC | [kyc-panda.vercel.app](https://kyc-panda.vercel.app) (Didit provider) |
| Facilitator | `x402.org/facilitator` (testnet, no API key) |
| Packages | `@x402/next`, `@x402/evm`, `@x402/core`, `@x402/extensions` |
