// Pure (no side effects, idempotent) utility functions.

export function isExternal(url) {
  let startsWithProtocol = !!/^http:\/\/|https:\/\//.exec(url);
  if (!startsWithProtocol) {
    return false;
  }
  // Is it localhost?
  return new URL(url).host != "localhost";
}

export function isFragmentLink(url) {
  // Is this a #fragment on the current page?
  let u = new URL(url);
  return (
    location.pathname == u.pathname &&
    location.hostname == u.hostname &&
    u.hash &&
    u.hash != location.hash
  );
}

  export const fullUrlToPath = (fullUrl) => {
    const url = new URL(fullUrl);
    const path = url.href.split(url.origin)[1];
    return path;
  };
