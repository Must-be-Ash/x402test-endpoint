# x402 Endpoint Test Plan — KYC Gate

Testing the deployed endpoint at `https://x402test-endpoint.vercel.app/api/random`
KYC service: `https://kyc-panda.vercel.app/`
Wallet: `0xAbF01df9428EaD5418473A7c91244826A3Af23b3`
Run: `npx tsx --env-file=.env.local test-endpoint.ts`

---

## Test 1: Endpoint returns 402 with payment + KYC extensions
- [ ] `curl` the endpoint with no headers → HTTP 402
- [ ] `PAYMENT-REQUIRED` header contains `sign-in-with-x` extension (SIWX challenge)
- [ ] `PAYMENT-REQUIRED` header contains `kyc-gate` extension (`required: true`, `onboardingUrl`)
- [ ] Payment requirements: $0.02 USDC on Base Sepolia

## Test 2: Payment WITHOUT SIWX is blocked
- [ ] Send payment signature without SIWX header
- [ ] Verify: request is rejected (403) — can't pay without proving KYC

## Test 3: SIWX auth WITHOUT KYC is blocked
- [ ] Sign SIWX challenge and send it (wallet is NOT KYC'd)
- [ ] Verify: request is rejected (403) with KYC_NOT_FOUND and onboarding URL

## Test 4: KYC'd wallet can pay and get results
- [ ] Complete KYC at `https://kyc-panda.vercel.app/`
- [ ] Sign SIWX challenge + send payment
- [ ] Verify: payment accepted, random number returned

## Test 5: Already-paid KYC'd wallet gets free access (no re-KYC, no re-pay)
- [ ] Send SIWX-only request (no payment) with same wallet
- [ ] Verify: access granted for free (SIWX proves identity, server remembers payment)
- [ ] Verify: no KYC re-check needed (already verified)
