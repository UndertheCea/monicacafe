// Shared types + GraphQL documents for the auth flow.
import { typed } from "../graphql";

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string;
  role: "BUYER" | "SELLER" | "ADMIN";
  shop: { id: string; slug: string; name: string } | null;
}

/** What /api/auth/* returns to the browser on success. */
export interface SessionPayload {
  accessToken: string;
  /** Access-token expiry, ms since epoch. */
  expiresAt: number;
  user: SessionUser;
}

/** Error body returned by /api/auth/* (mirrors ApiError). */
export interface SessionErrorBody {
  code: string;
  message: string;
  field?: string;
  /** Seconds to wait, on RATE_LIMITED (also sent as the Retry-After header). */
  retryAfter?: number;
}

export const USER_FIELDS = `id email displayName role shop { id slug name }`;

type AuthPayload = { accessToken: string; refreshToken: string; user: SessionUser };

export const LOGIN = typed<{ login: AuthPayload }, { input: { email: string; password: string } }>(/* GraphQL */ `
  mutation Login($input: LoginInput!) {
    login(input: $input) { accessToken refreshToken user { ${USER_FIELDS} } }
  }
`);

export const REGISTER = typed<
  { register: AuthPayload },
  { input: { email: string; password: string; displayName: string } }
>(/* GraphQL */ `
  mutation Register($input: RegisterInput!) {
    register(input: $input) { accessToken refreshToken user { ${USER_FIELDS} } }
  }
`);

export const REFRESH = typed<{ refreshToken: AuthPayload }, { token: string }>(/* GraphQL */ `
  mutation Refresh($token: String!) {
    refreshToken(token: $token) { accessToken refreshToken user { ${USER_FIELDS} } }
  }
`);

/** Ends only the session the refresh token belongs to (no access token needed). */
export const LOGOUT = typed<{ logout: boolean }, { refreshToken: string }>(/* GraphQL */ `
  mutation Logout($refreshToken: String) { logout(refreshToken: $refreshToken) }
`);

/** Ends every session of the signed-in user (needs an access token). */
export const LOGOUT_EVERYWHERE = typed<{ logoutEverywhere: boolean }>(/* GraphQL */ `
  mutation LogoutEverywhere { logoutEverywhere }
`);

export const ME = typed<{ me: SessionUser | null }>(/* GraphQL */ `
  query Me { me { ${USER_FIELDS} } }
`);

export const UPDATE_PROFILE = typed<{ updateProfile: { displayName: string } }, { input: { displayName: string } }>(
  /* GraphQL */ `
    mutation UpdateProfile($input: UpdateProfileInput!) { updateProfile(input: $input) { displayName } }
  `,
);

export const CHANGE_PASSWORD = typed<
  { changePassword: AuthPayload },
  { input: { currentPassword: string; newPassword: string } }
>(/* GraphQL */ `
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input) { accessToken refreshToken user { ${USER_FIELDS} } }
  }
`);
