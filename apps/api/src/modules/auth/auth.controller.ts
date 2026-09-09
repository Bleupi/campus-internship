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
import type { CookieOptions, Request, Response } from "express";
import ms from "ms";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type AuthUser,
  type ForgotPasswordResponse,
  type MeResponse,
  type ResetPasswordResponse,
} from "shared";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { Env } from "../../config/env.schema";
import { AuthService, type IssuedSession } from "./auth.service";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { LoginDto } from "./dto/login.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { SignupDto } from "./dto/signup.dto";

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const REFRESH_SESSION_MESSAGE = "Session invalide, merci de vous reconnecter";
// BR-13: identical regardless of whether the email matched an account
// (anti-enumeration) — the controller never branches on that outcome.
const FORGOT_PASSWORD_MESSAGE =
  "Si un compte existe avec cette adresse email, un email de réinitialisation vient d'être envoyé.";
const RESET_PASSWORD_SUCCESS_MESSAGE =
  "Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.";

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
    return { user: session.user, profileStatus: session.profileStatus };
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

  // 204: no response body, matching apiClient's empty-body handling on the
  // frontend (apps/web/src/lib/api-client.ts) — a 200 with no JSON body
  // makes response.json() throw there.
  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/auth" });
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponse> {
    await this.authService.forgotPassword(dto.email);
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @Public()
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponse> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: RESET_PASSWORD_SUCCESS_MESSAGE };
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
    const accessTtl = this.configService.get("JWT_ACCESS_TTL", { infer: true });
    const refreshTtl = this.configService.get("JWT_REFRESH_TTL", { infer: true });

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      session.accessToken,
      this.cookieOptions("/", ms(accessTtl as ms.StringValue)),
    );

    // Scoped to /auth so the refresh token is only ever sent to
    // /auth/refresh and /auth/logout, never leaked on every API call.
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      session.refreshToken,
      this.cookieOptions("/auth", ms(refreshTtl as ms.StringValue)),
    );
  }

  private cookieOptions(path: string, maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path,
      maxAge,
    };
  }
}
