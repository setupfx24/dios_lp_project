import { AdminClient } from '@lp/sdk';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const adminApi = new AdminClient({ baseUrl });
