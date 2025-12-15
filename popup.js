// popup.js - V25 In-Memory Logic
let scrapingData = { mainImages: [], variantImages: [] };
const statusMsg = document.getElementById('status-message');
const startBtn = document.getElementById('start-scan-btn');
const startMainBtn = document.getElementById('start-main-btn');
const controlsDiv = document.getElementById('scan-controls');
const actionsDiv = document.querySelector('.actions');

function showStatus(msg, type = 'info') {
    if (!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.className = type;
}

function render(data) {
    if (!data) return;
    scrapingData = data;

    document.getElementById('count-main').textContent = data.mainImages ? data.mainImages.length : 0;
    document.getElementById('count-vars').textContent = data.variantImages ? data.variantImages.length : 0;

    const mainGrid = document.getElementById('main-images-grid');
    const varGrid = document.getElementById('variant-images-grid');
    if (mainGrid) mainGrid.innerHTML = '';
    if (varGrid) varGrid.innerHTML = '';

    const addImg = (u, p) => {
        if (!p) return;
        const i = document.createElement('img');
        i.src = u; i.className = 'image-item';
        i.onclick = () => chrome.downloads.download({ url: u });
        p.appendChild(i);
    };

    if (data.mainImages) data.mainImages.forEach(u => addImg(u, mainGrid));
    if (data.variantImages) data.variantImages.forEach(u => addImg(u, varGrid));
}

function init() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0] || !tabs[0].url.includes("amazon")) {
            showStatus("Not Amazon.", "error"); return;
        }

        // ASK CONTENT SCRIPT FOR DATA
        chrome.tabs.sendMessage(tabs[0].id, { action: "getData" }, response => {
            if (chrome.runtime.lastError) {
                // Content script might not be injected yet or disconnected
                console.log("No content script check");
                return;
            }

            if (response && (response.mainImages.length > 0 || response.variantImages.length > 0)) {
                // WE HAVE DATA! Restore it.
                if (controlsDiv) controlsDiv.style.display = 'none';
                render(response);
                showStatus("Restored from page memory.", "success");
                if (actionsDiv) actionsDiv.style.display = 'flex';
            } else {
                // NO DATA. Show Start.
                // This happens on Fresh Load OR Refresh. perfect.
            }
        });
    });
}

function startScan(onlyMain = false) {
    if (controlsDiv) controlsDiv.style.display = 'none';
    showStatus("Connecting...", "info");

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tid = tabs[0].id;

        // PING
        chrome.tabs.sendMessage(tid, { action: "ping" }, () => {
            if (chrome.runtime.lastError) {
                showStatus("Please Refresh Page.", "error"); return;
            }

            showStatus(onlyMain ? "Scanning Main Only..." : "Scanning...", "info");

            // RUN
            chrome.tabs.sendMessage(tid, {
                action: "autoPilot",
                options: { onlyMain }
            }, resp => {
                if (!resp) {
                    showStatus("Scan Failed.", "error");
                    if (controlsDiv) controlsDiv.style.display = 'block';
                    return;
                }

                // RENDER
                render(resp);
                showStatus("Done!", "success");
                if (actionsDiv) actionsDiv.style.display = 'flex';
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    if (startBtn) startBtn.addEventListener('click', () => startScan(false));
    if (startMainBtn) startMainBtn.addEventListener('click', () => startScan(true));

    // EXPORT CSV
    const csvBtn = document.getElementById('export-csv-btn');
    if (csvBtn) csvBtn.addEventListener('click', () => {
        let csvContent = "data:text/csv;charset=utf-8,Type,ImageUrl\n";
        scrapingData.mainImages.forEach(u => csvContent += `Main,${u}\n`);
        scrapingData.variantImages.forEach(u => csvContent += `Variant,${u}\n`);
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "amazon_media_list.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // ZIPS
    async function downloadImages(images, folderName, zipName) {
        if (!images || images.length === 0) return;
        const z = new JSZip();
        const folder = z.folder(folderName);
        showStatus(`Zipping...`, "info");
        for (let i = 0; i < images.length; i++) {
            try {
                const blob = await (await fetch(images[i])).blob();
                folder.file(`${folderName}_${i + 1}.jpg`, blob);
            } catch (e) { }
        }
        const b = await z.generateAsync({ type: "blob" });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = zipName; a.click();
        showStatus("Done!", "success");
    }

    const dlAll = document.getElementById('download-all-btn');
    if (dlAll) dlAll.addEventListener('click', async () => {
        const z = new JSZip();
        const mainF = z.folder("Main_Product");
        const varF = z.folder("Variants");
        for (let i = 0; i < scrapingData.mainImages.length; i++)
            try { mainF.file(`main_${i + 1}.jpg`, await (await fetch(scrapingData.mainImages[i])).blob()); } catch (e) { }
        for (let i = 0; i < scrapingData.variantImages.length; i++)
            try { varF.file(`variant_${i + 1}.jpg`, await (await fetch(scrapingData.variantImages[i])).blob()); } catch (e) { }
        const b = await z.generateAsync({ type: "blob" });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = "amazon_all_images.zip"; a.click();
    });

    if (document.getElementById('dl-main-btn'))
        document.getElementById('dl-main-btn').addEventListener('click', () => downloadImages(scrapingData.mainImages, "Main", "main.zip"));

    if (document.getElementById('dl-var-btn'))
        document.getElementById('dl-var-btn').addEventListener('click', () => downloadImages(scrapingData.variantImages, "Vars", "vars.zip"));
});
