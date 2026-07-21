// Minimal shapes for the Google Identity Services global, which loads from
// Google's CDN via a <script> tag — there is no npm package, so we
// hand-declare just the surface this app uses.

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
  }): GoogleTokenClient;
  revoke(token: string, done: () => void): void;
}

interface Window {
  google?: {
    accounts: { oauth2: GoogleAccountsOAuth2 };
  };
}
