const DAYS = 14;
let calendar = [];
let data = {
    currentDay: 0,
    lastLoginDay: -1,
    missedDays: 0,
    finished: false,
    lastLoginDate: null,
    cells: Array(DAYS).fill(null) // 各マスの状態 {checked, missed}
};

const calendarEl = document.getElementById("calendar");
const statusEl = document.getElementById("status");

function createCalendar() {
    calendarEl.innerHTML = "";
    calendar = [];
    for (let i = 0; i < DAYS; i++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.textContent = i + 1;
        calendarEl.appendChild(cell);
        calendar.push(cell);
    }
}

function updateCalendar() {
    calendar.forEach((cell, i) => {
        cell.className = "cell";
        const state = data.cells[i];
        if (!state) return;
        if (state.checked) cell.classList.add("checked");
        if (state.missed) cell.classList.add("missed");
    });
    saveData();
}

function saveData() {
    localStorage.setItem("loginBonusData", JSON.stringify(data));
}

function loadData() {
    const stored = localStorage.getItem("loginBonusData");
    if (stored) {
        data = JSON.parse(stored);


        const today = new Date();
        const last = data.lastLoginDate ? new Date(data.lastLoginDate) : null;

        if (last) {
            // 経過日数を計算（UTC換算で1日単位）
            const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

            if (diffDays > 0 && !data.finished) {
                // 経過した日数分、currentDayを進める
                data.currentDay += diffDays;
                if (data.currentDay >= DAYS) {
                    data.currentDay = DAYS - 1;
                }
            }
        }
    }
}


function login() {
    const today = new Date().toDateString();

    // 14日完了後、次ログインでリセット
    if (data.finished) {
        resetCalendar();
        data.finished = false;
        data.cells[0] = { checked: true, missed: false };
        data.currentDay = 0;
        data.lastLoginDay = 0;
        data.lastLoginDate = today;
        updateCalendar();
        statusEl.textContent = "新しいログインサイクルを開始しました！";
        return;
    }

    // 同じ日に複数回ログイン防止
    if (data.lastLoginDate === today) {
        statusEl.textContent = "今日はすでにログイン済みです。";
        return;
    }

    // 前回ログイン日からの経過日数を計算
    let diff = data.currentDay - data.lastLoginDay - 1;
    if (diff < 0) diff = 0;

    // 未ログイン日マーク
    for (let i = data.lastLoginDay + 1; i < data.currentDay; i++) {
        if (i >= 0 && i < DAYS) {
            data.cells[i] = { checked: false, missed: true };
        }
    }

    // 今日のログインをマーク
    if (data.currentDay < DAYS) {
        data.cells[data.currentDay] = { checked: true, missed: false };
        statusEl.textContent = `ログイン完了！（${data.currentDay + 1}日目） 未ログイン：${diff}日`;
    }

    data.missedDays += diff;
    data.lastLoginDay = data.currentDay;
    data.lastLoginDate = today;
    updateCalendar();

    // 14日目完了
    if (data.currentDay === DAYS - 1) {
        data.finished = true;
        statusEl.textContent = "14日目ログイン完了！ 次回ログイン時にリセットされます。";
    }
}

function nextDay() {
    data.currentDay++;
    if (data.currentDay >= DAYS) {
        data.currentDay = DAYS - 1;
        statusEl.textContent = "14日目以降です。次回ログインでリセットされます。";
        return;
    }
    statusEl.textContent = `翌日に進みました（現在：${data.currentDay + 1}日目）`;
    saveData();
}

function resetCalendar() {
    data = {
        currentDay: 0,
        lastLoginDay: -1,
        missedDays: 0,
        finished: false,
        lastLoginDate: null,
        cells: Array(DAYS).fill(null)
    };
    updateCalendar();
    saveData();
    statusEl.textContent = "カレンダーをリセットしました。";
}


createCalendar();
loadData();
updateCalendar();

document.getElementById("loginBtn").addEventListener("click", login);

