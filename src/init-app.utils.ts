// Pure functions. Storing here for safety

  export function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
