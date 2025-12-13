// popup.js - Robust Connection Handling
let scrapedData = { mainImages: [], variantImages: [], videos: [], title: "" };
const statusMsg = document.getElementById('status-message');

function showStatus(msg, type = 'info') {
    statusMsg.textContent = msg;
    statusMsg.className = type;
    if (type === 'error') {
        const btn = document.createElement('button');
        btn.textContent = "Refresh Page";
        btn.style.marginTop = "10px";
        btn.style.padding = "5px 10px";
        btn.style.cursor = "pointer";
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

// AUTO START with Error Handling
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;

    if (tabs[0].url.includes("amazon")) {
        statusMsg.textContent = "Connecting to page...";

        // Simple Ping to check connection
        chrome.tabs.sendMessage(tabs[0].id, { action: "ping" }, response => {
            if (chrome.runtime.lastError) {
                // This catches the "Receiving end does not exist"
                console.warn("Connection error:", chrome.runtime.lastError);
                showStatus("Extension Updated. Please Refresh This Page.", "error");
                return;
            }

            // If ping success, run autoPilot
            statusMsg.textContent = "Scanning Variants (V13 Universal)...";
            chrome.tabs.sendMessage(tabs[0].id, { action: "autoPilot" }, resp => {
                if (chrome.runtime.lastError) {
                    showStatus("Scan Failed. Please Refresh.", "error");
                    return;
                }
                if (resp) {
                    scrapedData = resp;
                    render(resp);
                    statusMsg.textContent = "Done!";
                    document.querySelector('.actions').style.display = 'flex';
                }
            });
        });
    } else {
        showStatus("Not an Amazon Product Page.", "error");
    }
});

document.getElementById('download-images-btn').addEventListener('click', async () => {
    const z = new JSZip();
    const mainF = z.folder("Main_Product");
    const varF = z.folder("Variants");
    for (let i = 0; i < scrapedData.mainImages.length; i++)
        try { mainF.file(`main_${i}.jpg`, await (await fetch(scrapedData.mainImages[i])).blob()); } catch (e) { }
    for (let i = 0; i < scrapedData.variantImages.length; i++)
        try { varF.file(`variant_${i}.jpg`, await (await fetch(scrapedData.variantImages[i])).blob()); } catch (e) { }

    const b = await z.generateAsync({ type: "blob" });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = "amazon_images.zip"; a.click();
});
