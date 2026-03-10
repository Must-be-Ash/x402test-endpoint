# x402 Endpoint Test Plan

Testing the deployed endpoint at `https://x402test-endpoint.vercel.app/api/random`

---

## Test 1: Endpoint returns 402 with payment requirements
- [ ] `curl` the endpoint with no headers
- [ ] Verify HTTP 402 status
- [ ] Verify `PAYMENT-REQUIRED` header contains correct payment config

## Test 2: Endpoint asks for KYC (via SIWX extension in 402 response)
- [ ] Decode the `PAYMENT-REQUIRED` header
- [ ] Verify `extensions.sign-in-with-x` is present with `supportedChains`, `nonce`, `domain`, etc.

## Test 3: Can I use the endpoint WITHOUT KYC?
- [ ] Make a paid request (sign x402 payment, send `PAYMENT-SIGNATURE` header)
- [ ] Verify: payment goes through and we get the random number back (KYC gate should not block payment-only requests)

## Test 4: After KYC, can I access the endpoint via SIWX (no payment)?
- [ ] Sign a SIWX challenge and send it in the `SIGN-IN-WITH-X` header
- [ ] Verify: if wallet is KYC-verified AND has previously paid, access is granted without payment

## Test 5: SIWX remembers KYC status (no re-KYC needed)
- [ ] Make a second SIWX-authenticated request with the same wallet
- [ ] Verify: access is granted again without needing to re-KYC or re-pay
