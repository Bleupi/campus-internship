import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import ms from "ms";
import { loginSchema, signupSchema, type AuthUser, type MeResponse } from "shared";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { Env } from "../../config/env.schema";
import { AuthService, type IssuedSession } from "./auth.service";
import type { LoginDto } from "./dto/login.dto";
import type { SignupDto } from "./dto/signup.dto";

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const REFRESH_SESSION_MESSAGE = "Session invalide, merci de vous reconnecter";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post("signup")
  @HttpCode(201)
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.signup(dto);
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(dto);
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.readRefreshCookie(req);
    const session = await this.authService.refresh(rawToken);
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/auth" });
  }

  // No @Public() — protected by the global JwtAuthGuard by default.
  @Get("me")
  me(@Req() req: Request): MeResponse {
    return { user: req.user as AuthUser };
  }

  private readRefreshCookie(req: Request): string {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!rawToken) {
      throw new UnauthorizedException(REFRESH_SESSION_MESSAGE);
    }
    return rawToken;
  }

  private setSessionCookies(res: Response, session: IssuedSession) {
    const isProduction = process.env.NODE_ENV === "production";
    const accessTtl = this.configService.get("JWT_ACCESS_TTL", { infer: true });
    const refreshTtl = this.configService.get("JWT_REFRESH_TTL", { infer: true });

    res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: ms(accessTtl as ms.StringValue),
    });

    // Scoped to /auth so the refresh token is only ever sent to
    // /auth/refresh and /auth/logout, never leaked on every API call.
    res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/auth",
      maxAge: ms(refreshTtl as ms.StringValue),
    });
  }
}
