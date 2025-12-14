// content.js - V22 Bucket Sort Loop
console.log("AMZ Downloader V22 - Bucket Sort");

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

// --- STATUS UI ---
let statusBox = document.getElementById('amz-dl-status');
if (statusBox) statusBox.remove();
statusBox = document.createElement('div');
statusBox.id = 'amz-dl-status';
Object.assign(statusBox.style, {
    position: 'fixed', top: '10px', right: '10px', zIndex: '2147483647',
    background: '#000', color: '#f0f', padding: '15px', // Magenta
    borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace',
    boxShadow: '0 4px 15px rgba(0,0,0,0.8)', maxWidth: '350px',
    border: '2px solid #f0f'
});
document.body.appendChild(statusBox);

function log(msg, sub = "") {
    statusBox.innerHTML = `<strong>${msg}</strong><br><span style="color:#aaa;font-size:11px">${sub}</span>`;
    console.log(`[AMZ-DL] ${msg} ${sub}`);
}

// --- POPOVER LOGIC ---
async function openAndScrapePopover(knownImages, destinationSet) {

    // 1. CLICK MAIN IMAGE (Direct Selector V20)
    let mainTrigger = document.querySelector('span[data-action="main-image-click"]');
    if (!mainTrigger) mainTrigger = document.querySelector('#imgTagWrapperId');
    if (!mainTrigger) mainTrigger = document.querySelector('#landingImage');

    if (!mainTrigger) {
        log("No main image trigger", "Skipping");
        return;
    }

    simulateClick(mainTrigger);

    // 2. WAIT FOR POPOVER
    await sleep(2500);

    // Retry if not open
    if (!document.getElementById('ivLargeImage')) {
        simulateClick(mainTrigger);
        await sleep(1500);
    }

    if (!document.getElementById('ivLargeImage')) {
        log("Gallery Failed", "Skipping");
        return;
    }

    // 3. CYCLE THUMBS
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
        } catch (e) { console.error(e); }
    }

    // 4. CLOSE
    const closeBtn = document.querySelector('.a-popover-close') ||
        document.querySelector('#ivCloseButton') ||
        document.querySelector('button[data-action="a-popover-close"]');

    if (closeBtn) simulateClick(closeBtn);
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));

    await sleep(1500);
}

// --- MAIN LOOP ---
async function runAutoPilot() {
    log("🚀 Init V22 Bucket Sort");

    const mainImagesSet = new Set();
    const variantImagesSet = new Set();
    const knownImages = new Set();

    // 1. GET VARIANTS (Safe List)
    let allVariants = [];

    // Try primary list avoiding sidebar
    const candidates = document.querySelectorAll('ul[data-action="a-button-group"]');
    let realVariantList = null;
    for (const ul of candidates) {
        if (!ul.closest('#altImages')) {
            realVariantList = ul;
            break;
        }
    }

    if (realVariantList) {
        const lis = Array.from(realVariantList.children).filter(li => li.tagName === 'LI');
        lis.forEach(li => {
            if (!li.classList.contains('swatchUnavailable')) allVariants.push(li);
        });
    } else {
        document.querySelectorAll('div[id^="variation_"] li').forEach(li => {
            if (!li.classList.contains('swatchUnavailable')) allVariants.push(li);
        });
    }
    allVariants = [...new Set(allVariants)];

    // 2. IDENTIFY INITIAL VARIANT (The "Main" one)
    let initialIndex = 0; // Default to first if none found

    allVariants.forEach((v, index) => {
        const isSelected = v.querySelector('.a-button-selected') ||
            v.classList.contains('swatchSelect') ||
            v.classList.contains('selected') ||
            v.getAttribute('aria-checked') === 'true';
        if (isSelected) initialIndex = index;
    });

    log(`Variants: ${allVariants.length}`, `Main Product is #${initialIndex + 1}`);

    // 3. FULL LOOP
    for (let i = 0; i < allVariants.length; i++) {
        const v = allVariants[i];
        let label = (v.getAttribute('title') || v.innerText || `Var ${i + 1}`).split('\n')[0].trim();

        // Determine Bucket
        const isMainProduct = (i === initialIndex);
        const destination = isMainProduct ? mainImagesSet : variantImagesSet;
        const typeLabel = isMainProduct ? "⭐ MAIN" : "VAR";

        log(`👉 ${typeLabel} #${i + 1}/${allVariants.length}`, label.substring(0, 18));

        // A. Click Variant (Even if it's the current one, to be safe/consistent)
        let target = v.querySelector('input') || v.querySelector('button') || v.querySelector('a') || v;
        simulateClick(target);

        await sleep(3000); // Wait for update

        // B. Scrape into correct bucket
        await openAndScrapePopover(knownImages, destination);
    }

    log("✅ Scan Complete!", `Main:${mainImagesSet.size} | Vars:${variantImagesSet.size}`);
    await sleep(3000);
    statusBox.remove();

    return {
        mainImages: Array.from(mainImagesSet),
        variantImages: Array.from(variantImagesSet),
        videos: [],
        title: document.title
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") { sendResponse("ok"); return; }
    if (request.action === "autoPilot") {
        runAutoPilot().then(d => sendResponse(d));
        return true;
    }
});
