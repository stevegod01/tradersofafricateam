import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import {
  RegisterSchema as RegisterZod,
  SignupSchema as SignupZod,
  LoginSchema as LoginZod,
  GoogleAuthSchema as GoogleAuthZod,
  VerifyEmailSchema as VerifyEmailZod,
  UpdateTermsSchema as UpdateTermsZod,
  RefreshTokenSchema as RefreshZod,
  ForgotPasswordSchema as ForgotZod,
  ResetPasswordSchema as ResetZod,
  ChangePasswordSchema as ChangeZod,
  UserSelfStatusUpdateSchema as UserSelfStatusUpdateZod,
} from '../../common/utils/validation.schemas';
import {
  GoogleAuthSchema,
  RegisterSchema,
  SignupSchema,
  VerifyEmailSchema,
  UpdateTermsSchema,
  LoginSchema,
  RefreshTokenSchema,
  LogoutSchema,
  LogoutAllSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ChangePasswordSchema,
  UpdateSelfUserStatusSchema,
} from '../../common/utils/swagger.schemas';
import { requireAuth } from '../../common/middleware/auth.middleware';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(fastify);

  // POST /auth/signup
  fastify.post('/signup', { schema: SignupSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = SignupZod.parse(request.body);
    const result = await authService.signup(body);
    return reply.status(201).send(result);
  });

  // POST /auth/register — compatibility alias for signup
  fastify.post('/register', { schema: RegisterSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = RegisterZod.parse(request.body);
    const result = await authService.register(body);
    return reply.status(201).send(result);
  });

  // POST /auth/verify-email
  fastify.post('/verify-email', { schema: VerifyEmailSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { token, otp } = VerifyEmailZod.parse(request.body);
    const result = await authService.verifyEmail(token, otp);
    return reply.send(result);
  });

  // POST /auth/google
  fastify.post('/google', { schema: GoogleAuthSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = GoogleAuthZod.parse(request.body);
    const result = await authService.googleAuth(body);
    return reply.send(result);
  });

  // PATCH /auth/update-terms/:userId
  fastify.patch('/update-terms/:userId', {
    schema: UpdateTermsSchema,
    preHandler: requireMatchingUserToken,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const { termsOfUse } = UpdateTermsZod.parse(request.body);
    const result = await authService.updateTerms(userId, termsOfUse);
    return reply.send(result);
  });

  // POST /auth/login
  fastify.post('/login', {
    schema: LoginSchema,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = LoginZod.parse(request.body);
    const ip = request.ip || 'unknown';
    const ua = request.headers['user-agent'] || 'unknown';
    const result = await authService.login(body, ip, ua);
    return reply.send(result);
  });

  // POST /auth/refresh
  fastify.post('/refresh', { schema: RefreshTokenSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = RefreshZod.parse(request.body);
    const ip = request.ip || 'unknown';
    const ua = request.headers['user-agent'] || 'unknown';
    const result = await authService.refreshTokens(refreshToken, ip, ua);
    return reply.send(result);
  });

  // POST /auth/logout
  fastify.post('/logout', { schema: LogoutSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = RefreshZod.parse(request.body);
    const result = await authService.logout(refreshToken);
    return reply.send(result);
  });

  // POST /auth/logout-all
  fastify.post('/logout-all', {
    schema: LogoutAllSchema,
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await authService.logoutAll(request.dbUser!.id);
    return reply.send(result);
  });

  // POST /auth/forgot-password
  fastify.post('/forgot-password', {
    schema: ForgotPasswordSchema,
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email } = ForgotZod.parse(request.body);
    const result = await authService.forgotPassword(email);
    return reply.send(result);
  });

  // POST /auth/reset-password
  fastify.post('/reset-password', { schema: ResetPasswordSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ResetZod.parse(request.body);
    const result = await authService.resetPassword(body.otp ?? body.token!, body.password);
    return reply.send(result);
  });

  // PATCH /auth/change-password
  fastify.patch('/change-password', {
    schema: ChangePasswordSchema,
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ChangeZod.parse(request.body);
    const result = await authService.changePassword(
      request.dbUser!.id,
      body.oldPassword ?? body.currentPassword!,
      body.newPassword,
    );
    return reply.send(result);
  });

  // POST /auth/change-password — compatibility alias
  fastify.post('/change-password', {
    schema: ChangePasswordSchema,
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ChangeZod.parse(request.body);
    const result = await authService.changePassword(
      request.dbUser!.id,
      body.oldPassword ?? body.currentPassword!,
      body.newPassword,
    );
    return reply.send(result);
  });

  // PATCH /auth/update-user-status
  fastify.patch('/update-user-status', {
    schema: UpdateSelfUserStatusSchema,
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = UserSelfStatusUpdateZod.parse(request.body);
    const result = await authService.updateOwnStatus(request.dbUser!.id, body);
    return reply.send(result);
  });
}

async function requireMatchingUserToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }

  const { userId } = request.params as { userId: string };
  if (request.user.tokenType === 'admin' || request.user.sub !== userId) {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You can only accept terms for your own account',
    });
  }
}
