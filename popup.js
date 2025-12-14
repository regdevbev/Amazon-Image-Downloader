// popup.js - V23 Manual Controls
let scrapedData = { mainImages: [], variantImages: [], videos: [], title: "" };
const statusMsg = document.getElementById('status-message');
const startBtn = document.getElementById('start-scan-btn');
const controlsDiv = document.getElementById('scan-controls');
const actionsDiv = document.querySelector('.actions');

function showStatus(msg, type = 'info') {
    statusMsg.textContent = msg;
    statusMsg.className = type;
    if (type === 'error') {
        const btn = document.createElement('button');
        btn.textContent = "Refresh Page";
        Object.assign(btn.style, { marginTop: "10px", padding: "5px 10px", cursor: "pointer" });
        btn.onclick = () => chrome.tabs.reload();
        statusMsg.appendChild(document.createElement('br'));
        statusMsg.appendChild(btn);
    }
}

function render(data) {
    document.getElementById('count-main').textContent = data.mainImages.length;
    document.getElementById('count-vars').textContent = data.variantImages.length;

    const mainGrid = document.getElementById('main-images-grid');
    const varGrid = document.getElementById('variant-images-grid');
    mainGrid.innerHTML = ''; varGrid.innerHTML = '';

    const addImg = (u, p) => {
        const i = document.createElement('img');
        i.src = u; i.className = 'image-item';
        i.onclick = () => chrome.downloads.download({ url: u });
        p.appendChild(i);
    };

    data.mainImages.forEach(u => addImg(u, mainGrid));
    data.variantImages.forEach(u => addImg(u, varGrid));
}

// START BUTTON HANDLER
startBtn.addEventListener('click', () => {
    // Hide start button
    controlsDiv.style.display = 'none';
    statusMsg.textContent = "Initializing connection...";

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0] || !tabs[0].url.includes("amazon")) {
            showStatus("Not an Amazon Page.", "error");
            return;
        }

        // Ping -> AutoPilot
        chrome.tabs.sendMessage(tabs[0].id, { action: "ping" }, response => {
            if (chrome.runtime.lastError) {
                console.warn(chrome.runtime.lastError);
                showStatus("Please Refresh Page.", "error");
                return;
            }

            statusMsg.textContent = "Scanning... (Do not close)";
            chrome.tabs.sendMessage(tabs[0].id, { action: "autoPilot" }, resp => {
                if (chrome.runtime.lastError || !resp) {
                    showStatus("Scan Failed.", "error");
                    controlsDiv.style.display = 'block'; // Show button again
                    return;
                }

                // Success
                scrapedData = resp;
                render(resp);
                statusMsg.textContent = "Scan Complete!";
                actionsDiv.style.display = 'flex';
            });
        });
    });
});

// DOWNLOAD HELPERS
async function downloadImages(images, folderName, zipName) {
    if (!images || images.length === 0) return;
    const z = new JSZip();
    const folder = z.folder(folderName);

    statusMsg.textContent = `Zipping ${images.length} images...`;

    for (let i = 0; i < images.length; i++) {
        try {
            const blob = await (await fetch(images[i])).blob();
            folder.file(`${folderName}_${i + 1}.jpg`, blob);
        } catch (e) { console.error(e); }
    }

    const b = await z.generateAsync({ type: "blob" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = zipName;
    a.click();
    statusMsg.textContent = "Done!";
}

// BUTTON LISTENERS
document.getElementById('download-all-btn').addEventListener('click', async () => {
    const z = new JSZip();
    const mainF = z.folder("Main_Product");
    const varF = z.folder("Variants");

    for (let i = 0; i < scrapedData.mainImages.length; i++)
        try { mainF.file(`main_${i + 1}.jpg`, await (await fetch(scrapedData.mainImages[i])).blob()); } catch (e) { }

    for (let i = 0; i < scrapedData.variantImages.length; i++)
        try { varF.file(`variant_${i + 1}.jpg`, await (await fetch(scrapedData.variantImages[i])).blob()); } catch (e) { }

    const b = await z.generateAsync({ type: "blob" });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = "amazon_all_images.zip"; a.click();
});

document.getElementById('dl-main-btn').addEventListener('click', () => {
    downloadImages(scrapedData.mainImages, "Main_Images", "amazon_main_images.zip");
});

document.getElementById('dl-var-btn').addEventListener('click', () => {
    downloadImages(scrapedData.variantImages, "Variant_Images", "amazon_variant_images.zip");
});
