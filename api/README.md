# Vervox serverless functions

## `POST /api/flutterwave-webhook`

Reconciles a Flutterwave payment against Firestore and updates the tier on
`users/{user_uid}`.

### Configure it in Flutterwave

1. Dashboard → **Settings → Webhooks**.
2. URL: `https://<your-domain>/api/flutterwave-webhook`.
3. Set a **Secret hash** — this value must match the `FLW_SECRET_HASH` env var.

### Environment variables

| Name | Purpose |
|---|---|
| `FLW_SECRET_HASH` | Shared secret used to verify the `verif-hash` header. |
| `FLW_SECRET_KEY` | Server-side Flutterwave API key (`FLWSECK-…`). Never expose to the client. |
| `FIREBASE_PROJECT_ID` | Firebase Admin SDK project id. |
| `FIREBASE_CLIENT_EMAIL` | Service-account email. |
| `FIREBASE_PRIVATE_KEY` | Service-account private key (escape newlines as `\n`). |

### Security layers

1. **Constant-time compare** on `verif-hash` header vs. `FLW_SECRET_HASH`.
2. **Re-verifies** the transaction via
   `GET https://api.flutterwave.com/v3/transactions/{id}/verify` so amounts,
   currencies and statuses cannot be forged even if the shared hash leaks.
3. Only `charge.completed` events with `status === "successful"` mutate
   Firestore, inside a `runTransaction` (idempotent — repeats of the same
   webhook do not stack).

### Deployment

- **Vercel** — drop the file at `api/flutterwave-webhook.js` (this repo already
  places it there). It's picked up automatically by Vercel's Serverless Functions.
- **Netlify Functions** — copy to `netlify/functions/flutterwave-webhook.js` and
  configure the redirect in `netlify.toml`.
- **Cloud Run / Node server** — mount the exported handler on your framework's
  POST route.

### Client contract

The browser passes both identifiers in `FlutterwaveCheckout({ meta })`:

```js
meta: {
  sku: "pro_bundle",
  user_uid: "<firebase-anon-uid>",
  device_id: "<crypto-random-uuid>",
  app: "vervox",
}
```

The webhook writes:

```js
users/{user_uid or device:<device_id>} = {
  purchases: [...],
  tier: "pro" | "unlocked" | "free",
  device_id,
  last_transaction_id,
  last_transaction_ref,
  updated_at: serverTimestamp(),
}
```
