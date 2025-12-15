// content.js - V25 In-Memory Persistence
console.log("AMZ Downloader V25 - Memory Mode");

// --- UTILS ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getMaxQualityUrl(imgOrUrl) {
    let url = typeof imgOrUrl === 'string' ? imgOrUrl : imgOrUrl.src;
    if (!url) return null;
    return url.replace(/\._[A-Z0-9+,_-]+_\./, '.');
}

function simulateClick(element) {
    if (!element) return false;
    element.click();
    ['mousedown', 'mouseup', 'click'].forEach(type => {
        element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
    return true;
}

// --- STATE ---
let retainedData = null;

// --- STATUS UI ---
let statusBox = null;
function createStatusBox() {
    if (document.getElementById('amz-dl-status')) return;
    statusBox = document.createElement('div');
    statusBox.id = 'amz-dl-status';
    Object.assign(statusBox.style, {
        position: 'fixed', top: '10px', right: '10px', zIndex: '2147483647',
        background: '#000', color: '#0f0', padding: '15px',
        borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace',
        boxShadow: '0 4px 15px rgba(0,0,0,0.8)', maxWidth: '350px',
        border: '2px solid #fff'
    });
    document.body.appendChild(statusBox);
}

function log(msg, sub = "") {
    if (!statusBox) createStatusBox();
    statusBox.innerHTML = `<strong>${msg}</strong><br><span style="color:#aaa;font-size:11px">${sub}</span>`;
    console.log(`[AMZ-DL] ${msg} ${sub}`);
}

// --- POPOVER LOGIC ---
async function openAndScrapePopover(knownImages, destinationSet) {
    let mainTrigger = document.querySelector('span[data-action="main-image-click"]');
    if (!mainTrigger) mainTrigger = document.querySelector('#imgTagWrapperId');
    if (!mainTrigger) mainTrigger = document.querySelector('#landingImage');

    if (!mainTrigger) { log("No trigger", "Skipping"); return; }

    simulateClick(mainTrigger);
    await sleep(2500);

    if (!document.getElementById('ivLargeImage')) {
        simulateClick(mainTrigger);
        await sleep(1500);
    }
    if (!document.getElementById('ivLargeImage')) return;

    const popoverThumbs = document.querySelectorAll('#ivThumbs .ivThumb');
    for (let i = 0; i < popoverThumbs.length; i++) {
        const thumb = popoverThumbs[i];
        if (thumb.classList.contains('ivVideoIcon')) continue;
        simulateClick(thumb);
        await sleep(550);

        try {
            const largeImgDiv = document.getElementById('ivLargeImage');
            if (largeImgDiv) {
                const img = largeImgDiv.querySelector('img');
                if (img) {
                    const hdUrl = getMaxQualityUrl(img.src);
                    if (hdUrl && !knownImages.has(hdUrl)) {
                        destinationSet.add(hdUrl);
                        knownImages.add(hdUrl);
                    }
                }
            }
        } catch (e) { }
    }

    const closeBtn = document.querySelector('.a-popover-close') ||
        document.querySelector('#ivCloseButton') ||
        document.querySelector('button[data-action="a-popover-close"]');
    if (closeBtn) simulateClick(closeBtn);
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
    await sleep(1500);
}

// --- MAIN LOOP ---
async function runAutoPilot(options = {}) {
    const { onlyMain } = options;
    createStatusBox();
    log(`🚀 Init V25`, onlyMain ? "Main Only" : "Full Scan");

    const mainImagesSet = new Set();
    const variantImagesSet = new Set();
    const knownImages = new Set();

    // 1. GET VARIANTS
    let allVariants = [];
    const candidates = document.querySelectorAll('ul[data-action="a-button-group"]');
    let realVariantList = null;
    for (const ul of candidates) {
        if (!ul.closest('#altImages')) { realVariantList = ul; break; }
    }
    if (realVariantList) {
        const lis = Array.from(realVariantList.children).filter(li => li.tagName === 'LI');
        lis.forEach(li => { if (!li.classList.contains('swatchUnavailable')) allVariants.push(li); });
    } else {
        document.querySelectorAll('div[id^="variation_"] li').forEach(li => {
            if (!li.classList.contains('swatchUnavailable')) allVariants.push(li);
        });
    }
    allVariants = [...new Set(allVariants)];

    // 2. IDENTIFY INITIAL
    let initialIndex = 0;
    allVariants.forEach((v, index) => {
        const isSelected = v.querySelector('.a-button-selected') ||
            v.classList.contains('swatchSelect') ||
            v.classList.contains('selected') ||
            v.getAttribute('aria-checked') === 'true';
        if (isSelected) initialIndex = index;
    });

    // 3. LOOP
    for (let i = 0; i < allVariants.length; i++) {
        const isMainProduct = (i === initialIndex);
        if (onlyMain && !isMainProduct) continue;

        const v = allVariants[i];
        const destination = isMainProduct ? mainImagesSet : variantImagesSet;
        const typeLabel = isMainProduct ? "⭐ MAIN" : "VAR";
        let label = (v.getAttribute('title') || v.innerText || `Var ${i + 1}`).split('\n')[0].trim();

        log(`👉 ${typeLabel} #${i + 1}`, label.substring(0, 18));

        let target = v.querySelector('input') || v.querySelector('button') || v.querySelector('a') || v;
        simulateClick(target);
        await sleep(3000);
        await openAndScrapePopover(knownImages, destination);
    }

    log("✅ Complete!", onlyMain ? "Scan Finished" : `Main:${mainImagesSet.size} | Var:${variantImagesSet.size}`);
    await sleep(2000);
    if (statusBox) statusBox.remove();
    statusBox = null;

    return {
        mainImages: Array.from(mainImagesSet),
        variantImages: Array.from(variantImagesSet),
        videos: [],
        title: document.title
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") { sendResponse("ok"); return; }
    if (request.action === "getData") { sendResponse(retainedData); return; }
    if (request.action === "autoPilot") {
        runAutoPilot(request.options || {}).then(d => {
            retainedData = d; // SAVE TO MEMORY
            sendResponse(d);
        });
        return true;
    }
});
