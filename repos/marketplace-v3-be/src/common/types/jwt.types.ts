import { Admin } from '../../database/entities/admin.entity';
import { User, UserType } from '../../database/entities/user.entity';


/**
 * Shape of the JWT payload we sign on login.
 * This is what lives INSIDE the token.
 */
export interface JwtPayload {
  sub: string;       // user id or admin id
  email: string;
  role: UserType | string | null;
  isSuperAdmin?: boolean;
  authVersion?: number;
  tokenType?: 'user' | 'admin';
}

/**
 * Augment @fastify/jwt so that request.jwtVerify() resolves to JwtPayload,
 * and the *initial* request.user (before we overwrite it with the full DB
 * user) is also typed as JwtPayload.
 *
 * We keep the full User on request.user after the auth middleware runs.
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;   // what we pass to fastify.jwt.sign()
    user: JwtPayload;      // what request.jwtVerify() sets initially
  }
}

/**
 * Augment FastifyRequest so that after our auth middleware replaces
 * request.user with the full DB entity, TypeScript knows about it.
 */
declare module 'fastify' {
  interface FastifyContextConfig {
    /** Explicitly exempts public Admin authentication routes from the Admin JWT hook. */
    publicAdminAuth?: boolean;
  }

  interface FastifyRequest {
    /**
     * Populated by the auth middleware after jwtVerify().
     * Contains the full User entity fetched from the database.
     */
    dbUser?: User;
    dbAdmin?: Admin;
  }
}
