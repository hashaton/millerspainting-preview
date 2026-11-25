# Contact form: Cloudflare Worker + Email Routing

The estimate form posts to `/api/contact`. `worker/index.js` checks the request and emails it to
the owner's inbox through Cloudflare Email Routing. No third-party form service, no fees, and no
monthly cap (the Workers free plan allows 100,000 requests a day).

On hosts without the Worker (like the GitHub Pages preview), the form falls back to opening the
visitor's email app.

## One-time setup (in the client's Cloudflare account, after the domain is registered)

1. **Email Routing on.** Dashboard > the domain > **Email > Email Routing** > *Get started* /
   *Enable*. Let Cloudflare add the MX and TXT records it asks for.
2. **Verify the inbox.** Email Routing > **Destination addresses** > add
   `millerspaintingllc@gmail.com`. Dennis clicks the verification link Cloudflare emails him.
3. **Set the sender domain.** In `wrangler.toml`, change `FROM_ADDRESS` to
   `website@<his-domain>`. It doesn't need to be a real mailbox.
4. **Deploy.** `npx wrangler deploy`. Then in the Worker's **Settings > Domains & Routes**, add
   the custom domain (e.g. `millerspaintingfl.com` and `www.`).
5. **Test.** Submit the form on the live site and check the inbox (and spam the first time;
   mark it *Not spam*).

Optional: in Email Routing > **Routing rules**, add `info@<his-domain>` to forward to his Gmail,
so he gets a free professional address.

## Local testing

`npx wrangler dev`, then open http://localhost:8787. Wrangler simulates `send_email`
and prints where it saved each outgoing message instead of sending it.
