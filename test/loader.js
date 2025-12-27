// loader.js
// Injects the build_mainparser.js into the main page context

const script = document.createElement('script');
script.src = chrome.runtime.getURL('build_mainparser.js');
script.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

console.log("FoE Data Standalone: Injection loader executed.");
