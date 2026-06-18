chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'copyToClipboard') {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = request.text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            sendResponse({ success: true });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
        return true;
    }
});
