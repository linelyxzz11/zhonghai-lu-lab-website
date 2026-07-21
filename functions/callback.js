const DEFAULT_CMS_ORIGIN = 'https://zhonghai-lu-lab-website.pages.dev';

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function sign(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const entry of cookies.split(';')) {
    const [key, ...value] = entry.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

function errorResponse(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Set-Cookie': 'decap_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    },
  });
}

function callbackResponse(token, cmsOrigin) {
  const message = `authorization:github:success:${JSON.stringify({ token })}`;
  const targetOrigin = JSON.stringify(cmsOrigin);
  const authorizationMessage = JSON.stringify(message);

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub authorization</title>
</head>
<body>
  <p>Authorizing Decap CMS...</p>
  <script>
    (() => {
      const targetOrigin = ${targetOrigin};
      const receiveMessage = (event) => {
        if (event.origin !== targetOrigin || event.source !== window.opener) return;
        window.opener.postMessage(${authorizationMessage}, targetOrigin);
        window.removeEventListener('message', receiveMessage, false);
      };
      window.addEventListener('message', receiveMessage, false);
      if (window.opener) window.opener.postMessage('authorizing:github', targetOrigin);
    })();
  </script>
</body>
</html>`,
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'",
        'Content-Type': 'text/html; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
        'Set-Cookie': 'decap_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      },
    },
  );
}

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    return errorResponse('OAuth is not configured.', 503);
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get('provider') !== 'github') {
    return errorResponse('Invalid OAuth provider.');
  }

  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const stateCookie = getCookie(request, 'decap_oauth_state');
  if (!code || !state || !stateCookie) {
    return errorResponse('Missing OAuth response data.');
  }

  const separator = stateCookie.indexOf('.');
  if (separator < 1) return errorResponse('Invalid OAuth state.', 403);
  const cookieState = stateCookie.slice(0, separator);
  const cookieSignature = stateCookie.slice(separator + 1);
  const expectedSignature = await sign(cookieState, env.GITHUB_OAUTH_SECRET);
  if (!constantTimeEqual(state, cookieState) || !constantTimeEqual(cookieSignature, expectedSignature)) {
    return errorResponse('Invalid OAuth state.', 403);
  }

  const callbackUrl = `${requestUrl.origin}/callback?provider=github`;
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'zhonghai-lu-lab-decap-oauth',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_ID,
      client_secret: env.GITHUB_OAUTH_SECRET,
      code,
      redirect_uri: callbackUrl,
    }),
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return errorResponse('GitHub token exchange failed.', 502);
  }

  return callbackResponse(tokenPayload.access_token, env.CMS_SITE_ORIGIN || DEFAULT_CMS_ORIGIN);
}

export function onRequest() {
  return errorResponse('Method not allowed.', 405);
}
