import { ForwardAssetEvent } from "./init-app.types";
// Entrypoint to Datasette-Lite Main
import {
  isExternal,
  isFragmentLink,
  fullUrlToPath,
  getHtmlFromEvent,
  rewriteGithubUrlWithCorsHeaders
} from "./init-app.utils";

import { FromWebWorkerEvent } from "./init-app.types";

// Global entrypoint
export async function initApp() {
  // Setup Serviceworker
  const registerServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register(
          "/serviceworker.js",
          {
            scope: "/",
          }
        );
        if (registration.installing) {
          console.debug("Service worker installing");
        } else if (registration.waiting) {
          console.debug("Service worker installed");
        } else if (registration.active) {
          console.debug("Service worker active");
        }
      } catch (error) {
        console.error(`Registration failed with ${error}`);
      }
    }
  };

  registerServiceWorker();

  // Capture messages from SW
  navigator.serviceWorker.addEventListener("message", (event) => {
    console.log("serviceWorkerMessage", event.data.url);
    // Let's ask webworker to get the file for me
    const path = fullUrlToPath(event.data.url);
    const message = {
      path,
      type: "forwardAsset",
      requestId: event.data.requestId,
    };
    datasetteWorker.postMessage(message);
  });

  // Register URL state
  const datasetteWorker = new Worker("webworker.js");
  const urlParams = new URLSearchParams(location.search);
  const initialUrl = rewriteGithubUrlWithCorsHeaders(urlParams.get('url'));
  const metadataUrl = rewriteGithubUrlWithCorsHeaders(
    urlParams.get("metadata")
  );
  const csvUrls = urlParams.getAll('csv').map(rewriteGithubUrlWithCorsHeaders);
  const sqlUrls = urlParams.getAll('sql').map(rewriteGithubUrlWithCorsHeaders);
  const jsonUrls = urlParams
    .getAll("json")
    .map(rewriteGithubUrlWithCorsHeaders);
  const installUrls = urlParams.getAll("install");

  datasetteWorker.postMessage({
    type: "startup",
    initialUrl,
    csvUrls,
    sqlUrls,
    installUrls,
    metadataUrl,
    jsonUrls,
    baseUrl: BASE_URL + '/',
  });

  datasetteWorker.onmessage = onWebWorkerMessage;

  // Window: Intercept history state changes
  window.onpopstate = function (event) {
    console.log(event);

    // This is a a temporary measure until I stop the plugin from making use of URL hashes
    // currently, we should ignore hash changes
    // future solution: store hash routes someplace else, or don't have collisions with plugins that need it, like Vega...
    if (event.target.location.hash.includes("dataExplorer")) {
      console.log("ignoring early");
      return;
    }

    datasetteWorker.postMessage({
      path: event.target.location.hash.split("#")[1] || "",
    });
  };

  // Start with path from location.hash, if available
  if (location.hash) {
    datasetteWorker.postMessage({ path: location.hash.replace(/^\#/, "") });
  } else {
    datasetteWorker.postMessage({ path: "/" });
  }

  // Attach DOM listeners, mostly for data inputs
  const output = document.getElementById("output");
  attachEventListeners(output, datasetteWorker);

  // Return web worker in case other components want to talk to it, should be a singleton
  return datasetteWorker;
}

const BASE_URL = window.location.origin;
// Intercept events coming from the datasette HTML page.
function attachEventListeners(output: HTMLElement, datasetteWorker: Worker) {
  function loadPath(path) {
    path = path.split("#")[0].replace(BASE_URL, "");
    console.log("Navigating to", { path });
    history.pushState({ path: path }, '', "#" + path);
    datasetteWorker.postMessage({ path });
  }

  output.addEventListener(
    "click",
    (ev) => {
      var link = ev.srcElement.closest("a");
      if (link && link.href) {
        ev.stopPropagation();
        ev.preventDefault();
        if (isFragmentLink(link.href)) {
          // Jump them to that element, but don't update the URL bar
          // since we use # in the URL to mean something else
          let fragment = new URL(link.href).hash.replace("#", "");
          if (fragment) {
            let el = document.getElementById(fragment);
            el.scrollIntoView();
          }
          return;
        }
        const href = link.getAttribute("href");
        // don't open new tab if base URL is the same
        if (isExternal(href) && !href.startsWith(BASE_URL)) {
          window.open(href);
          return;
        }
        loadPath(href);
      }
    },
    true
  );

  output.addEventListener(
    "submit",
    (ev) => {
      console.log(ev);
      ev.stopPropagation();
      ev.preventDefault();
      if (
        ev.target &&
        ev.target.nodeName == "FORM" &&
        ev.target.method.toLowerCase() == "get"
      ) {
        let qs = new URLSearchParams(new FormData(ev.target)).toString();
        let action = ev.target.getAttribute("action");
        loadPath(`${action}?${qs}`);
      }
    },
    true
  );
}

// Helper functions. May have some side effects.

// forked allen kim: https://stackoverflow.com/a/47614491/5129731
const setInnerHTMLWithScriptsAndOnLoad = async function (elm, html) {
  elm.innerHTML = html;
  // throw Error('failure');
  const scripts = Array.from(elm.querySelectorAll("script"));
  // console.log('scripts', scripts);

  // A bit hacky but acceptable. Sorting might be better.
  const scriptsWithDefer = []; // push to end
  const scriptsWithoutDefer = [];
  const inlineScripts = [];

  scripts.forEach((script) => {
    const src = script.getAttribute("src") || "";
    // Force sql formatter to go to end b/c otherwise codemirror has issues
    if (src === null || src === "") {
      inlineScripts.push(script);
    } else if (script.getAttribute("defer") === null) {
      scriptsWithoutDefer.push(script);
    } else {
      scriptsWithDefer.push(script);
    }
  });

  const allRemoteScripts = [...scriptsWithDefer, ...scriptsWithoutDefer];

  // Try to make the scripts load in sequential order
  const blockLoadingScripts = [];
  for (const oldScript of allRemoteScripts) {
    // console.log('scriptOrder', oldScript.getAttribute('src'));
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes).forEach((attr) =>
      newScript.setAttribute(attr.name, attr.value)
    );
    oldScript.remove();
    blockLoadingScripts.push(newScript);
  }

  const head = document.querySelectorAll("head")[0];

  // console.log("loading some remote scripts", blockLoadingScripts.length);
  for (const script of blockLoadingScripts) {
    const scriptLoadPromise = new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });

    // Need to use for-of to make sure it doesn't jump ahead
    head.appendChild(script);
    await scriptLoadPromise;
  }

  // Lastly, insert inline scripts after blocking items loaded
  const inlineFragment = new DocumentFragment();
  inlineScripts.forEach((oldScript) => {
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes).forEach((attr) =>
      newScript.setAttribute(attr.name, attr.value)
    );
    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
    inlineFragment.appendChild(newScript);
  });

  head.appendChild(inlineFragment);

  // Trigger onloads to finish scripting since this function is async
  if (window.onload) {
    console.log("re-dispatching onload");
    window.onload(); // used by host page
  }
  console.log("dispatching scripts loaded");
  // plugins need to know when all APIS are ready...
  // window is no good... need to use document.
  document.dispatchEvent(new CustomEvent("DatasetteLiteScriptsLoaded")); // used by vega
};

function onWebWorkerMessage(event: MessageEvent<FromWebWorkerEvent>) {
  const { data: eventData } = event;

  if (eventData.type === "forwardAsset") {
    // console.log("forwarding asset", eventData.path);
    navigator.serviceWorker.ready.then((registration) => {
      registration.active.postMessage(
        JSON.stringify({
          datasetteAssetContent: eventData.text,
          datasetteAssetUrl: eventData.path,
          contentType: eventData.contentType,
          requestId: eventData.requestId,
        })
      );
    });
    return;
  } else if (eventData.type === "log") {
    const ta = document.getElementById("loading-logs") as HTMLTextAreaElement;
    ta.value = ta.value + `\n${eventData.line}`;
    ta.scrollTop = ta.scrollHeight;
  } else {
    const innerHtml = getHtmlFromEvent(eventData);
    const outputElement = document.getElementById("output");
    setInnerHTMLWithScriptsAndOnLoad(outputElement, innerHtml);
    let title = document.getElementById("output").querySelector("title");
    if (title) {
      document.title = title.innerText;
    }

    window.scrollTo({ top: 0, left: 0 });
    document.getElementById("loading-indicator").style.display = "none";
  }
}
