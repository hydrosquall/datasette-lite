// basics
self.addEventListener("install", (event) => {
  console.log("Service worker installed");
});
self.addEventListener("activate", (event) => {
  console.log("Service worker activated");
});

// Use reject so that it doesn't take the happy path if the other promise won the race
// https://stackoverflow.com/questions/35991815/stop-promises-execution-once-the-first-promise-resolves
const delay = (numMilliseconds) => {
  return new Promise((resolve, reject) => setTimeout(reject, numMilliseconds));
};

let ACTIVE_RESPONSE_ID = 0;
const RESPONSE_REGISTRY = {}; // TODO: convert to Map()
const TIMEOUT_DURATION = 10000; // milliseconds: how long before it gives up.

self.addEventListener("fetch", (event) => {
  // Send a message to the client.
  const { request } = event;
  // console.debug("Request", event.request);
  const url = new URL(event.request.url);

  const { pathname: pathName } = url;

  const isLocalRequest =
    request.referrer !== request.url &&
    request.referrer &&
    request.url.startsWith(new URL(request.referrer).origin) &&
    // !(url.pathname !== '/')    &&
    !pathName.includes("webworker.js") &&
    !pathName.includes(".astro") &&
    !pathName.startsWith("/src") &&
    !pathName.startsWith("/hoisted.") && // astro framework
    !pathName.startsWith("/node_modules") &&
    !pathName.startsWith("/.yarn") &&
    !pathName.startsWith("/@fs/Users/") &&
    !pathName.startsWith("/@vite") &&
    !pathName.includes("/#/"); // soft exclude HTML pages

  // rule out assets that need to be retrieved remotely.
  if (!isLocalRequest || request.referrer === "") {
    event.respondWith(fetch(event.request));
    return;
  }

  // Otherwise, start waiting for the request or a timeout
  // ----------------------------------------------------
  // console.log("trying to fetch", pathName);
  let localRequestId = ACTIVE_RESPONSE_ID;
  const successResponse = new Promise((resolve) => {
    console.log({ localRequestId }); // storing response
    RESPONSE_REGISTRY[localRequestId] = resolve;
  });

  const failResponse = delay(TIMEOUT_DURATION).then(() => {
    console.log("Either I timed out, or my parent finished", pathName);

    // check if it came back already
    if (RESPONSE_REGISTRY[localRequestId] && typeof RESPONSE_REGISTRY[localRequestId] !== 'function') {
      console.log("I lost the race, it's ok")
      return;
    }

    return new Response(`Timed out after ${TIMEOUT_DURATION}ms`, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  });

  // Set up for next response
  ACTIVE_RESPONSE_ID = ACTIVE_RESPONSE_ID + 1;
  const jointPromise = Promise.race([failResponse, successResponse]);

  // Prepare to respond
  event.respondWith(jointPromise);

  // Make sure not to quit until we can submit our request
  event.waitUntil(
    (async () => {
      // Exit early if we don't have access to the client.
      // Eg, if it's cross-origin.
      if (!event.clientId) return;

      // Get the client.
      const client = await self.clients.get(event.clientId);
      if (!client) return;

      // console.log("localRequest", request.url);
      console.log("tried to postmessage");
      client.postMessage({
        msg: 'Serviceworker requesting data from Webworker',
        url: request.url,
        requestId: localRequestId,
      });
    })()
  );
});

// Fullfill the intercepted fetch request
self.onmessage = (event) => {
  let payload = {};
  try {
    payload = JSON.parse(event.data);
  } catch (error) {
    console.warn("Event data was not JSON serializable", error);
  }

  if (payload?.datasetteAssetUrl) {
    const { requestId: payloadId } = payload;
    const resolver = RESPONSE_REGISTRY[payloadId];
    const response = new Response(payload.datasetteAssetContent, {
      headers: {
        "Content-Type": payload.contentType,
      },
    });

    resolver(response);

    // free  memory in registry
    delete RESPONSE_REGISTRY[payloadId];
  }
};
