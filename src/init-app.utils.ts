// Pure (no side effects, idempotent) utility functions.
import escapeHtml from "xss";
import { OtherEvent, WorkerErrorEvent } from "./init-app.types";

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

export function getHtmlFromEvent(eventData: WorkerErrorEvent | OtherEvent) {
  // TODO... check if ts-pattern is necessary in future

  if (eventData.type === "error") {
    return `<div style="padding: 0.5em"><h3>Error</h3><pre>${escapeHtml(
      eventData.error
    )}</pre></div>`;
  } else if (/^text\/html/.exec(eventData.contentType)) {
    return eventData.text;
  } else if (/^application\/json/.exec(eventData.contentType)) {
    return `<pre style="padding: 0.5em">${escapeHtml(
      JSON.stringify(JSON.parse(eventData.text), null, 4)
    )}</pre>`;
  }

  return `<pre style="padding: 0.5em">${escapeHtml(eventData.text)}</pre>`;
}
