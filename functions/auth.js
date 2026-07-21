const DEFAULT_CMS_ORIGIN = 'https://zhonghai-lu-lab-website.pages.dev';

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
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

function errorResponse(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    return errorResponse('OAuth is not configured.', 503);
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get('provider') !== 'github') {
    return errorResponse('Invalid OAuth provider.');
  }

  const cmsOrigin = env.CMS_SITE_ORIGIN || DEFAULT_CMS_ORIGIN;
  const cmsUrl = new URL(cmsOrigin);
  const siteId = requestUrl.searchParams.get('site_id');
  if (siteId && siteId !== cmsUrl.hostname) {
    return errorResponse('Invalid CMS site.', 403);
  }

  const stateBytes = new Uint8Array(24);
  crypto.getRandomValues(stateBytes);
  const state = hex(stateBytes);
  const stateSignature = await sign(state, env.GITHUB_OAUTH_SECRET);
  const callbackUrl = `${requestUrl.origin}/callback?provider=github`;
  const scope = env.GITHUB_REPO_PRIVATE === '1' ? 'repo,user' : 'public_repo,user';

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', env.GITHUB_OAUTH_ID);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('scope', scope);
  authorizeUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: authorizeUrl.toString(),
      'Set-Cookie': `decap_oauth_state=${state}.${stateSignature}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export function onRequest() {
  return errorResponse('Method not allowed.', 405);
}
