// Entrypoint to Datasette-Lite Main
import { isExternal, isFragmentLink, fullUrlToPath } from "./init-app.utils";
import escapeHtml from "xss";

function onWebWorkerMessage(event: MessageEvent<any>) {
  let loadingLogs = ["Loading..."];

  // IF data is for service worker, give it back instead of continuing
  if (event.data.type === "asset") {
    console.log("forwarding asset", event.data.path);
    navigator.serviceWorker.ready.then((registration) => {
      registration.active.postMessage(
        JSON.stringify({
          datasetteAssetContent: event.data.text,
          datasetteAssetUrl: event.data.path,
          contentType: event.data.contentType,
        })
      );
    });
    return;
  }

  var ta = document.getElementById("loading-logs");
  if (event.data.type == "log") {
    loadingLogs.push(event.data.line);
    ta.value = loadingLogs.join("\n");
    ta.scrollTop = ta.scrollHeight;
    return;
  }

  // forked allen kim: https://stackoverflow.com/a/47614491/5129731
  const setInnerHTMLWithScriptsAndOnLoad = async function (elm, html) {
    elm.innerHTML = html;
    const scripts = Array.from(elm.querySelectorAll("script"));

    // A bit hacky but acceptable. Sorting might be better.
    const scriptsWithDefer = []; // push to end
    const scriptsWithoutDefer = [];
    const inlineScripts = [];

    scripts.forEach((script) => {
      const src = script.getAttribute("src") || "";

      // Force sql formatter to go to end b/c otherwise codemirror has issues
      if (script.getAttribute("src") === null) {
        inlineScripts.push(script);
      } else if (script.getAttribute("defer") === null) {
        scriptsWithoutDefer.push(script);
      } else {
        scriptsWithDefer.push(script);
      }
    });

    const allRemoteScripts = [...scriptsWithDefer, ...scriptsWithoutDefer];

    // Try to make the scripts wait until the page had loaded before running
    const asyncLoadPromises = [];

    // insert async scripts in bulk
    const fragment = new DocumentFragment();
    allRemoteScripts.forEach((oldScript) => {
      // console.log('scriptOrder', oldScript.getAttribute('src'));
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value)
      );
      fragment.appendChild(newScript);
      oldScript.remove();
      const loadedPromise = new Promise(function (resolve, reject) {
        newScript.onload = resolve;
        // newScript.onerror = reject;
      });
      asyncLoadPromises.push(loadedPromise);
    });

    // NOTE: this doesn't handle "window.onload" listeners. May need to call that manually
    const head = document.querySelectorAll("head")[0];
    head.appendChild(fragment);

    // wait for all scripts to load before executing inline JS
    await Promise.all(asyncLoadPromises);

    // Then insert inline scripts after async items loaded
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

  let html = "";
  if (event.data.error) {
    html = `<div style="padding: 0.5em"><h3>Error</h3><pre>${escapeHtml(
      event.data.error
    )}</pre></div>`;
  } else if (/^text\/html/.exec(event.data.contentType)) {
    html = event.data.text;
  } else if (/^application\/json/.exec(event.data.contentType)) {
    html = `<pre style="padding: 0.5em">${escapeHtml(
      JSON.stringify(JSON.parse(event.data.text), null, 4)
    )}</pre>`;
  } else {
    html = `<pre style="padding: 0.5em">${escapeHtml(event.data.text)}</pre>`;
  }
  // document.getElementById("output").innerHTML = html;
  const outputElement = document.getElementById("output");
  setInnerHTMLWithScriptsAndOnLoad(outputElement, html);

  let title = document.getElementById("output").querySelector("title");
  if (title) {
    document.title = title.innerText;
  }
  window.scrollTo({ top: 0, left: 0 });
  document.getElementById("loading-indicator").style.display = "none";
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
    datasetteWorker.postMessage({ path, type: "asset" });
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
