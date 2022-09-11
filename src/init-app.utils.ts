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

// forked allen kim: https://stackoverflow.com/a/47614491/5129731
export const setInnerHTMLWithScriptsAndOnLoad = async function (elm, html) {
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
      newScript.onerror = reject;
    });
    asyncLoadPromises.push(loadedPromise);
  });

  // NOTE: this doesn't handle "window.onload" listeners. May need to call that manually
  const head = document.querySelectorAll("head")[0];
  head.appendChild(fragment);

  // wait for all scripts to load before executing inline JS
  // console.log('before')
  await Promise.all(asyncLoadPromises);
  // console.log('after');

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
