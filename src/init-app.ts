// Entrypoint to Datasette-Lite Main
import { isExternal, isFragmentLink } from "./init-app.utils";
import escapeHtml from "xss";

const onReceiveMessageFromWorker = (event: MessageEvent<any>) => {
  let loadingLogs = ["Loading..."];

  const ta = document.getElementById("loading-logs");
  if (event.data.type == "log") {
    loadingLogs.push(event.data.line);
    ta.value = loadingLogs.join("\n");
    ta.scrollTop = ta.scrollHeight;
    return;
  }
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
  document.getElementById("output").innerHTML = html;
  let title = document.getElementById("output").querySelector("title");
  if (title) {
    document.title = title.innerText;
  }
  window.scrollTo({ top: 0, left: 0 });
  document.getElementById("loading-indicator").style.display = "none";
};

export function initApp() {
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

  datasetteWorker.onmessage = onReceiveMessageFromWorker;

  // Window: Intercept history state changes
  window.onpopstate = function (event) {
    console.log(event);
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
