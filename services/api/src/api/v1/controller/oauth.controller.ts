import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { apiBase } from "../../../common/api-base";
import { SkipResponseInterceptor } from "../../../common/interceptor/skip-response-interceptor.decorator";
import { requireWebSession } from "../../../common/require-web-session";
import { OAuthError, OAuthService, type AuthorizeParams } from "../../../service/oauth.service";

/**
 * The OAuth side of the MCP server: discovery, client registration,
 * authorize → consent (on the web app) → code → token, and Connected apps.
 * Protocol endpoints answer in plain OAuth JSON, not the BaseResponse
 * envelope, because clients parse them by the RFCs.
 */
@Controller()
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  // RFC 9728: path-suffixed form for the /mcp resource, plus the bare form.
  @Get([".well-known/oauth-protected-resource", ".well-known/oauth-protected-resource/mcp"])
  @SkipResponseInterceptor()
  protectedResource(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    return json(reply, 200, this.oauth.protectedResourceMetadata(apiBase(req.headers)));
  }

  @Get([".well-known/oauth-authorization-server", ".well-known/openid-configuration"])
  @SkipResponseInterceptor()
  authorizationServer(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    return json(reply, 200, this.oauth.authorizationServerMetadata(apiBase(req.headers)));
  }

  /** OpenAI's plugin portal verifies domain ownership with a token served here. */
  @Get(".well-known/openai-apps-challenge")
  @SkipResponseInterceptor()
  openaiChallenge(@Res() reply: FastifyReply) {
    const token = process.env.OPENAI_APPS_CHALLENGE;
    if (!token) return reply.status(404).send("Not found");
    return reply.status(200).header("content-type", "text/plain; charset=utf-8").send(token);
  }

  @Post("oauth/register")
  @SkipResponseInterceptor()
  async register(@Body() body: unknown, @Res() reply: FastifyReply) {
    try {
      return json(reply, 201, await this.oauth.register(isObject(body) ? body : {}));
    } catch (err) {
      return oauthError(reply, err);
    }
  }

  @Get("oauth/authorize")
  @SkipResponseInterceptor()
  async authorize(@Query() query: AuthorizeParams, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const result = await this.oauth.authorize(apiBase(req.headers), query);
    if ("redirect" in result) return reply.redirect(result.redirect, 302);
    return reply
      .status(400)
      .header("content-type", "text/plain; charset=utf-8")
      .send(`Can't connect to Octonote: ${result.show.description}`);
  }

  @Post("oauth/token")
  @HttpCode(200)
  @SkipResponseInterceptor()
  async token(@Body() body: unknown, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    try {
      return json(reply, 200, await this.oauth.token(apiBase(req.headers), isObject(body) ? body : {}));
    } catch (err) {
      return oauthError(reply, err);
    }
  }

  // --- Consent screen (called by the web app with the person's session) ---

  @Get("oauth/requests/:id")
  @UseGuards(SupabaseAuthGuard)
  describe(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    requireWebSession(req, "Connecting an app");
    return this.oauth.describeRequest(id);
  }

  @Post("oauth/requests/:id/approve")
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard)
  approve(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    requireWebSession(req, "Connecting an app");
    return this.oauth.approve(apiBase(req.headers), id, req.user.id);
  }

  @Post("oauth/requests/:id/deny")
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard)
  deny(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    requireWebSession(req, "Connecting an app");
    return this.oauth.deny(apiBase(req.headers), id);
  }

  // --- Settings → Connected apps ------------------------------------------

  @Get("me/connected-apps")
  @UseGuards(SupabaseAuthGuard)
  list(@Req() req: AuthenticatedRequest) {
    return this.oauth.listGrants(req.user.id);
  }

  @Delete("me/connected-apps/:id")
  @UseGuards(SupabaseAuthGuard)
  revoke(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    requireWebSession(req, "Disconnecting an app");
    return this.oauth.revokeGrant(id, req.user.id);
  }
}

function json(reply: FastifyReply, status: number, body: unknown) {
  return reply.status(status).header("cache-control", "no-store").send(body);
}

function oauthError(reply: FastifyReply, err: unknown) {
  if (err instanceof OAuthError) {
    return json(reply, err.status, { error: err.error, error_description: err.description });
  }
  throw err;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
