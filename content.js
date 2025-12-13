// content.js - V20 Direct Action Selector
console.log("AMZ Downloader V20 - Direct Action");

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
    background: '#111', color: '#fff', padding: '15px',
    borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace',
    boxShadow: '0 4px 15px rgba(0,0,0,0.6)', maxWidth: '350px',
    borderLeft: '5px solid #ff00ff'
});
document.body.appendChild(statusBox);

function log(msg, sub = "") {
    statusBox.innerHTML = `<strong>${msg}</strong><br><span style="color:#aaa;font-size:11px">${sub}</span>`;
    console.log(`[AMZ-DL] ${msg} ${sub}`);
}

// --- CORE LOGIC ---

async function openAndScrapePopover(knownImages, variantImages) {

    // 1. CLICK MAIN IMAGE (Using Screenshot Evidence)
    // The user showed: <span data-action="main-image-click"> ... </span>
    // This is the cleanest way to open it.

    let mainTrigger = document.querySelector('span[data-action="main-image-click"]');

    // Fallback to wrapper if span not cached
    if (!mainTrigger) mainTrigger = document.querySelector('#imgTagWrapperId');
    // Fallback to direct image
    if (!mainTrigger) mainTrigger = document.querySelector('#landingImage');

    if (!mainTrigger) {
        log("No main image found", "Check console");
        return;
    }

    // log("Opening Gallery...");
    simulateClick(mainTrigger);

    // 2. WAIT FOR POPOVER
    await sleep(2500);

    // Is it open?
    if (!document.getElementById('ivLargeImage')) {
        log("Gallery not detected", "Retrying click...");
        // Bruteforce retry
        if (mainTrigger) simulateClick(mainTrigger);
        await sleep(1500);
    }

    // 3. CYCLE THUMBS
    const popoverThumbs = document.querySelectorAll('#ivThumbs .ivThumb');

    for (let i = 0; i < popoverThumbs.length; i++) {
        const thumb = popoverThumbs[i];
        if (thumb.classList.contains('ivVideoIcon')) continue;

        simulateClick(thumb);
        await sleep(550);

        const largeImgDiv = document.getElementById('ivLargeImage');
        if (largeImgDiv) {
            const img = largeImgDiv.querySelector('img');
            if (img) {
                const hdUrl = getMaxQualityUrl(img.src);
                if (hdUrl && !knownImages.has(hdUrl)) {
                    variantImages.add(hdUrl);
                    knownImages.add(hdUrl);
                }
            }
        }
    }

    // 4. CLOSE
    const closeBtn = document.querySelector('.a-popover-close') ||
        document.querySelector('#ivCloseButton') ||
        document.querySelector('button[data-action="a-popover-close"]');

    if (closeBtn) simulateClick(closeBtn);
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));

    await sleep(1200);
}

async function runAutoPilot() {
    log("🚀 Init V20 Direct Action");

    const variantImages = new Set();
    const knownImages = new Set();

    // 1. FIND VARIANTS (Ignoring Sidebar)
    const candidates = document.querySelectorAll('ul[data-action="a-button-group"]');
    let realVariantList = null;

    for (const ul of candidates) {
        if (!ul.closest('#altImages')) {
            realVariantList = ul;
            break;
        }
    }

    let allVariants = [];
    if (realVariantList) {
        const lis = Array.from(realVariantList.children).filter(li => li.tagName === 'LI');
        lis.forEach(li => {
            if (!li.classList.contains('swatchUnavailable')) {
                allVariants.push(li);
            }
        });
    } else {
        document.querySelectorAll('div[id^="variation_"] li').forEach(li => {
            if (!li.classList.contains('swatchUnavailable')) allVariants.push(li);
        });
    }

    allVariants = [...new Set(allVariants)];

    log(`Found ${allVariants.length} Variants`, "Looping...");
    await sleep(1000);

    // 2. LOOP
    for (let i = 0; i < allVariants.length; i++) {
        const v = allVariants[i];

        // Refresh DOM reference trick? No, simple wait is safer.
        let label = (v.getAttribute('title') || v.innerText || `Var ${i + 1}`).split('\n')[0].trim();
        log(`👉 Variant ${i + 1}/${allVariants.length}`, label.substring(0, 25));

        // A. Select Variant
        let target = v.querySelector('input') || v.querySelector('button') || v.querySelector('a') || v;
        simulateClick(target);

        await sleep(3000); // 3s wait for DOM

        // B. Open Popover & Scrape
        await openAndScrapePopover(knownImages, variantImages);
    }

    log("✅ Scan Complete!", `Found ${knownImages.size} HD Images`);
    await sleep(3000);
    statusBox.remove();

    return {
        mainImages: [],
        variantImages: Array.from(variantImages),
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
