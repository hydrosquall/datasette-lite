// basics
self.addEventListener("install", (event) => {
  console.log("Service worker installed");
});
self.addEventListener("activate", (event) => {
  console.log("Service worker activated");
});

const cacheFirst = async (event) => {
  const { request } = event;

  // it's a hack but we can make a cache on this thread
  // or do we need to use the global cache to be mutable?
  const fullUrlToPath = (fullUrl) => {
    const x = new URL(fullUrl);
    const path = x.href.split(x.origin)[1];
    return path;
  };
  const path = fullUrlToPath(request.url);
  console.log("lookupPath", path);
  const maybeCached = await caches.match(path);

  if (maybeCached) {
    console.log(maybeCached);
    return maybeCached;
  }

  event.waitUntil(
    (async () => {
      // Exit early if we don't have access to the client.
      // Eg, if it's cross-origin.
      if (!event.clientId) return;

      // Get the client.
      const client = await self.clients.get(event.clientId);
      // Exit early if we don't get the client.
      // Eg, if it closed.
      if (!client) return;

      console.log("localRequest", request.url);
      // console.log("tried to postmessage");
      await client.postMessage({
        msg: "Please help fetch this",
        url: request.url,
      });
      return fetch(request.url);
    })()
  );
};

self.addEventListener("fetch", (event) => {
  // Send a message to the client.
  const { request } = event;
  // console.debug("Request", event.request);
  const url = new URL(event.request.url);
  const pathName = url.pathname;
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

  // rule out assets too
  if (!isLocalRequest || request.referrer === "") {
    event.respondWith(fetch(event.request));
    return;
  }
  // console.log(event.request.url);

  event.respondWith(cacheFirst(event));
});

// Cache responses from the web-worker for the next time data is requested
self.onmessage = async (event) => {
  const payload = JSON.parse(event.data);
  // console.log(`The client sent message`, payload);
  if (payload?.datasetteAssetUrl) {
    // console.log("storedPath", payload.datasetteAssetUrl);
    const cache = await caches.open("v1");
    // TODO: do we need to store more header types?
    await cache.put(
      payload.datasetteAssetUrl,
      new Response(payload.datasetteAssetContent, {
        headers: {
          "Content-Type": payload.contentType,
        },
      })
    );
  }
};
