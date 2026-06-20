import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/two-factor', '/recovery'];
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always-on hardening headers (admin surface — no public CDN).
  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set(
    'Content-Security-Policy',
    // Next.js injects inline hydration/runtime scripts, so script-src must
    // allow them ('unsafe-inline' + 'unsafe-eval'); without an explicit
    // script-src the strict default-src blocks them and the app never
    // hydrates (stuck on "Loading…"). Production-grade alternative: per-request
    // nonces.
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' " +
      (process.env.NEXT_PUBLIC_API_URL ?? '*') +
      "; frame-ancestors 'none'",
  );

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return res;
  }

  const adminCookie = req.cookies.get('lp_admin_access')?.value;
  if (!adminCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const lastActivity = Number(req.cookies.get('lp_admin_last_activity')?.value ?? '0');
  if (lastActivity > 0 && Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('reason', 'idle');
    const r = NextResponse.redirect(url);
    r.cookies.delete('lp_admin_access');
    return r;
  }

  res.cookies.set('lp_admin_last_activity', String(Date.now()), {
    httpOnly: false,
    sameSite: 'strict',
  });
  return res;
}

export const config = {
  // Exclude Next internals + static icon assets so the auth redirect doesn't
  // intercept them (otherwise /icon.svg 307-redirects to /login).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
