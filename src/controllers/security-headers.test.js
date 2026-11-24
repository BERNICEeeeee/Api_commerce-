jest.mock('../db.js', () => ({}));

const app = require('../app.js');

describe('security headers', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('sets a restrictive policy and JSON content type for API responses', async () => {
    const response = await fetch(`${baseUrl}/openapi.json`);

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toBe(
      'camera=(), geolocation=(), microphone=()'
    );
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('keeps Swagger scripts and styles same-origin and disallows framing', async () => {
    const response = await fetch(`${baseUrl}/docs/`);
    const policy = response.headers.get('content-security-policy');
    const body = await response.text();
    const initResponse = await fetch(`${baseUrl}/docs/swagger-ui-init.js`);
    const initScript = await initResponse.text();
    const csrfTestPage = await fetch(`${baseUrl}/docs/csrf-test`, { redirect: 'manual' });

    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toBe(
      'camera=(), geolocation=(), microphone=()'
    );
    expect(body).toContain('swagger-ui-init.js');
    expect(initResponse.status).toBe(200);
    expect(initScript).toContain('requestInterceptor');
    expect(initScript).toContain("get('csrf') === 'manual'");
    expect(initScript).toContain('/auth/csrf');
    expect(initScript).toContain('X-CSRF-Token');
    expect(initScript).toContain("delete request.headers['X-CSRF-Token']");
    expect(csrfTestPage.status).toBe(302);
    expect(csrfTestPage.headers.get('location')).toBe('/docs/?csrf=manual');
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
