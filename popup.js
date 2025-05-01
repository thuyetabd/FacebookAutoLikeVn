const delayInput = document.getElementById('delay');
const limitInput = document.getElementById('limit');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('status');

// --- Hàm cập nhật UI ---
function updateUI(running, statusMessage = "Sẵn sàng") {
    startButton.disabled = running;
    stopButton.disabled = !running;
    statusDiv.textContent = `Trạng thái: ${statusMessage}`;
    statusDiv.classList.remove('error-message'); // Xóa class lỗi nếu có
}

function displayError(errorMessage) {
    statusDiv.textContent = `Lỗi: ${errorMessage}`;
    statusDiv.classList.add('error-message');
    startButton.disabled = false; // Cho phép thử lại
    stopButton.disabled = true;
    // Đảm bảo trạng thái trong storage cũng là false
    chrome.storage.local.set({ isRunning: false });
}

// --- Tải cài đặt và trạng thái khi mở popup ---
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['delay', 'limit', 'isRunning', 'lastStatus'], (result) => {
        delayInput.value = result.delay || 5;
        limitInput.value = result.limit || 10;
        const running = result.isRunning || false;
        const status = result.lastStatus || (running ? 'Đang chạy...' : 'Sẵn sàng');
        updateUI(running, status);
    });
});


// --- Xử lý sự kiện click ---
startButton.addEventListener('click', () => {
    const delay = parseInt(delayInput.value, 10);
    const limit = parseInt(limitInput.value, 10);

    if (isNaN(delay) || delay < 1 || isNaN(limit) || limit < 1) {
        displayError('Thời gian nghỉ và số bài phải là số dương.');
        return;
    }

    const settings = { delay: delay * 1000, limit: limit }; // Lưu mili giây

    // Lưu cài đặt mới VÀ trạng thái isRunning=true
    chrome.storage.local.set({ delay: delay, limit: limit, isRunning: true, lastStatus: 'Đang khởi động...' }, () => {
        console.log('Settings saved, isRunning set to true');
        updateUI(true, "Đang khởi động..."); // Cập nhật UI ngay lập tức

        // Gửi lệnh bắt đầu đến content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].id) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    { action: 'start', settings: settings },
                    (response) => {
                        // Kiểm tra lỗi runtime trước tiên (quan trọng nhất)
                        if (chrome.runtime.lastError) {
                            console.error("Send message error:", chrome.runtime.lastError.message);
                            displayError(`Không thể kết nối tới tab Facebook. Hãy đảm bảo bạn đang ở đúng tab và đã tải lại trang.\n(${chrome.runtime.lastError.message})`);
                            // Không cần set isRunning false ở đây vì displayError đã làm
                            return;
                        }

                        // Kiểm tra phản hồi từ content script
                        if (response && response.status === 'started') {
                            console.log('Content script confirmed start.');
                            updateUI(true, "Đã bắt đầu!"); // Cập nhật trạng thái thành công
                        } else if (response && response.status === 'already running') {
                             console.log('Content script was already running.');
                             updateUI(true, "Đã chạy từ trước.");
                        } else {
                            // Trường hợp content script gửi phản hồi không mong muốn hoặc không gửi
                            console.warn('Unexpected response from content script:', response);
                            displayError('Không nhận được xác nhận từ tab Facebook.');
                        }
                    }
                );
            } else {
                console.error('No active tab found.');
                displayError('Không tìm thấy tab hoạt động.');
            }
        });
    });
});

stopButton.addEventListener('click', () => {
    // Đặt isRunning thành false trước khi gửi lệnh
     chrome.storage.local.set({ isRunning: false, lastStatus: 'Đang dừng...' }, () => {
        console.log('isRunning set to false');
        updateUI(false, "Đang dừng..."); // Cập nhật UI ngay

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].id) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    { action: 'stop' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("Send message error (stop):", chrome.runtime.lastError.message);
                            // Dù lỗi gửi lệnh dừng, UI đã được cập nhật là dừng
                            // Có thể không cần thông báo lỗi quá chi tiết ở đây
                            updateUI(false, "Đã yêu cầu dừng (có thể cần tải lại trang).");
                            return;
                        }

                        if (response && (response.status === 'stopped' || response.status === 'already stopped')) {
                            console.log('Content script confirmed stop.');
                            updateUI(false, "Đã dừng.");
                            chrome.storage.local.set({ lastStatus: 'Đã dừng.' });
                        } else {
                             console.warn('Unexpected stop response:', response);
                             updateUI(false, "Đã dừng (phản hồi không rõ).");
                        }
                    }
                );
            } else {
                 console.error('No active tab found to send stop command.');
                 updateUI(false, "Đã dừng (không tìm thấy tab)."); // Cập nhật UI dừng
            }
        });
    });
});

// --- Lắng nghe cập nhật trạng thái từ content script ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateStatus') {
        console.log("Status update from content script:", message.status);
        const isStillRunning = !(message.status.includes('Hoàn thành') || message.status.includes('Đã dừng') || message.status.includes('Lỗi'));
        updateUI(isStillRunning, message.status);
        // Lưu trạng thái cuối cùng để hiển thị khi mở lại popup
        chrome.storage.local.set({ lastStatus: message.status, isRunning: isStillRunning });
    }
    // Không cần sendResponse từ popup tới content script ở đây
});