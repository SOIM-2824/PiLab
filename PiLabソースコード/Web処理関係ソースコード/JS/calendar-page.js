// ================= Calendar Page JavaScript =================

// Initialize calendar page
document.addEventListener('DOMContentLoaded', function() {
    initCalendarPage();
});

function initCalendarPage() {
    // Load login streak
    updateLoginStreak();
    
    // Load mini login calendar
    renderMiniLoginCalendar();
    
    // Add event listener for event form
    const addEventBtn = document.getElementById('add-event-btn');
    if (addEventBtn) {
        addEventBtn.addEventListener('click', addNewEvent);
    }
    
    // Load today's schedule by default
    loadScheduleForDate(new Date());
    
    // Add click handlers for calendar days
    setTimeout(attachDayClickHandlers, 1000);
}

// ================= Login Streak =================

function updateLoginStreak() {
    const streakEl = document.getElementById('streak-count');
    if (!streakEl) return;
    
    // Load login dates from localStorage or JSON
    let loginDates = [];
    try {
        const stored = localStorage.getItem('loginDates');
        if (stored) {
            loginDates = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load login dates:', e);
    }
    
    // Calculate streak
    const streak = calculateStreak(loginDates);
    streakEl.textContent = streak;
}

function calculateStreak(loginDates) {
    if (!loginDates || loginDates.length === 0) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Sort dates in descending order
    const sortedDates = loginDates
        .map(d => new Date(d))
        .sort((a, b) => b - a);
    
    let streak = 0;
    let checkDate = new Date(today);
    
    for (let i = 0; i < sortedDates.length; i++) {
        const loginDate = new Date(sortedDates[i]);
        loginDate.setHours(0, 0, 0, 0);
        
        if (loginDate.getTime() === checkDate.getTime()) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else if (loginDate.getTime() < checkDate.getTime()) {
            break;
        }
    }
    
    return streak;
}

// ================= Mini Login Calendar =================

function renderMiniLoginCalendar() {
    const container = document.getElementById('login-mini-calendar');
    if (!container) return;
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    // Load login dates
    let loginDates = [];
    try {
        const stored = localStorage.getItem('loginDates');
        if (stored) {
            loginDates = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load login dates:', e);
    }
    
    // Build mini calendar
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    
    let html = '';
    
    // Day headers
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    days.forEach(d => {
        html += `<div class="login-day" style="font-size:9px;background:transparent;">${d}</div>`;
    });
    
    // Empty cells before first day
    for (let i = 0; i < startPadding; i++) {
        html += '<div class="login-day" style="opacity:0;"></div>';
    }
    
    // Days of month
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isLogged = loginDates.includes(dateStr);
        const isToday = day === today.getDate();
        
        let classes = 'login-day';
        if (isLogged) classes += ' logged';
        if (isToday) classes += ' today';
        
        html += `<div class="${classes}">${day}</div>`;
    }
    
    container.innerHTML = html;
}

// ================= Schedule Display =================

let selectedDate = new Date();
let localEvents = [];

// Load local events from localStorage
function loadLocalEvents() {
    try {
        const stored = localStorage.getItem('localEvents');
        if (stored) {
            localEvents = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load local events:', e);
        localEvents = [];
    }
}

function saveLocalEvents() {
    try {
        localStorage.setItem('localEvents', JSON.stringify(localEvents));
    } catch (e) {
        console.error('Failed to save local events:', e);
    }
}

function loadScheduleForDate(date) {
    selectedDate = date;
    loadLocalEvents();
    
    // Update header
    const headerEl = document.getElementById('selected-date-title');
    if (headerEl) {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
        headerEl.textContent = `${month}月${day}日（${dayOfWeek}）の予定`;
    }
    
    // Set date input
    const timeInput = document.getElementById('event-time');
    if (timeInput) {
        timeInput.value = '09:00';
    }
    
    // Display events
    displayScheduleItems(date);
}

function displayScheduleItems(date) {
    const listEl = document.getElementById('schedule-list');
    if (!listEl) return;
    
    const dateStr = formatDateKey(date);
    
    // Get local events for this date
    const localDayEvents = localEvents.filter(e => e.date === dateStr);
    
    // Get Google Calendar events if available
    // Format: CAL_EVENTS_BY_DATE[year][ymKey][dStr] where dStr is "YYYY-M-D"
    let gcalEvents = [];
    if (typeof CAL_EVENTS_BY_DATE !== 'undefined') {
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-indexed
        const ymKey = `${year}-${month}`;
        const dStr = `${year}-${month + 1}-${date.getDate()}`; // Format: "2025-9-6"
        
        if (CAL_EVENTS_BY_DATE[year] && CAL_EVENTS_BY_DATE[year][ymKey] && CAL_EVENTS_BY_DATE[year][ymKey][dStr]) {
            gcalEvents = CAL_EVENTS_BY_DATE[year][ymKey][dStr].map(e => ({
                title: e.title,
                time: e.allDay ? '' : (e.start ? new Date(e.start).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : ''),
                desc: e.allDay ? '終日' : '',
                isGcal: true
            }));
        }
    }
    
    // Combine all events
    const allEvents = [...gcalEvents, ...localDayEvents];
    
    if (allEvents.length === 0) {
        listEl.innerHTML = '<div class="no-schedule">この日の予定はありません</div>';
        return;
    }
    
    // Sort by time
    allEvents.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    
    let html = '';
    allEvents.forEach((event, index) => {
        const isGcal = event.isGcal;
        const badge = isGcal ? '<span style="font-size:10px;background:rgba(66,133,244,0.3);padding:2px 6px;border-radius:4px;margin-left:8px;">Google</span>' : '';
        html += `
            <div class="schedule-item">
                <div class="schedule-item-time">${event.time || '終日'}${badge}</div>
                <div class="schedule-item-title">${escapeHtml(event.title)}</div>
                ${event.desc ? `<div class="schedule-item-desc">${escapeHtml(event.desc)}</div>` : ''}
                ${!isGcal ? `<button onclick="deleteEvent(${index})" style="margin-top:8px;padding:4px 8px;font-size:11px;background:rgba(255,100,100,0.3);border:none;border-radius:4px;color:#fff;cursor:pointer;">削除</button>` : ''}
            </div>
        `;
    });
    
    listEl.innerHTML = html;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================= Add/Delete Events =================

function addNewEvent() {
    const titleInput = document.getElementById('event-title');
    const timeInput = document.getElementById('event-time');
    const descInput = document.getElementById('event-desc');
    
    const title = titleInput.value.trim();
    if (!title) {
        alert('タイトルを入力してください');
        return;
    }
    
    const newEvent = {
        date: formatDateKey(selectedDate),
        title: title,
        time: timeInput.value || '',
        desc: descInput.value.trim()
    };
    
    loadLocalEvents();
    localEvents.push(newEvent);
    saveLocalEvents();
    
    // Clear form
    titleInput.value = '';
    descInput.value = '';
    
    // Refresh display
    displayScheduleItems(selectedDate);
    
    alert('予定を追加しました！');
}

function deleteEvent(index) {
    if (!confirm('この予定を削除しますか？')) return;
    
    loadLocalEvents();
    const dateStr = formatDateKey(selectedDate);
    const dayEvents = localEvents.filter(e => e.date === dateStr);
    
    if (index >= 0 && index < dayEvents.length) {
        const eventToDelete = dayEvents[index];
        localEvents = localEvents.filter(e => 
            !(e.date === eventToDelete.date && 
              e.title === eventToDelete.title && 
              e.time === eventToDelete.time)
        );
        saveLocalEvents();
        displayScheduleItems(selectedDate);
    }
}

// ================= Calendar Day Click Handlers =================

function attachDayClickHandlers() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    calendarEl.addEventListener('click', function(e) {
        const dayEl = e.target.closest('.day');
        if (!dayEl) return;
        
        const dateNum = dayEl.querySelector('.date-number');
        const scheduleEl = dayEl.querySelector('.schedule');
        if (!dateNum) return;
        
        const dayText = dateNum.textContent.trim().split('\n')[0];
        const day = parseInt(dayText, 10);
        if (isNaN(day)) return;
        
        // Get current displayed month
        const monthText = document.getElementById('current-month').textContent;
        const match = monthText.match(/(\d+)年(\d+)月/);
        if (!match) return;
        
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][new Date(year, month - 1, day).getDay()];
        
        // Update header
        const headerEl = document.getElementById('selected-date-title');
        if (headerEl) {
            headerEl.textContent = `${month}月${day}日（${dayOfWeek}）の予定`;
        }
        
        // Get schedule content directly from the calendar cell
        const listEl = document.getElementById('schedule-list');
        if (listEl && scheduleEl) {
            const scheduleContent = scheduleEl.innerHTML.trim();
            const scheduleText = scheduleEl.textContent.trim();
            
            if (scheduleText === '予定なし' || scheduleText === '') {
                listEl.innerHTML = '<div class="no-schedule">この日の予定はありません</div>';
            } else {
                // Display the events from the calendar cell
                listEl.innerHTML = '<div class="schedule-display">' + scheduleContent + '</div>';
            }
        }
        
        // Highlight selected day
        document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
        dayEl.classList.add('selected');
    });
}
