document.addEventListener("DOMContentLoaded", () => {
    const hourRange = document.getElementById("hourRange");
    const minuteRange = document.getElementById("minuteRange");
    const hourValue = document.getElementById("hourValue");
    const minuteValue = document.getElementById("minuteValue");
    const currentTimeDisplay = document.getElementById("currentTimeDisplay");
    const dateTimeDisplay = document.getElementById("dateTimeDisplay");
    const alarmDateInput = document.getElementById("alarmDate");
    const youtubeNameInput = document.getElementById("youtubeName");
    const youtubeUrlInput = document.getElementById("youtubeUrl");
    const addToListBtn = document.getElementById("addToListBtn");
    const videoSelect = document.getElementById("videoSelect");
    const deleteVideoBtn = document.getElementById("deleteVideoBtn");
    const setAlarmBtn = document.getElementById("setAlarmBtn");
    const videoContainer = document.getElementById("videoContainer");
    const youtubePlayer = document.getElementById("youtubePlayer");
    const stopAlarmBtn = document.getElementById("stopAlarmBtn");
    const snoozeAlarmBtn = document.getElementById("snoozeAlarmBtn");
    const alarmHistoryListElement = document.getElementById("alarmHistory");
    const toggleVideoSaveBtn = document.getElementById("toggleVideoSaveBtn");
    const videoSaveSection = document.getElementById("videoSaveSection");
    const toggleRelativeAlarmBtn = document.getElementById("toggleRelativeAlarmBtn");
    const relativeAlarmSection = document.getElementById("relativeAlarmSection");
    const afterHoursInput = document.getElementById("afterHours");
    const afterMinutesInput = document.getElementById("afterMinutes");
    const setRelativeAlarmBtn = document.getElementById("setRelativeAlarmBtn");

    let alarmTime = null;
    let alarmVideoID = null;
    let alarmFired = false;
    let videoList = [];
    let alarmHistoryList = [];
    let snoozeTimer = null;

    const pad = (n) => n.toString().padStart(2, "0");

    function updateTimeDisplay() {
        const h = pad(hourRange.value);
        const m = pad(minuteRange.value);
        hourValue.textContent = h;
        minuteValue.textContent = m;
        currentTimeDisplay.textContent = `${h}:${m}`;
    }

    function updateDateTime() {
        const now = new Date();
        const y = now.getFullYear(), m = pad(now.getMonth() + 1), d = pad(now.getDate());
        const h = pad(now.getHours()), mi = pad(now.getMinutes()), s = pad(now.getSeconds());
        const w = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
        dateTimeDisplay.textContent = `${y}年${m}月${d}日(${w}) ${h}:${mi}:${s}`;
    }

    function extractYouTubeID(url) {
        const match = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }

    function saveToLocalStorage() {
        localStorage.setItem("videoList", JSON.stringify(videoList));
    }

    function loadFromLocalStorage() {
        const stored = localStorage.getItem("videoList");
        if (stored) {
            videoList = JSON.parse(stored);
            refreshVideoSelect();
        }
    }

    function saveAlarmHistory() {
        localStorage.setItem("alarmHistory", JSON.stringify(alarmHistoryList));
    }

    function loadAlarmHistory() {
        const stored = localStorage.getItem("alarmHistory");
        if (stored) {
            alarmHistoryList = JSON.parse(stored);
            refreshAlarmHistory();
        }
    }

    function refreshVideoSelect() {
        videoSelect.innerHTML = `<option value="">-- リストから選択 --</option>`;
        videoList.forEach(video => {
            const opt = document.createElement("option");
            opt.value = video.id;
            opt.textContent = `${video.name}（${video.url}）`;
            videoSelect.appendChild(opt);
        });
    }

    function refreshAlarmHistory() {
        alarmHistoryListElement.innerHTML = "";
        alarmHistoryList.forEach((entry, index) => {
            const li = document.createElement("li");
            li.innerHTML = `⏰ ${entry.time} - ${entry.name} <button data-index="${index}">削除</button>`;
            li.addEventListener("click", e => {
                if (e.target.tagName === "BUTTON") return;
                const [d, t] = entry.time.split(" ");
                const [h, m] = t.split(":");
                alarmDateInput.value = d;
                hourRange.value = parseInt(h);
                minuteRange.value = parseInt(m);
                updateTimeDisplay();
                const video = videoList.find(v => v.name === entry.name);
                if (video) videoSelect.value = video.id;
            });
            alarmHistoryListElement.appendChild(li);
        });
        document.querySelectorAll("#alarmHistory button").forEach(btn => {
            btn.addEventListener("click", e => {
                const idx = Number(e.target.dataset.index);
                alarmHistoryList.splice(idx, 1);
                saveAlarmHistory();
                refreshAlarmHistory();
            });
        });
    }

    addToListBtn.addEventListener("click", () => {
        const url = youtubeUrlInput.value.trim();
        const name = youtubeNameInput.value.trim();
        const id = extractYouTubeID(url);
        if (!id) return alert("YouTubeリンクが無効です");
        if (!name) return alert("名前を入力してください");
        if (videoList.some(v => v.id === id)) return alert("すでに登録済みです");
        videoList.push({ id, url: `https://youtu.be/${id}`, name });
        saveToLocalStorage();
        refreshVideoSelect();
        youtubeNameInput.value = youtubeUrlInput.value = "";
    });

    deleteVideoBtn.addEventListener("click", () => {
        const selectedID = videoSelect.value;
        if (!selectedID) return alert("動画を選択してください");
        videoList = videoList.filter(v => v.id !== selectedID);
        saveToLocalStorage();
        refreshVideoSelect();
    });

    setAlarmBtn.addEventListener("click", () => {
        const date = alarmDateInput.value;
        const h = pad(hourRange.value);
        const m = pad(minuteRange.value);
        const id = videoSelect.value;
        if (!id || !date) return alert("日付と動画を設定してください");
        alarmTime = `${date}T${h}:${m}`;
        alarmVideoID = id;
        alarmFired = false;
        const name = videoSelect.selectedOptions[0].textContent.split("（")[0];
        alarmHistoryList.unshift({ time: `${date} ${h}:${m}`, name });
        saveAlarmHistory();
        refreshAlarmHistory();
        alert(`アラームをセットしました：${date} ${h}:${m}`);
    });

    setRelativeAlarmBtn.addEventListener("click", () => {
        const h = parseInt(afterHoursInput.value), m = parseInt(afterMinutesInput.value);
        const id = videoSelect.value;
        if (!id || (h === 0 && m === 0)) return alert("動画と時間を設定してください");
        const now = new Date();
        const target = new Date(now.getTime() + (h * 60 + m) * 60000);
        const date = target.toISOString().slice(0, 10);
        const hh = pad(target.getHours()), mm = pad(target.getMinutes());
        alarmTime = `${date}T${hh}:${mm}`;
        alarmVideoID = id;
        alarmFired = false;
        const name = videoSelect.selectedOptions[0].textContent.split("（")[0];
        alarmHistoryList.unshift({ time: `${date} ${hh}:${mm}`, name });
        saveAlarmHistory();
        refreshAlarmHistory();
        alert(`時間後アラームをセットしました：${date} ${hh}:${mm}`);
    });

    stopAlarmBtn.addEventListener("click", () => {
        youtubePlayer.src = "";
        videoContainer.style.display = "none";
        snoozeAlarmBtn.style.display = "none";
        alarmTime = null;
        alarmVideoID = null;
    });

    snoozeAlarmBtn.addEventListener("click", () => {
        youtubePlayer.src = "";
        videoContainer.style.display = "none";
        const snoozeTime = new Date(Date.now() + 5 * 60 * 1000);
        const date = snoozeTime.toISOString().slice(0, 10);
        const h = pad(snoozeTime.getHours()), m = pad(snoozeTime.getMinutes());
        alarmTime = `${date}T${h}:${m}`;
        alarmFired = false;
        alert("スヌーズ：5分後に再再生します");
    });

    setInterval(() => {
        updateDateTime();
        const now = new Date();
        if (alarmTime && !alarmFired && Math.abs(new Date(alarmTime) - now) < 1000) {
            youtubePlayer.src = `https://www.youtube.com/embed/${alarmVideoID}?autoplay=1`;
            videoContainer.style.display = "block";
            snoozeAlarmBtn.style.display = "inline-block";
            alarmFired = true;
        }
    }, 1000);

    currentTimeDisplay.addEventListener("click", () => {
        const input = prompt("HH:MM を入力してください", currentTimeDisplay.textContent);
        if (input && /^\d{1,2}:\d{2}$/.test(input)) {
            const [h, m] = input.split(":").map(Number);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                hourRange.value = h;
                minuteRange.value = m;
                updateTimeDisplay();
            }
        }
    });

    toggleVideoSaveBtn.addEventListener("click", () => {
        const show = videoSaveSection.style.display === "none";
        videoSaveSection.style.display = show ? "block" : "none";
        toggleVideoSaveBtn.textContent = show ? "▲ 動画を保存" : "▶ 動画を保存";
    });

    toggleRelativeAlarmBtn.addEventListener("click", () => {
        const show = relativeAlarmSection.style.display === "none";
        relativeAlarmSection.style.display = show ? "block" : "none";
        toggleRelativeAlarmBtn.textContent = show ? "▲ 時間後アラームを設定する" : "▶ 時間後アラームを設定する";
    });

    hourRange.addEventListener("input", updateTimeDisplay);
    minuteRange.addEventListener("input", updateTimeDisplay);

    updateTimeDisplay();
    alarmDateInput.value = new Date().toISOString().slice(0, 10);
    loadFromLocalStorage();
    loadAlarmHistory();
    updateDateTime();
    snoozeAlarmBtn.style.display = "none";
});
