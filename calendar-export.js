// Calendar Export Feature
// Zoe Droulias

// take JS Date obj, return ics-formatted string
function formatDateToICS(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');

    return `${y}${m}${d}${h}${mi}${s}Z`;
}

// draft function for calendar export... still a few things to iron out
function generateICS(appointment) {
    const invite = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//YourAppName//EN
BEGIN:VEVENT
UID:${appointment.id}
DTSTAMP:${formatDateToICS(new Date())}
DTSTART:${formatDateToICS(appointment.start)}
DTEND:${formatDateToICS(appointment.end)}
SUMMARY:${appointment.title}
DESCRIPTION:
END:VEVENT
END:VCALENDAR`;

    return invite;
}