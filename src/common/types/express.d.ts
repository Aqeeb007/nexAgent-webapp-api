export interface AuthenticatedUser {
  id: string;
}

// Merge into Express.User (declared empty by @types/passport specifically as
// an extension point) instead of re-declaring Request.user directly — a
// second, conflicting Request.user declaration is only caught by tsc when
// skipLibCheck is off, so it silently broke `nest build` (which type-checks
// against a different file set than `tsc --noEmit -p tsconfig.json`) even
// though the plain type-check passed.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration-merging extension point, not meant to add members of its own
    interface User extends AuthenticatedUser {}
  }
}
