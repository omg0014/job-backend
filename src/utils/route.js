/**
 * POST-only API.
 *
 * Every endpoint in this service is a POST. The action is expressed by the URL
 * path, not the HTTP verb, and every parameter — ids, filters, pagination —
 * travels in the JSON body. There are no route params and no query strings.
 *
 * Route files must register handlers through `post()` rather than calling
 * `router.post` / `router.get` directly, so the rule stays visible and
 * enforceable. `assertPostOnly()` re-checks the assembled router at startup.
 */
export const post = (router, path, ...handlers) => router.post(path, ...handlers);

/**
 * Walks a mounted Express app's router stack and warns loudly about any route
 * registered with a method other than POST. Called once on boot.
 */
/**
 * The one sanctioned non-POST route in this API.
 *
 * `GET /media/:token` serves recorded video and must honour Range requests, so
 * a reviewer can drag the timeline instead of downloading the whole clip.
 * Authorization happens over POST (/api/screening/playback-url), which issues
 * the signed, expiring token this route verifies.
 *
 * Listed as '/:token' rather than '/media/:token' because the walker reports
 * paths as registered inside their own router, without the mount prefix.
 *
 * Nothing else belongs here. Any other non-POST route is still reported.
 */
const ALLOWED_NON_POST = new Set(['GET /:token']);

export const assertPostOnly = (app) => {
  const offenders = [];

  const walk = (stack, prefix = '') => {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
        for (const method of methods) {
          const signature = `${method.toUpperCase()} ${prefix}${layer.route.path}`;
          if (method !== 'post' && !ALLOWED_NON_POST.has(signature)) {
            offenders.push(signature);
          }
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix);
      }
    }
  };

  walk(app._router?.stack ?? []);

  if (offenders.length > 0) {
    console.warn(
      `[routes] POST-only rule violated by ${offenders.length} route(s):\n  ${offenders.join('\n  ')}`,
    );
  } else {
    console.log(
      `[routes] POST-only assertion passed (${ALLOWED_NON_POST.size} documented exception: media streaming)`,
    );
  }

  return offenders;
};
