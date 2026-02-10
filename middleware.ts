import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Get Authorization header
  const authHeader = request.headers.get('authorization');

  // Expected credentials
  const username = 'admin';
  const password = process.env.DASHBOARD_PASSWORD || 'openclaw';
  const expectedAuth = Buffer.from(`${username}:${password}`).toString('base64');

  // Check if auth header exists and is valid
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="OpenClaw Dashboard"',
        'Content-Type': 'text/plain',
      },
    });
  }

  // Extract and validate credentials
  const providedAuth = authHeader.slice(6); // Remove 'Basic ' prefix
  
  if (providedAuth !== expectedAuth) {
    return new NextResponse('Invalid credentials', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="OpenClaw Dashboard"',
        'Content-Type': 'text/plain',
      },
    });
  }

  // Credentials are valid, allow request through
  return NextResponse.next();
}

// Apply middleware to all routes except static assets and API internals
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
