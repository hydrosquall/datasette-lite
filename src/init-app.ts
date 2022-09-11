// Entrypoint to Datasette-Lite Main
import {
  isExternal,
  isFragmentLink,
  fullUrlToPath,
  setInnerHTMLWithScriptsAndOnLoad,
} from "./init-app.utils";
import escapeHtml from "xss";

type FromWebWorkerEvent =
  | {
      error: string;
      type: "error";
    }
  | {
      type: "forwardAsset";
      path: string;
      text: string;
      contentType: string;
      status: any; // TBD
    }
  | {
      type: "log";
      line: string;
    }
  | {
      // TODO... narrow down when this can happen
      type: "other";
      contentType: "string";
      text: string;
    };

// HACK... temporary leave this as a global?

function getHtmlFromEvent(eventData: FromWebWorkerEvent) {
  // TODO... is  ts-pattern appropriate?
  let html = "";

  if (eventData.type === "error") {
    html = `<div style="padding: 0.5em"><h3>Error</h3><pre>${escapeHtml(
      eventData.error
    )}</pre></div>`;
  } else if (/^text\/html/.exec(eventData.contentType)) {
    html = eventData.text;
  } else if (/^application\/json/.exec(eventData.contentType)) {
    html = `<pre style="padding: 0.5em">${escapeHtml(
      JSON.stringify(JSON.parse(eventData.text), null, 4)
    )}</pre>`;
  } else {
    html = `<pre style="padding: 0.5em">${escapeHtml(eventData.text)}</pre>`;
  }

  return html;
}

function onWebWorkerMessage(event: MessageEvent<FromWebWorkerEvent>) {
  const eventData = event.data;

  if (eventData.type === "forwardAsset") {
    // IF data is for service worker, relay it
    console.log("forwarding asset", eventData.path);
    navigator.serviceWorker.ready.then((registration) => {
      registration.active.postMessage(
        JSON.stringify({
          datasetteAssetContent: eventData.text,
          datasetteAssetUrl: eventData.path,
          contentType: eventData.contentType,
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
    console.log("serviceWorkerMessage", event.data.msg, event.data.url);
    // Let's ask webworker to get the file for me
    const path = fullUrlToPath(event.data.url);
    datasetteWorker.postMessage({ path, type: "forwardAsset" });
  });

  // Register URL state
  const datasetteWorker = new Worker("webworker.js");
  const urlParams = new URLSearchParams(location.search);
  const initialUrl = urlParams.get("url");
  const csvUrls = urlParams.getAll("csv");
  const sqlUrls = urlParams.getAll("sql");
  const installUrls = urlParams.getAll("install");

  datasetteWorker.postMessage({
    type: "startup",
    initialUrl,
    csvUrls,
    sqlUrls,
    installUrls,
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

// Intercept events coming from the datasette HTML page.
function attachEventListeners(output: HTMLElement, datasetteWorker: Worker) {
  function loadPath(path) {
    path = path.split("#")[0].replace("http://localhost", "");
    console.log("Navigating to", { path });
    history.pushState({ path: path }, path, "#" + path);
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
        let href = link.getAttribute("href");
        if (isExternal(href)) {
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
