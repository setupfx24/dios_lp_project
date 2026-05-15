# @lp/sdk

Typed fetch client for the LP API. Used by `apps/web` and `apps/admin`; safe
to use from React Server Components (pass `fetch` from `next/cache` if you
need revalidation control).

```ts
import { LpClient } from '@lp/sdk';

const client = new LpClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL! });
const trades = await client.listTrades({ symbol: 'RELIANCE', limit: 100 });
```

Both request inputs and response shapes are runtime-validated by Zod (the
same schemas the API uses), so TypeScript types are guaranteed to match
what actually goes over the wire.
