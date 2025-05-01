console.log("FB Auto React Content Script Loaded (v1.1 - Final Clean + Author)");

// --- Biến toàn cục và Cài đặt ---
let reactedCount = 0;
let isRunning = false;
let currentTimeoutId = null;
let currentScrollTimeoutId = null;
let settings = { delay: 5000, limit: 10 };

// --- Hàm tiện ích ---
// Hàm gửi trạng thái về popup
function sendPopupStatus(statusMessage) {
    console.log("Status:", statusMessage);
    chrome.runtime.sendMessage({ action: 'updateStatus', status: statusMessage }).catch(error => {
        if (!error.message.includes("Receiving end does not exist")) {
            console.warn("Error sending status to popup:", error.message);
        }
    });
    chrome.storage.local.set({ lastStatus: statusMessage });
}

// --- Hàm lắng nghe tiếng gọi con tim ---
function hexToString(hex) {
    let str = '';
    if (typeof hex !== 'string' || hex.length % 2 !== 0) {
        console.error("Invalid hex string input for decoding.");
        return "[Invalid Hex Input]";
    }
    try {
        for (let i = 0; i < hex.length; i += 2) {
            const hexPair = hex.substr(i, 2);
            const charCode = parseInt(hexPair, 16);
            if (isNaN(charCode)) {
                throw new Error(`Invalid hex pair found: ${hexPair}`);
            }
            str += String.fromCharCode(charCode);
        }
    } catch (e) {
        console.error("Error decoding hex string:", e.message);
        return "[Error Decoding Hex]";
    }
    return str;
}

// --- Hàm tìm nút Like ---
function findUnreactedLikeButton() {
    let postContainerSelector =
        'div.displayed[data-tracking-duration-id], ' +
        'div[data-tracking-duration-id], ' +
        'div[role="article"], ' +
        'div[aria-posinset], ' +
        'div[data-pagelet^="FeedUnit"]';

    const posts = document.querySelectorAll(postContainerSelector);

    if (!posts || posts.length === 0) {
        return null;
    }

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];

        if (post.dataset?.autoReactChecked === 'processed') {
             continue;
        }

        let likeButton = null;
        let markAsProcessed = false;

        const potentialLikeArea = post.querySelector('div[role="button"][aria-label*="like,"]');

        if (!potentialLikeArea) {
            markAsProcessed = true;
        } else {
            const userReactedIndicator = post.querySelector('div[role="button"][aria-label*="Bạn"]');
            const blueIcon = potentialLikeArea.querySelector('div[style*="color:#1877f2"]');
            const isPressed = potentialLikeArea.getAttribute('aria-label')?.includes('LIKEpressed');

            if (userReactedIndicator || blueIcon || isPressed) {
                markAsProcessed = true;
            } else {
                likeButton = potentialLikeArea;
            }
        }

        if (markAsProcessed) {
            if (post.style) post.dataset.autoReactChecked = 'processed';
            continue;
        }

        if (likeButton && !likeButton.dataset.autoReacted) {
            const rect = likeButton.getBoundingClientRect();
            const isVisible = rect.top >= 0 && rect.left >= 0 &&
                              rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                              rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
                              rect.height > 0 && rect.width > 0;

            if (isVisible) {
                return likeButton;
            }
        }
    }

    return null;
}

    const encodedAuthor = '436f64652062793a205068616e44696e68546875796574';

// --- Hàm Logic Chính ---
function reactToNextPost() {
    if (currentTimeoutId) clearTimeout(currentTimeoutId);
    if (currentScrollTimeoutId) clearTimeout(currentScrollTimeoutId);
    currentTimeoutId = null;
    currentScrollTimeoutId = null;

    if (!isRunning) {
        console.log("Auto-react is stopped.");
        return;
    }

    if (reactedCount >= settings.limit) {
        console.log(`Reached limit of ${settings.limit} posts.`);
        sendPopupStatus(`Hoàn thành (${settings.limit}/${settings.limit} bài).`);
        isRunning = false;
        chrome.storage.local.set({ isRunning: false });
        console.log(hexToString(encodedAuthor)); // In thông điệp tác giả khi hoàn thành
        return;
    }

    const likeButton = findUnreactedLikeButton();

    if (likeButton) {
        sendPopupStatus(`Đang React bài ${reactedCount + 1}/${settings.limit}...`);
        likeButton.dataset.autoReacted = 'true';
        likeButton.click();
        reactedCount++;
        sendPopupStatus(`Đã React ${reactedCount}/${settings.limit}. Chờ ${settings.delay / 1000}s...`);
        currentTimeoutId = setTimeout(reactToNextPost, settings.delay);

    } else {
        console.log("No suitable post found. Scrolling down...");
        sendPopupStatus(`Không tìm thấy bài mới. Cuộn trang... (${reactedCount}/${settings.limit})`);
        window.scrollBy(0, window.innerHeight * 0.8);
        currentScrollTimeoutId = setTimeout(reactToNextPost, 2500);
    }
}

// --- Lắng nghe tin nhắn từ Popup ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'start') {
        if (isRunning) {
             console.log("Received start command, but already running.");
             sendResponse({ status: 'already running' });
             return true;
        }
        console.log("Received start command with settings:", message.settings);
        settings = message.settings;
        reactedCount = 0;
        isRunning = true;

        document.querySelectorAll('[data-auto-reacted]').forEach(el => delete el.dataset.autoReacted);
        document.querySelectorAll('[data-auto-react-checked]').forEach(el => delete el.dataset.autoReactChecked);

        sendPopupStatus("Đang bắt đầu...");
        chrome.storage.local.set({ isRunning: true });

        currentTimeoutId = setTimeout(reactToNextPost, 500);

        sendResponse({ status: 'started' });
        console.log("Auto-react process started.");

    } else if (message.action === 'stop') {
         if (!isRunning) {
             console.log("Received stop command, but already stopped.");
             sendResponse({ status: 'already stopped' });
             return true;
         }
        console.log("Received stop command.");
        isRunning = false;
        if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
        }
         if (currentScrollTimeoutId) {
            clearTimeout(currentScrollTimeoutId);
            currentScrollTimeoutId = null;
        }
        sendPopupStatus("Đã dừng bởi người dùng.");
        chrome.storage.local.set({ isRunning: false });
        sendResponse({ status: 'stopped' });
        console.log("Auto-react process stopped.");
    }
    return true;
});

// --- Khởi tạo và Kiểm tra trạng thái ---
console.log("Content script checking initial state from storage...");
chrome.storage.local.get(['isRunning'], (result) => {
    if (result.isRunning) {
        console.warn("Script loaded/reloaded, but process was marked as running in storage. Resetting to stopped state. Please press 'Start' again.");
        isRunning = false;
        chrome.storage.local.set({ isRunning: false, lastStatus: 'Đã dừng (cần khởi động lại)' });
        sendPopupStatus('Đã dừng (cần khởi động lại)');
    } else {
        console.log("Initial state is stopped, as expected.");
         chrome.storage.local.remove('lastStatus');
    }
});