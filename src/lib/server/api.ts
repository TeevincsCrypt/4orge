import "server-only";
import { assertSameOrigin, getContext, type RequestContext } from "./context";
import { errorResponse } from "./http";

type Handler<P> = (req: Request, ctx: RequestContext, params: P) => Promise<Response>;

/**
 * Wrap an API route: CSRF origin check → authentication → handler, with all
 * errors converted to the standard `{ error: { code, message } }` envelope.
 */
export function apiRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, routeCtx: { params: Promise<P> }) => {
    try {
      await assertSameOrigin(req);
      const ctx = await getContext();
      const params = routeCtx?.params ? await routeCtx.params : ({} as P);
      return await handler(req, ctx, params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
